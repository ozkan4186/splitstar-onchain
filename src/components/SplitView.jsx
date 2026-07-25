// Zincirden okuma + ödeme: hesabın güncel durumu, ilerleme çubuğu ve "payımı öde".
import { useState } from 'react'
import { payShare } from '../lib/soroban'
import { explainError } from '../lib/errors'
import TxStatus from './TxStatus'

const short = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '')

export default function SplitView({ wallet, splitState }) {
  const { split, splitId, loading, error, load, refresh } = splitState
  const [idInput, setIdInput] = useState(splitId ? String(splitId) : '1')
  const [status, setStatus] = useState(null)

  const myShare = split?.shares.find((s) => s.who === wallet.address)
  const progress = split && split.total > 0 ? Math.min((split.collected / split.total) * 100, 100) : 0

  const pay = async () => {
    setStatus({ state: 'simulating' })
    try {
      const result = await payShare({
        source: wallet.address,
        splitId: split.id,
        signXdr: wallet.sign,
        onStatus: setStatus,
      })
      setStatus({ state: 'success', hash: result.hash })
      await refresh(split.id)
      wallet.refreshBalance()
    } catch (err) {
      setStatus({ state: 'error', error: explainError(err) })
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2><span className="step-no">2</span> Hesabı görüntüle ve öde</h2>
        <span className="badge badge-muted">zincirden okur</span>
      </div>

      <div className="row">
        <input
          className="input"
          type="number"
          min="1"
          value={idInput}
          onChange={(e) => setIdInput(e.target.value)}
          aria-label="Hesap numarası"
        />
        <button className="btn btn-secondary" onClick={() => load(idInput)} disabled={loading}>
          {loading ? '…' : 'Getir'}
        </button>
      </div>

      {error && (
        <div className="alert alert-err">
          <strong>{error.title}</strong>
          <p>{error.detail}</p>
          {error.hint && <p className="muted sm">💡 {error.hint}</p>}
        </div>
      )}

      {split && (
        <>
          <div className="split-head">
            <div>
              <h3>{split.memo || `Hesap #${split.id}`}</h3>
              <p className="muted xs">Organizatör: <code className="mono sm">{short(split.organizer)}</code></p>
            </div>
            <div className="split-total">
              <strong>{split.collected.toFixed(2)}</strong>
              <span className="muted"> / {split.total.toFixed(2)} XLM</span>
            </div>
          </div>

          <div className="progress" role="progressbar" aria-valuenow={Math.round(progress)}>
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <p className="muted xs">%{progress.toFixed(0)} toplandı — canlı güncelleniyor</p>

          <div className="shares">
            {split.shares.map((share, i) => (
              <div className={`share ${share.paid ? 'share-paid' : ''}`} key={i}>
                <span className="share-who">
                  <code className="mono sm">{short(share.who)}</code>
                  {share.who === wallet.address && <span className="badge badge-you">sen</span>}
                </span>
                <span className="share-amount">{share.amount.toFixed(2)} XLM</span>
                <span className={`share-state ${share.paid ? 'ok' : 'wait'}`}>
                  {share.paid ? '✓ ödendi' : 'bekliyor'}
                </span>
              </div>
            ))}
          </div>

          {wallet.connected && myShare && !myShare.paid && (
            <button className="btn btn-primary btn-block" onClick={pay} disabled={isBusy(status)}>
              {isBusy(status) ? 'İşleniyor…' : `💸 Payımı öde (${myShare.amount.toFixed(2)} XLM)`}
            </button>
          )}
          {wallet.connected && myShare?.paid && (
            <p className="alert alert-ok sm">Payını ödedin, teşekkürler ✓</p>
          )}
          {wallet.connected && !myShare && (
            <p className="muted sm">Bu hesabın katılımcısı değilsin — yalnızca izliyorsun.</p>
          )}

          <TxStatus status={status} />
        </>
      )}
    </section>
  )
}

const isBusy = (status) => status && !['success', 'error'].includes(status.state)
