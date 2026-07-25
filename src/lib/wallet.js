// Çoklu cüzdan desteği — StellarWalletsKit.
//
// White Belt'te yalnızca Freighter'a bağlıydık. Burada kit sayesinde Freighter, xBull, Albedo,
// Rabet, Lobstr, Hana gibi cüzdanların hepsi tek arayüzden destekleniyor; kullanıcı bir modaldan
// seçiyor ve seçimi tarayıcıda hatırlanıyor.
import {
  StellarWalletsKit,
  WalletNetwork,
  allowAllModules,
  FREIGHTER_ID,
} from '@creit.tech/stellar-wallets-kit'

const STORAGE_KEY = 'splitstar:walletId'

export const kit = new StellarWalletsKit({
  network: WalletNetwork.TESTNET,
  selectedWalletId: localStorage.getItem(STORAGE_KEY) || FREIGHTER_ID,
  modules: allowAllModules(),
})

/** Kullanıcının kurulu/erişilebilir cüzdanlarını listeler (arayüzde göstermek için). */
export async function listWallets() {
  try {
    return await kit.getSupportedWallets()
  } catch {
    return []
  }
}

/**
 * Cüzdan seçme modalını açar ve seçilen cüzdanın adresini döndürür.
 * Kullanıcı modalı kapatırsa `null` döner (hata değil — vazgeçmek normaldir).
 */
export function connectWallet() {
  return new Promise((resolve, reject) => {
    kit
      .openModal({
        modalTitle: 'Cüzdanını seç',
        notAvailableText: 'Kurulu değil',
        onWalletSelected: async (option) => {
          try {
            kit.setWallet(option.id)
            const { address } = await kit.getAddress()
            localStorage.setItem(STORAGE_KEY, option.id)
            resolve({ address, walletId: option.id, walletName: option.name })
          } catch (e) {
            reject(e)
          }
        },
        onClosed: () => resolve(null),
      })
      .catch(reject)
  })
}

export async function disconnectWallet() {
  try {
    await kit.disconnect()
  } catch {
    // Bazı cüzdanlar disconnect desteklemiyor; yerel durumu temizlemek yeterli.
  }
  localStorage.removeItem(STORAGE_KEY)
}

/** Hazırlanmış işlemi seçili cüzdana imzalatır ve imzalı XDR döndürür. */
export async function signXdr(xdr, address) {
  const { signedTxXdr } = await kit.signTransaction(xdr, {
    address,
    networkPassphrase: WalletNetwork.TESTNET,
  })
  return signedTxXdr
}
