// Soroban kontratını Docker içindeki resmi Rust imajıyla derler.
//
// Neden Docker? Windows'ta Rust + MSVC C++ derleyicisi kurmak birkaç GB'lık bir yük.
// Konteyner içinde derleyince makineye hiçbir şey kurulmuyor ve derleme herkeste birebir aynı çıkıyor.
//
// Kullanım:  npm run contract:build
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const IMAGE = 'rust:1-bookworm'
const OUT_DIR = resolve(root, 'contracts/out')

// Docker'ın Windows yollarını anlaması için `//c/...` biçimi gerekiyor.
const dockerPath = (p) => '//' + p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => d.toLowerCase())

// Soroban SDK 22+ ile önerilen hedef wasm32v1-none; eski araç zincirlerinde
// wasm32-unknown-unknown'a düşüyoruz.
const script = `
set -e
TARGET=wasm32v1-none
rustup target add $TARGET 2>/dev/null || TARGET=wasm32-unknown-unknown
rustup target add $TARGET
echo "hedef: $TARGET"
cargo build --target $TARGET --release
echo "$TARGET" > /work/contracts/out/.target
mkdir -p /work/contracts/out
cp target/$TARGET/release/split_bill.wasm /work/contracts/out/split_bill.wasm
ls -la /work/contracts/out/
`

mkdirSync(OUT_DIR, { recursive: true })

console.log('🐳 Kontrat Docker içinde derleniyor…')
execFileSync(
  'docker',
  [
    'run', '--rm',
    '-v', `${dockerPath(root)}://work`,
    '-w', '//work',
    // Bağımlılıklar önbellekte kalsın diye adlandırılmış volume:
    '-v', 'splitstar-cargo://usr/local/cargo/registry',
    IMAGE,
    'bash', '-c', script,
  ],
  { stdio: 'inherit' },
)

const wasm = resolve(OUT_DIR, 'split_bill.wasm')
if (!existsSync(wasm)) {
  console.error('❌ Wasm üretilemedi.')
  process.exit(1)
}
console.log(`✅ Hazır: contracts/out/split_bill.wasm (${(statSync(wasm).size / 1024).toFixed(1)} KB)`)
