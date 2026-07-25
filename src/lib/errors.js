// Hata çevirisi: teknik hataları kullanıcının anlayacağı Türkçe mesajlara dönüştürür.
//
// Level 2 gereksinimi "en az 3 hata tipi" — burada 7 ayrı sınıf ele alınıyor:
//   1. Cüzdan kurulu değil / bulunamadı
//   2. Kullanıcı imzayı reddetti
//   3. Yetersiz bakiye
//   4. Kontrat kuralı ihlalleri (katılımcı değil / zaten ödedi / split yok / geçersiz veri)
//   5. Hesap ağda yok (fonlanmamış)
//   6. Ağ/RPC erişim hatası
//   7. Bilinmeyen — ham mesaj gösterilir, sessizce yutulmaz

/** Kontratın #[contracterror] numaraları — lib.rs'teki Error enum'ı ile birebir. */
export const CONTRACT_ERRORS = {
  1: 'Böyle bir hesap paylaşımı bulunamadı. ID doğru mu?',
  2: 'Bu hesabın katılımcısı değilsin — payını ödeyemezsin.',
  3: 'Payını zaten ödemişsin. İkinci kez ödeme yapılamaz.',
  4: 'Tutar geçersiz: sıfırdan büyük olmalı.',
  5: 'Katılımcı listesi geçersiz: kişi ve tutar sayısı eşleşmiyor.',
}

const asText = (error) => {
  const parts = [error?.message, error?.error, JSON.stringify(error?.raw ?? '')]
  return parts.filter(Boolean).join(' | ')
}

/**
 * @returns {{ kind: string, title: string, detail: string, hint?: string }}
 */
export function explainError(error) {
  const text = asText(error)

  // 4) Kontrat kendi hata kodunu döndürdü: "Error(Contract, #3)"
  const contractCode = text.match(/Error\(Contract,\s*#(\d+)\)/)
  if (contractCode) {
    const code = Number(contractCode[1])
    return {
      kind: 'contract',
      title: 'Kontrat işlemi reddetti',
      detail: CONTRACT_ERRORS[code] || `Kontrat hata kodu: #${code}`,
    }
  }

  // 1) Cüzdan yok / erişilemiyor
  if (/not (installed|found|available)|no wallet|kurulu değil|Freighter is not|extension/i.test(text)) {
    return {
      kind: 'wallet-missing',
      title: 'Cüzdan bulunamadı',
      detail: 'Seçtiğin cüzdan tarayıcında kurulu görünmüyor.',
      hint: 'Freighter, xBull, Albedo veya Rabet kurup sayfayı yenile.',
    }
  }

  // 2) Kullanıcı imzalamayı reddetti
  if (/reject|declined|denied|cancel|user (did not|refused)|kullanıcı iptal/i.test(text)) {
    return {
      kind: 'rejected',
      title: 'İşlem iptal edildi',
      detail: 'Cüzdan penceresinde imzalamayı reddettin. İstersen tekrar deneyebilirsin.',
    }
  }

  // 3) Yetersiz bakiye
  if (/underfunded|insufficient|balance is not sufficient|#\{?12\}?.*balance/i.test(text)) {
    return {
      kind: 'insufficient',
      title: 'Yetersiz bakiye',
      detail: 'Cüzdanındaki XLM bu ödeme ve işlem ücreti için yetmiyor.',
      hint: 'Testnet’tesin: Friendbot ile ücretsiz test XLM alabilirsin.',
    }
  }

  // 5) Hesap ağda yok
  if (/account not found|Account.*does not exist|NotFound.*account/i.test(text)) {
    return {
      kind: 'no-account',
      title: 'Hesap ağda bulunamadı',
      detail: 'Bu adres Testnet’te henüz oluşturulmamış (hiç fonlanmamış).',
      hint: 'Friendbot ile fonla, sonra tekrar dene.',
    }
  }

  // 6) Ağ / RPC
  if (/fetch|network|timeout|ECONN|502|503|504|Failed to load/i.test(text)) {
    return {
      kind: 'network',
      title: 'Ağa ulaşılamadı',
      detail: 'Stellar RPC sunucusuna bağlanılamadı.',
      hint: 'İnternet bağlantını kontrol edip tekrar dene.',
    }
  }

  // 7) Bilinmeyen — gizleme, göster.
  return {
    kind: 'unknown',
    title: 'Beklenmeyen hata',
    detail: error?.message || 'Bilinmeyen bir sorun oluştu.',
  }
}
