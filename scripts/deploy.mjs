// Derlenen kontratı Stellar Testnet'e yükler ve bir kontrat örneği oluşturur.
//
// GÜVENLİK NOTU: Bu script yalnızca **testnet** için tek kullanımlık bir deployer anahtarı üretir
// (Friendbot ile fonlanır) ve `.env` dosyasına yazar — `.env` git'e girmez. Kendi Freighter
// cüzdanının gizli anahtarını buraya ASLA yazma; deploy için gerekli değil.
//
// Kullanım:  npm run contract:deploy
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  rpc,
  Address,
  xdr,
  BASE_FEE,
} from '@stellar/stellar-sdk'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RPC_URL = 'https://soroban-testnet.stellar.org'
const FRIENDBOT = 'https://friendbot.stellar.org'
const NETWORK = Networks.TESTNET
const WASM_PATH = resolve(root, 'contracts/out/split_bill.wasm')
const ENV_PATH = resolve(root, '.env')
const CONFIG_PATH = resolve(root, 'src/contract.json')

const server = new rpc.Server(RPC_URL)

/** .env'den deployer anahtarını okur; yoksa üretip fonlar. */
async function getDeployer() {
  const fromEnv = process.env.DEPLOYER_SECRET || readEnvFile().DEPLOYER_SECRET
  if (fromEnv) {
    const kp = Keypair.fromSecret(fromEnv.trim())
    console.log(`🔑 Mevcut deployer: ${kp.publicKey()}`)
    return kp
  }

  const kp = Keypair.random()
  console.log(`🔑 Yeni testnet deployer üretildi: ${kp.publicKey()}`)

  const res = await fetch(`${FRIENDBOT}?addr=${kp.publicKey()}`)
  if (!res.ok) throw new Error(`Friendbot fonlaması başarısız: ${res.status}`)
  console.log('💧 Friendbot ile fonlandı.')

  appendFileSync(ENV_PATH, `\n# Testnet deployer (otomatik üretildi — git'e girmez)\nDEPLOYER_SECRET=${kp.secret()}\n`)
  return kp
}

function readEnvFile() {
  if (!existsSync(ENV_PATH)) return {}
  return Object.fromEntries(
    readFileSync(ENV_PATH, 'utf8')
      .split('\n')
      .filter((line) => line.trim() && !line.trim().startsWith('#') && line.includes('='))
      .map((line) => {
        const i = line.indexOf('=')
        return [line.slice(0, i).trim(), line.slice(i + 1).trim()]
      }),
  )
}

/** İşlemi simüle eder, imzalar, gönderir ve sonuçlanmasını bekler. */
async function submit(kp, operation, label) {
  const account = await server.getAccount(kp.publicKey())
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK })
    .addOperation(operation)
    .setTimeout(60)
    .build()

  const prepared = await server.prepareTransaction(tx)
  prepared.sign(kp)

  const sent = await server.sendTransaction(prepared)
  if (sent.status === 'ERROR') {
    throw new Error(`${label} gönderilemedi: ${JSON.stringify(sent.errorResult)}`)
  }

  let result = await server.getTransaction(sent.hash)
  const deadline = Date.now() + 60_000
  while (result.status === 'NOT_FOUND' && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500))
    result = await server.getTransaction(sent.hash)
  }

  if (result.status !== 'SUCCESS') {
    throw new Error(`${label} başarısız: ${result.status}`)
  }
  console.log(`✅ ${label} — tx: ${sent.hash}`)
  return { hash: sent.hash, returnValue: result.returnValue }
}

async function main() {
  if (!existsSync(WASM_PATH)) {
    console.error('❌ contracts/out/split_bill.wasm yok. Önce: npm run contract:build')
    process.exit(1)
  }

  const wasm = readFileSync(WASM_PATH)
  console.log(`📦 Wasm: ${(wasm.length / 1024).toFixed(1)} KB`)

  const kp = await getDeployer()

  // 1) Wasm'i ağa yükle → wasm hash
  const upload = await submit(kp, Operation.uploadContractWasm({ wasm }), 'Wasm yüklendi')
  const wasmHash = upload.returnValue.bytes()
  console.log(`   wasm hash: ${wasmHash.toString('hex')}`)

  // 2) Bu wasm'den bir kontrat örneği oluştur → kontrat adresi
  const create = await submit(
    kp,
    Operation.createCustomContract({
      address: Address.fromString(kp.publicKey()),
      wasmHash,
      salt: undefined, // rastgele salt → her deploy yeni adres
    }),
    'Kontrat oluşturuldu',
  )

  const contractId = Address.fromScAddress(
    xdr.ScAddress.fromXDR(create.returnValue.address().toXDR()),
  ).toString()

  const config = {
    network: 'testnet',
    rpcUrl: RPC_URL,
    networkPassphrase: NETWORK,
    contractId,
    wasmHash: wasmHash.toString('hex'),
    deployer: kp.publicKey(),
    deployTx: create.hash,
    uploadTx: upload.hash,
    deployedAt: new Date().toISOString(),
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n')

  console.log('\n🎉 Deploy tamam')
  console.log(`   Kontrat adresi : ${contractId}`)
  console.log(`   Explorer       : https://stellar.expert/explorer/testnet/contract/${contractId}`)
  console.log(`   Kayıt          : src/contract.json`)
}

main().catch((e) => {
  console.error('❌', e.message)
  process.exit(1)
})
