// İşlem durumu göstergesi — Level 2'nin "transaction status visible" gereksinimi.
// Bir kontrat çağrısının geçtiği tüm aşamaları kullanıcıya açıkça gösterir.
import { EXPLORER } from '../lib/soroban'

const STEPS = [
  { key: 'simulating', label: 'Simüle ediliyor' },
  { key: 'signing', label: 'Cüzdanda imzalanıyor' },
  { key: 'sending', label: 'Ağa gönderiliyor' },
  { key: 'pending', label: 'Onay bekleniyor' },
  { key: 'success', label: 'Tamamlandı' },
]

const ORDER = STEPS.map((s) => s.key)

export default function TxStatus({ status }) {
  if (!status) return null

  const { state, hash, error } = status
  const failed = state === 'error'
  const activeIndex = ORDER.indexOf(state)

  return (
    <div className={`tx-status ${failed ? 'tx-failed' : ''}`}>
      <div className="tx-steps">
        {STEPS.map((step, i) => {
          const done = !failed && activeIndex > i
          const active = state === step.key
          return (
            <div
              key={step.key}
              className={`tx-step ${done ? 'done' : ''} ${active ? 'active' : ''}`}
            >
              <span className="tx-dot">{done ? '✓' : active ? '•' : ''}</span>
              <span className="tx-label">{step.label}</span>
            </div>
          )
        })}
      </div>

      {failed && (
        <div className="alert alert-err">
          <strong>✕ {error?.title || 'İşlem başarısız'}</strong>
          <p>{error?.detail}</p>
          {error?.hint && <p className="muted sm">💡 {error.hint}</p>}
        </div>
      )}

      {hash && (
        <div className="tx-hash">
          <code className="mono break">{hash}</code>
          <a className="link sm" href={`${EXPLORER}/tx/${hash}`} target="_blank" rel="noreferrer">
            Stellar Expert’te aç ↗
          </a>
        </div>
      )}
    </div>
  )
}
