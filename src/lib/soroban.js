// Kontratla konuşan katman: okuma (simülasyon), yazma (imzalı işlem) ve event dinleme.
//
// Soroban'da her çağrı önce **simüle** edilir. Simülasyon iki işe yarar:
//   1. Okuma çağrıları için sonucu bedavaya verir (işlem göndermeye gerek yok).
//   2. Yazma çağrılarında gereken kaynakları hesaplar ve kontrat hatasını daha imzalamadan yakalar.
import {
  Address,
  BASE_FEE,
  Contract,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  rpc,
  xdr,
} from '@stellar/stellar-sdk'
import config from '../contract.json'

export const RPC_URL = config.rpcUrl
export const CONTRACT_ID = config.contractId
export const NETWORK_PASSPHRASE = config.networkPassphrase || Networks.TESTNET
export const EXPLORER = 'https://stellar.expert/explorer/testnet'

/** XLM'in Stellar Asset Contract adresi — kontrat parayı bu token üzerinden taşır. */
export const NATIVE_SAC = config.nativeSac

export const server = new rpc.Server(RPC_URL)
const contract = new Contract(CONTRACT_ID)

// 1 XLM = 10^7 stroop. Kontrat tam sayı (i128) ile çalışır.
export const xlmToStroops = (xlm) => BigInt(Math.round(Number(xlm) * 1e7))
export const stroopsToXlm = (stroops) => Number(BigInt(stroops)) / 1e7

/** Argümanları ScVal'e çevirmek için kısayollar. */
export const arg = {
  u32: (n) => nativeToScVal(Number(n), { type: 'u32' }),
  i128: (n) => nativeToScVal(BigInt(n), { type: 'i128' }),
  address: (a) => new Address(a).toScVal(),
  string: (s) => nativeToScVal(String(s), { type: 'string' }),
  addressVec: (list) => nativeToScVal(list.map((a) => new Address(a))),
  i128Vec: (list) => xdr.ScVal.scvVec(list.map((n) => nativeToScVal(BigInt(n), { type: 'i128' }))),
}

/** Kontrat çağrısı içeren, henüz imzalanmamış bir işlem kurar. */
async function buildTx(sourceAddress, method, args) {
  const account = await server.getAccount(sourceAddress)
  return new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(60)
    .build()
}

/**
 * Salt okuma: işlem göndermeden, yalnızca simülasyonla sonucu alır (ücretsiz, anında).
 * Kaynak adres olarak herhangi bir hesap kullanılabilir.
 */
export async function readCall(sourceAddress, method, args = []) {
  const tx = await buildTx(sourceAddress, method, args)
  const sim = await server.simulateTransaction(tx)

  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error)
  if (!sim.result?.retval) return null
  return scValToNative(sim.result.retval)
}

/**
 * Yazma çağrısı: simüle et → cüzdana imzalat → gönder → sonucu bekle.
 * `onStatus` ile arayüz her aşamayı canlı gösterebilir (pending/success/fail izlenebilirliği).
 */
export async function writeCall({ source, method, args = [], signXdr, onStatus }) {
  onStatus?.({ state: 'simulating' })
  const tx = await buildTx(source, method, args)

  // prepareTransaction simülasyonu çalıştırır; kontrat hatası varsa burada patlar (gaz harcanmadan).
  const prepared = await server.prepareTransaction(tx)

  onStatus?.({ state: 'signing' })
  const signedXdr = await signXdr(prepared.toXDR())

  onStatus?.({ state: 'sending' })
  const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE)
  const sent = await server.sendTransaction(signedTx)

  if (sent.status === 'ERROR') {
    throw Object.assign(new Error('İşlem ağ tarafından reddedildi.'), { raw: sent.errorResult })
  }

  onStatus?.({ state: 'pending', hash: sent.hash })

  // Ağda kesinleşmesini bekle.
  const deadline = Date.now() + 60_000
  let result = await server.getTransaction(sent.hash)
  while (result.status === 'NOT_FOUND' && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500))
    result = await server.getTransaction(sent.hash)
  }

  if (result.status !== 'SUCCESS') {
    throw Object.assign(new Error(`İşlem başarısız (${result.status}).`), { hash: sent.hash, raw: result })
  }

  onStatus?.({ state: 'success', hash: sent.hash })
  return {
    hash: sent.hash,
    value: result.returnValue ? scValToNative(result.returnValue) : null,
  }
}

// --- Kontrat metotları ------------------------------------------------------

export const getSplit = (source, splitId) => readCall(source, 'get_split', [arg.u32(splitId)])

export const getSplitsCount = (source) => readCall(source, 'splits_count', [])

export function createSplit({ source, memo, participants, amounts, signXdr, onStatus }) {
  return writeCall({
    source,
    method: 'create_split',
    args: [
      arg.address(source),
      arg.address(NATIVE_SAC),
      arg.string(memo),
      arg.addressVec(participants),
      arg.i128Vec(amounts),
    ],
    signXdr,
    onStatus,
  })
}

export function payShare({ source, splitId, signXdr, onStatus }) {
  return writeCall({
    source,
    method: 'pay_share',
    args: [arg.u32(splitId), arg.address(source)],
    signXdr,
    onStatus,
  })
}

// --- Event dinleme ----------------------------------------------------------

/**
 * Kontratın yaydığı eventleri okur. Arayüz bunu periyodik çağırarak canlı akış kurar.
 * @param {number} [fromLedger] - bu ledger'dan itibaren; yoksa son ~2 saatlik pencere
 */
export async function fetchEvents(fromLedger) {
  const latest = await server.getLatestLedger()
  const start = fromLedger || Math.max(latest.sequence - 1000, 1)

  const page = await server.getEvents({
    startLedger: start,
    filters: [{ type: 'contract', contractIds: [CONTRACT_ID] }],
    limit: 50,
  })

  const events = (page.events || []).map((e) => ({
    id: e.id,
    ledger: e.ledger,
    when: e.ledgerClosedAt,
    txHash: e.txHash,
    topics: (e.topic || []).map((t) => {
      try {
        return scValToNative(t)
      } catch {
        return '?'
      }
    }),
    value: safeNative(e.value),
  }))

  return { events, latestLedger: latest.sequence }
}

function safeNative(scv) {
  try {
    return scValToNative(scv)
  } catch {
    return null
  }
}
