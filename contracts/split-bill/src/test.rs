#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Events},
    token::{StellarAssetClient, TokenClient},
    vec, Address, Env, String,
};

/// Test ortamı: bir token, bir organizatör ve iki katılımcı kurar.
struct Setup {
    env: Env,
    contract: SplitBillClient<'static>,
    token: TokenClient<'static>,
    organizer: Address,
    ali: Address,
    zeynep: Address,
}

fn setup() -> Setup {
    let env = Env::default();
    env.mock_all_auths();

    let organizer = Address::generate(&env);
    let ali = Address::generate(&env);
    let zeynep = Address::generate(&env);

    // Test için bir Stellar Asset Contract (native XLM'in test karşılığı) oluştur.
    let issuer = Address::generate(&env);
    let asset = env.register_stellar_asset_contract_v2(issuer);
    let token = TokenClient::new(&env, &asset.address());
    let minter = StellarAssetClient::new(&env, &asset.address());
    minter.mint(&ali, &1_000);
    minter.mint(&zeynep, &1_000);

    let contract_id = env.register(SplitBill, ());
    let contract = SplitBillClient::new(&env, &contract_id);

    Setup { env, contract, token, organizer, ali, zeynep }
}

#[test]
fn create_split_stores_shares_and_total() {
    let s = setup();
    let id = s.contract.create_split(
        &s.organizer,
        &s.token.address,
        &String::from_str(&s.env, "Meyhane"),
        &vec![&s.env, s.ali.clone(), s.zeynep.clone()],
        &vec![&s.env, 300_i128, 200_i128],
    );

    let split = s.contract.get_split(&id);
    assert_eq!(id, 1);
    assert_eq!(split.total, 500);
    assert_eq!(split.collected, 0);
    assert_eq!(split.shares.len(), 2);
    assert_eq!(split.shares.get(0).unwrap().paid, false);
    assert_eq!(s.contract.splits_count(), 1);
}

#[test]
fn pay_share_moves_money_and_marks_paid() {
    let s = setup();
    let id = s.contract.create_split(
        &s.organizer,
        &s.token.address,
        &String::from_str(&s.env, "Meyhane"),
        &vec![&s.env, s.ali.clone(), s.zeynep.clone()],
        &vec![&s.env, 300_i128, 200_i128],
    );

    let paid = s.contract.pay_share(&id, &s.ali);

    assert_eq!(paid, 300);
    assert_eq!(s.token.balance(&s.ali), 700); // 1000 - 300
    assert_eq!(s.token.balance(&s.organizer), 300);

    let split = s.contract.get_split(&id);
    assert_eq!(split.collected, 300);
    assert_eq!(split.shares.get(0).unwrap().paid, true);
    assert_eq!(split.shares.get(1).unwrap().paid, false);
}

#[test]
fn events_are_published_for_creation_and_payment() {
    let s = setup();
    let id = s.contract.create_split(
        &s.organizer,
        &s.token.address,
        &String::from_str(&s.env, "Meyhane"),
        &vec![&s.env, s.ali.clone()],
        &vec![&s.env, 300_i128],
    );
    s.contract.pay_share(&id, &s.ali);

    // created + paid + done → en az 3 event yayınlanmalı
    let published = s.env.events().all();
    let count = published.events().len();
    assert!(count >= 3, "beklenen eventler yayınlanmadı: {count}");
}

#[test]
fn cannot_pay_twice() {
    let s = setup();
    let id = s.contract.create_split(
        &s.organizer,
        &s.token.address,
        &String::from_str(&s.env, "Meyhane"),
        &vec![&s.env, s.ali.clone()],
        &vec![&s.env, 300_i128],
    );
    s.contract.pay_share(&id, &s.ali);

    let result = s.contract.try_pay_share(&id, &s.ali);
    assert_eq!(result, Err(Ok(Error::AlreadyPaid)));
}

#[test]
fn stranger_cannot_pay() {
    let s = setup();
    let stranger = Address::generate(&s.env);
    let id = s.contract.create_split(
        &s.organizer,
        &s.token.address,
        &String::from_str(&s.env, "Meyhane"),
        &vec![&s.env, s.ali.clone()],
        &vec![&s.env, 300_i128],
    );

    let result = s.contract.try_pay_share(&id, &stranger);
    assert_eq!(result, Err(Ok(Error::NotAParticipant)));
}

#[test]
fn unknown_split_is_rejected() {
    let s = setup();
    let result = s.contract.try_get_split(&42);
    assert_eq!(result, Err(Ok(Error::SplitNotFound)));
}

#[test]
fn invalid_input_is_rejected() {
    let s = setup();
    let memo = String::from_str(&s.env, "x");

    // Katılımcı sayısı ile tutar sayısı uyuşmuyor
    let mismatch = s.contract.try_create_split(
        &s.organizer,
        &s.token.address,
        &memo,
        &vec![&s.env, s.ali.clone()],
        &vec![&s.env, 100_i128, 200_i128],
    );
    assert_eq!(mismatch, Err(Ok(Error::InvalidParticipants)));

    // Sıfır tutar
    let zero = s.contract.try_create_split(
        &s.organizer,
        &s.token.address,
        &memo,
        &vec![&s.env, s.ali.clone()],
        &vec![&s.env, 0_i128],
    );
    assert_eq!(zero, Err(Ok(Error::InvalidAmount)));
}
