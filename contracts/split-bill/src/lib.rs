#![no_std]
//! SplitBill — grup hesabını zincir üzerinde takip eden Soroban kontratı.
//!
//! Akış:
//!   1. Organizatör `create_split` ile kimin ne kadar borçlu olduğunu zincire yazar.
//!   2. Her katılımcı `pay_share` çağırır; kontrat parayı katılımcıdan organizatöre aktarır,
//!      payı "ödendi" olarak işaretler ve bir event yayınlar.
//!   3. Arayüz `get_split` ile durumu okur, eventleri dinleyerek canlı günceller.
//!
//! Neden zincirde? Kim ödedi/kim ödemedi bilgisi tek bir kişinin telefonunda değil, herkesin
//! doğrulayabileceği ortak bir kayıtta durur. Ödeme ile kayıt aynı işlemde olur — biri olup
//! diğeri olmaz durumu oluşmaz.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env, String,
    Vec,
};

/// Kayıtların ledger'da yaşaması için TTL uzatma miktarı (~30 gün civarı ledger).
const BUMP_AMOUNT: u32 = 518_400;
const LIFETIME_THRESHOLD: u32 = BUMP_AMOUNT - 17_280;

#[contracttype]
#[derive(Clone)]
pub struct Share {
    pub who: Address,
    pub amount: i128,
    pub paid: bool,
}

#[contracttype]
#[derive(Clone)]
pub struct Split {
    pub id: u32,
    pub organizer: Address,
    /// Ödemenin yapılacağı token (native XLM için Stellar Asset Contract adresi).
    pub token: Address,
    pub memo: String,
    pub total: i128,
    pub collected: i128,
    pub shares: Vec<Share>,
}

#[contracttype]
pub enum DataKey {
    /// Bir sonraki split id'si
    Counter,
    /// id → Split
    Split(u32),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// Böyle bir split yok
    SplitNotFound = 1,
    /// Çağıran kişi bu hesabın katılımcısı değil
    NotAParticipant = 2,
    /// Bu kişi payını zaten ödedi
    AlreadyPaid = 3,
    /// Tutar sıfır veya negatif
    InvalidAmount = 4,
    /// Katılımcı listesi boş ya da tutarlarla eşleşmiyor
    InvalidParticipants = 5,
}

#[contract]
pub struct SplitBill;

#[contractimpl]
impl SplitBill {
    /// Yeni bir hesap paylaşımı oluşturur ve id'sini döndürür.
    ///
    /// `participants` ve `amounts` aynı uzunlukta olmalıdır: i'inci kişi i'inci tutarı borçludur.
    pub fn create_split(
        env: Env,
        organizer: Address,
        token: Address,
        memo: String,
        participants: Vec<Address>,
        amounts: Vec<i128>,
    ) -> Result<u32, Error> {
        organizer.require_auth();

        if participants.len() == 0 || participants.len() != amounts.len() {
            return Err(Error::InvalidParticipants);
        }

        let mut shares: Vec<Share> = Vec::new(&env);
        let mut total: i128 = 0;

        for i in 0..participants.len() {
            let amount = amounts.get(i).unwrap();
            if amount <= 0 {
                return Err(Error::InvalidAmount);
            }
            total += amount;
            shares.push_back(Share {
                who: participants.get(i).unwrap(),
                amount,
                paid: false,
            });
        }

        let id = Self::next_id(&env);
        let split = Split {
            id,
            organizer: organizer.clone(),
            token,
            memo,
            total,
            collected: 0,
            shares,
        };

        Self::save(&env, &split);

        // Arayüzün canlı yakalayabilmesi için event yayınla.
        env.events()
            .publish((symbol_short!("split"), symbol_short!("created")), (id, organizer, total));

        Ok(id)
    }

    /// Çağıranın payını organizatöre aktarır ve ödendi olarak işaretler.
    /// Ödenen tutarı döndürür.
    pub fn pay_share(env: Env, split_id: u32, from: Address) -> Result<i128, Error> {
        // Parayı ancak sahibi harcayabilir.
        from.require_auth();

        let mut split = Self::load(&env, split_id)?;

        // Katılımcıyı bul.
        let mut index: Option<u32> = None;
        for i in 0..split.shares.len() {
            if split.shares.get(i).unwrap().who == from {
                index = Some(i);
                break;
            }
        }
        let index = index.ok_or(Error::NotAParticipant)?;

        let mut share = split.shares.get(index).unwrap();
        if share.paid {
            return Err(Error::AlreadyPaid);
        }

        // Önce para hareketi, sonra kayıt: transfer başarısız olursa işlem tamamen geri alınır.
        token::Client::new(&env, &split.token).transfer(&from, &split.organizer, &share.amount);

        share.paid = true;
        let amount = share.amount;
        split.shares.set(index, share);
        split.collected += amount;

        let completed = split.collected >= split.total;
        Self::save(&env, &split);

        env.events().publish(
            (symbol_short!("share"), symbol_short!("paid")),
            (split_id, from, amount, split.collected),
        );

        if completed {
            env.events().publish(
                (symbol_short!("split"), symbol_short!("done")),
                (split_id, split.total),
            );
        }

        Ok(amount)
    }

    /// Bir hesabın güncel durumunu döndürür (kim ödedi, ne kadar toplandı).
    pub fn get_split(env: Env, split_id: u32) -> Result<Split, Error> {
        Self::load(&env, split_id)
    }

    /// Şimdiye kadar oluşturulmuş hesap sayısı.
    pub fn splits_count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Counter).unwrap_or(0)
    }

    // --- yardımcılar ---

    fn next_id(env: &Env) -> u32 {
        let id: u32 = env.storage().instance().get(&DataKey::Counter).unwrap_or(0) + 1;
        env.storage().instance().set(&DataKey::Counter, &id);
        env.storage()
            .instance()
            .extend_ttl(LIFETIME_THRESHOLD, BUMP_AMOUNT);
        id
    }

    fn load(env: &Env, split_id: u32) -> Result<Split, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Split(split_id))
            .ok_or(Error::SplitNotFound)
    }

    fn save(env: &Env, split: &Split) {
        let key = DataKey::Split(split.id);
        env.storage().persistent().set(&key, split);
        // Kayıt arşive düşüp okunamaz hale gelmesin.
        env.storage()
            .persistent()
            .extend_ttl(&key, LIFETIME_THRESHOLD, BUMP_AMOUNT);
    }
}

mod test;
