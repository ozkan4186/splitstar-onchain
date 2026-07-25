import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // stellar-wallets-kit'in bazı cüzdan modülleri (HOT Wallet → near-js → randombytes) Node'un
  // `global` değişkenini bekliyor. Tarayıcıda karşılığı `globalThis`; olmazsa uygulama açılışta
  // "global is not defined" ile boş ekrana düşüyor.
  define: {
    global: 'globalThis',
  },
  // stellar-sdk ve wallets-kit büyük paketler; tek dosyada toplanmasın diye ayırıyoruz.
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          stellar: ['@stellar/stellar-sdk'],
          wallets: ['@creit.tech/stellar-wallets-kit'],
        },
      },
    },
  },
})
