import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
