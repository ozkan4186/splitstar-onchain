# ✦ SplitStar On-Chain — Soroban ile hesap paylaşımı

**Level 2 · 🟡 Yellow Belt** — Stellar Journey to Mastery

Grup hesabının kim ne kadar borçlu olduğu bir **Soroban akıllı kontratında** tutulur. Katılımcı
payını öderken **para transferi ve kayıt aynı işlemde** gerçekleşir; arayüz kontrat eventlerini
dinleyerek durumu **canlı** günceller.

> 🇬🇧 *Group bill splitting backed by a Soroban smart contract on Stellar Testnet: shares are stored
> on-chain, paying a share transfers XLM and records it atomically, and the UI live-updates from
> contract events. Multi-wallet support via StellarWalletsKit.*

---

## 🎯 Level 2 gereksinimleri — nerede karşılanıyor?

| Gereksinim | Durum | Nerede |
|---|---|---|
| **StellarWalletsKit** (çoklu cüzdan) | ✅ Freighter, xBull, Albedo, Rabet, Lobstr, Hana… | [`src/lib/wallet.js`](src/lib/wallet.js) |
| **3+ hata tipi** | ✅ **7 sınıf**: cüzdan yok · imza reddi · yetersiz bakiye · kontrat kuralı · hesap yok · ağ · bilinmeyen | [`src/lib/errors.js`](src/lib/errors.js) |
| **Testnet'e deploy edilmiş kontrat** | ✅ adres aşağıda | [`contracts/split-bill/`](contracts/split-bill/src/lib.rs) |
| **Frontend'den kontrat çağrısı** | ✅ okuma (`get_split`) + yazma (`create_split`, `pay_share`) | [`src/lib/soroban.js`](src/lib/soroban.js) |
| **İşlem durumu görünür** | ✅ simüle → imza → gönderim → onay → başarı/hata + tx hash | [`src/components/TxStatus.jsx`](src/components/TxStatus.jsx) |
| **Event dinleme / canlı senkron** | ✅ RPC `getEvents` ile 6 sn'de bir, yeni event gelince durum tazelenir | [`src/hooks/useSplit.js`](src/hooks/useSplit.js) |
| **2+ anlamlı commit** | ✅ commit geçmişine bakınız | — |

---

## 📜 Deploy edilen kontrat

| | |
|---|---|
| **Ağ** | Stellar Testnet |
| **Kontrat adresi** | `CCXCILUW5ID4DNW2MC7V7HVG2NEJS7TR6WGEH4ZEFMJH34DQTAPOFGXH` |
| **Explorer** | [stellar.expert](https://stellar.expert/explorer/testnet/contract/CCXCILUW5ID4DNW2MC7V7HVG2NEJS7TR6WGEH4ZEFMJH34DQTAPOFGXH) |
| **Wasm hash** | `880042593207a80e05d85d7da88fc6bb4549c0333f83ffb8ebb23c36fab0944f` |
| **Deploy işlemi** | [6242ad9bd4dd4861…](https://stellar.expert/explorer/testnet/tx/6242ad9bd4dd4861e21947e72aade1ad97c1d8fa45c07fe496854d480391a9ab) |

### Örnek kontrat çağrısı (doğrulanabilir)

| Çağrı | İşlem hash'i |
|---|---|
| `create_split` | [5ced6daa01402d20…](https://stellar.expert/explorer/testnet/tx/5ced6daa01402d20a160ecc0e7215e88d851067c615d432af3b3bde1492e07d9) |
| `pay_share` | [510c8130436d11df…](https://stellar.expert/explorer/testnet/tx/510c8130436d11dfd80bc2781d039660c26bbb069090f80c8c5c44a8e31c55cb) |

---

## 🧠 Kontrat ne yapıyor?

[`contracts/split-bill/src/lib.rs`](contracts/split-bill/src/lib.rs) — Rust / soroban-sdk 27

```rust
create_split(organizer, token, memo, participants, amounts) -> u32   // hesabı zincire yazar
pay_share(split_id, from) -> i128                                    // payı öder + kaydeder
get_split(split_id) -> Split                                         // güncel durumu okur
splits_count() -> u32
```

**Yayınlanan eventler:** `split/created` · `share/paid` · `split/done`

**Kontrat hataları** (arayüz bunları Türkçe mesaja çevirir):

| # | Anlamı |
|---|---|
| 1 | `SplitNotFound` — böyle bir hesap yok |
| 2 | `NotAParticipant` — çağıran kişi katılımcı değil |
| 3 | `AlreadyPaid` — bu pay zaten ödendi |
| 4 | `InvalidAmount` — tutar sıfır/negatif |
| 5 | `InvalidParticipants` — kişi ve tutar sayısı uyuşmuyor |

**Neden zincirde?** "Kim ödedi?" bilgisi tek kişinin telefonunda değil, herkesin doğrulayabileceği
ortak bir kayıtta durur. Ödeme ile kayıt tek işlemde olduğu için "para gitti ama kayıt düşmedi"
durumu oluşamaz — transfer başarısız olursa işlemin tamamı geri alınır.

---

## 🛠️ Teknolojiler

- **Kontrat:** Rust + `soroban-sdk 27` (Docker içindeki resmi Rust imajıyla derlenir)
- **Frontend:** React 18 + Vite
- **Cüzdan:** `@creit.tech/stellar-wallets-kit` (çoklu cüzdan)
- **Zincir erişimi:** `@stellar/stellar-sdk` — Soroban RPC (simülasyon, gönderim, event)
- **Ağ:** Stellar Testnet · Soroban RPC `https://soroban-testnet.stellar.org`

---

## 🚀 Kurulum

### Gereksinimler
- Node.js 18+
- Bir Stellar cüzdanı (Freighter / xBull / Albedo / Rabet…) → ağ: **Testnet**
- Kontratı **kendin derleyip deploy edeceksen**: Docker (Rust kurmana gerek yok)

```bash
git clone https://github.com/ozkan4186/splitstar-onchain.git
cd splitstar-onchain
npm install
npm run dev            # http://localhost:5173
```

Depodaki `src/contract.json` zaten yayındaki kontratı gösterir — sadece arayüzü çalıştırmak için
deploy gerekmez.

### Kontratı yeniden derlemek / deploy etmek

```bash
npm run contract:build     # Docker içinde wasm derler → contracts/out/split_bill.wasm
npm run contract:deploy    # Testnet'e yükler, src/contract.json'u günceller
```

`contract:deploy` ilk çalıştırmada **tek kullanımlık bir testnet anahtarı** üretip Friendbot ile
fonlar ve `.env` dosyasına yazar (`.env` git'e girmez). Kendi cüzdanının gizli anahtarını buraya
yazmana gerek yoktur ve yazılmamalıdır.

### Kontrat testleri

```bash
docker run --rm -v "//c/Projects/splitstar-onchain://work" -w //work rust:1-bookworm cargo test
```

7 birim test: kayıt tutma, para transferi, event yayını, çift ödeme engeli, yabancı ödeme engeli,
bilinmeyen hesap, geçersiz girdi.

---

## 📖 Nasıl kullanılır?

1. **Cüzdan Bağla** → modaldan cüzdanını seç (kurulu olanlar işaretli gelir).
2. Bakiyen yoksa **🚰 Fonla** (Friendbot).
3. **Yeni hesap oluştur:** açıklama + katılımcı adresleri ve payları → *Kontrata yaz*.
   Cüzdan imza ister; işlem durumu adım adım görünür ve sonunda hesap numarası çıkar.
4. **Hesabı görüntüle:** numarayı gir → *Getir*. Zincirdeki güncel durum, ilerleme çubuğu ve kimin
   ödediği listelenir.
5. **Payımı öde:** katılımcıysan tek tıkla ödersin — kontrat XLM'i organizatöre aktarır, payını
   ödendi işaretler ve event yayınlar.
6. **Canlı akış:** sol alttaki panel kontratın eventlerini saniyeler içinde gösterir; başka biri
   ödeme yaptığında ilerleme çubuğu kendiliğinden ilerler.

Bir hesabı paylaşmak için adrese `?split=<numara>` ekleyebilirsin.

---

## 📸 Ekran görüntüleri

| Cüzdan seçenekleri (StellarWalletsKit) | Kontrat durumu ve ödeme |
|---|---|
| ![Cüzdan seçenekleri](docs/screenshots/1-wallets.png) | ![Hesap durumu](docs/screenshots/2-split.png) |

| İşlem durumu takibi | Canlı event akışı |
|---|---|
| ![İşlem durumu](docs/screenshots/3-tx-status.png) | ![Event akışı](docs/screenshots/4-events.png) |

---

## 🌐 Canlı demo

**<LIVE_URL>**

---

## 🗂️ Proje yapısı

```
contracts/split-bill/src/
  lib.rs               # Soroban kontratı
  test.rs              # 7 birim test
scripts/
  build-contract.mjs   # Docker ile wasm derleme
  deploy.mjs           # Testnet'e yükleme + kontrat oluşturma
src/
  lib/wallet.js        # StellarWalletsKit (çoklu cüzdan)
  lib/soroban.js       # okuma/yazma çağrıları + event okuma
  lib/errors.js        # 7 hata sınıfı → Türkçe mesaj
  hooks/useWallet.js   # cüzdan durumu
  hooks/useSplit.js    # zincir durumu + canlı event senkronizasyonu
  components/          # WalletBar, CreateSplit, SplitView, EventFeed, TxStatus
```

---

## ⚠️ Notlar ve sınırlar

- Yalnızca **Testnet**; gerçek para taşınmaz.
- Soroban RPC event geçmişini sınırlı süre saklar; akış son ~1000 ledger'ı gösterir.
- Kontrat verisi kalıcı depoda tutulur ve TTL'i uzatılır; çok uzun süre dokunulmazsa arşive düşebilir.
- Ödeme XLM (native SAC) üzerinden yapılır; başka token desteği kontratta hazır (token adresi
  parametrik) ama arayüzde açılmadı.

---

## 🌱 Seri

- **Level 1 (White Belt):** [stellar-white-belt](https://github.com/ozkan4186/stellar-white-belt) — cüzdan, bakiye, ödeme
- **Final projesi:** [Splitstar](https://github.com/ozkan4186/Splitstar) — AI ile fiş okuma ve paylaştırma
- **Level 2 (Yellow Belt):** bu depo — paylaşımın zincire taşınması
