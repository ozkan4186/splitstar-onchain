// Yayındaki kontrata gerçek bir uçtan uca çağrı yapar: hesap oluştur → bir katılımcı payını öder.
//
// İki amacı var:
//   1. Kontratın Testnet'te gerçekten çalıştığını kanıtlayan, Explorer'dan doğrulanabilir tx hash'leri üretmek.
//   2. Arayüzde gösterilecek örnek bir hesap bırakmak (biri ödemiş, biri bekliyor).
//
// Buradaki anahtarlar tek kullanımlık test anahtarlarıdır; kendi cüzdanının anahtarı kullanılmaz.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  rpc,
  xdr,
} from '@stellar/stellar-sdk'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(readFileSync(resolve(root, 'src/contract.json'), 'utf8'))
const server = new rpc.Server(config.rpcUrl)
const contract = new Contract(config.contractId)
const NETWORK = config.networkPassphrase || Networks.TESTNET

const XLM = (n) => BigInt(Math.round(n * 1e7))

async function fund(kp) {
  const res = await fetch(`https://friendbot.stellar.org?addr=${kp.publicKey()}`)
  if (!res.ok && res.status !== 400) throw new Error(`Friendbot: ${res.status}`)
}

async function invoke(kp, method, args, label) {
  const account = await server.getAccount(kp.publicKey())
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK })
    .addOperation(contract.call(method, ...args))
    .setTimeout(60)
    .build()

  const prepared = await server.prepareTransaction(tx)
  prepared.sign(kp)

  const sent = await server.sendTransaction(prepared)
  if (sent.status === 'ERROR') throw new Error(`${label}: ${JSON.stringify(sent.errorResult)}`)

  let result = await server.getTransaction(sent.hash)
  const deadline = Date.now() + 60_000
  while (result.status === 'NOT_FOUND' && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500))
    result = await server.getTransaction(sent.hash)
  }
  if (result.status !== 'SUCCESS') throw new Error(`${label} başarısız: ${result.status}`)

  console.log(`✅ ${label} — tx: ${sent.hash}`)
  return { hash: sent.hash, value: result.returnValue ? scValToNative(result.returnValue) : null }
}

async function main() {
  if (!config.contractId) throw new Error('Önce npm run contract:deploy')

  const secrets = JSON.parse(process.env.DEMO_KEYS || 'null') || {}
  const organizer = secrets.organizer ? Keypair.fromSecret(secrets.organizer) : Keypair.random()
  const ali = secrets.ali ? Keypair.fromSecret(secrets.ali) : Keypair.random()

  console.log(`👤 Organizatör: ${organizer.publicKey()}`)
  console.log(`👤 Ali        : ${ali.publicKey()}`)

  await Promise.all([fund(organizer), fund(ali)])
  console.log('💧 Test hesapları fonlandı.')

  // 1) Hesap oluştur: Ali 12 XLM, Zeynep (ödemeyecek) 8 XLM borçlu.
  const zeynep = Keypair.random()
  const created = await invoke(
    organizer,
    'create_split',
    [
      new Address(organizer.publicKey()).toScVal(),
      new Address(config.nativeSac).toScVal(),
      nativeToScVal('Cuma akşamı meyhane', { type: 'string' }),
      nativeToScVal([new Address(ali.publicKey()), new Address(zeynep.publicKey())]),
      xdr.ScVal.scvVec([
        nativeToScVal(XLM(12), { type: 'i128' }),
        nativeToScVal(XLM(8), { type: 'i128' }),
      ]),
    ],
    'create_split',
  )
  const splitId = Number(created.value)
  console.log(`   → hesap #${splitId}`)

  // 2) Ali payını öder → kontrat XLM'i organizatöre aktarır ve kaydeder.
  const paid = await invoke(
    ali,
    'pay_share',
    [nativeToScVal(splitId, { type: 'u32' }), new Address(ali.publicKey()).toScVal()],
    'pay_share',
  )
  console.log(`   → ödenen: ${Number(paid.value) / 1e7} XLM`)

  // 3) Durumu zincirden geri oku (doğrulama).
  const readTx = new TransactionBuilder(await server.getAccount(organizer.publicKey()), {
    fee: BASE_FEE,
    networkPassphrase: NETWORK,
  })
    .addOperation(contract.call('get_split', nativeToScVal(splitId, { type: 'u32' })))
    .setTimeout(30)
    .build()
  const sim = await server.simulateTransaction(readTx)
  const state = scValToNative(sim.result.retval)
  console.log(
    `📖 get_split → toplam ${Number(state.total) / 1e7} XLM, toplanan ${Number(state.collected) / 1e7} XLM`,
  )

  const record = {
    splitId,
    organizer: organizer.publicKey(),
    participants: { ali: ali.publicKey(), zeynep: zeynep.publicKey() },
    createSplitTx: created.hash,
    payShareTx: paid.hash,
    verifiedAt: new Date().toISOString(),
  }
  writeFileSync(resolve(root, 'docs/example-calls.json'), JSON.stringify(record, null, 2) + '\n')

  console.log('\n🎉 Uçtan uca doğrulandı')
  console.log(`   create_split: https://stellar.expert/explorer/testnet/tx/${created.hash}`)
  console.log(`   pay_share   : https://stellar.expert/explorer/testnet/tx/${paid.hash}`)
  console.log(`   Arayüzde görmek için: ?split=${splitId}`)
}

main().catch((e) => {
  console.error('❌', e.message)
  process.exit(1)
})
