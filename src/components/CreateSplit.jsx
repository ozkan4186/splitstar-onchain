// Zincire yazma: yeni bir hesap paylaşımı oluşturur (create_split).
import { useState } from 'react'
import { StrKey } from '@stellar/stellar-sdk'
import { createSplit, xlmToStroops } from '../lib/soroban'
import { explainError } from '../lib/errors'
import TxStatus from './TxStatus'

const emptyRow = () => ({ address: '', amount: '' })

export default function CreateSplit({ wallet, onCreated }) {
  const [memo, setMemo] = useState('')
  const [rows, setRows] = useState([emptyRow(), emptyRow()])
  const [status, setStatus] = useState(null)
  const [createdId, setCreatedId] = useState(null)

  const update = (i, patch) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  const valid =
    wallet.connected &&
    memo.trim() &&
    rows.length > 0 &&
    rows.every((r) => StrKey.isValidEd25519PublicKey(r.address) && Number(r.amount) > 0)

  const submit = async (e) => {
    e.preventDefault()
    setCreatedId(null)
    setStatus({ state: 'simulating' })
    try {
      const result = await createSplit({
        source: wallet.address,
        memo: memo.trim(),
        participants: rows.map((r) => r.address.trim()),
        amounts: rows.map((r) => xlmToStroops(r.amount)),
        signXdr: wallet.sign,
        onStatus: setStatus,
      })
      const id = Number(result.value)
      setCreatedId(id)
      setStatus({ state: 'success', hash: result.hash })
      onCreated?.(id)
      wallet.refreshBalance()
    } catch (err) {
      setStatus({ state: 'error', error: explainError(err) })
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2><span className="step-no">1</span> Yeni hesap oluştur</h2>
        <span className="badge badge-muted">zincire yazar</span>
      </div>

      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="memo">Ne için?</label>
          <input
            id="memo"
            className="input"
            placeholder="örn. Cuma akşamı meyhane"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            maxLength={60}
          />
        </div>

        <label className="field-label">Katılımcılar ve payları</label>
        {rows.map((row, i) => {
          const addrOk = !row.address || StrKey.isValidEd25519PublicKey(row.address)
          return (
            <div className="row-item" key={i}>
              <input
                className={`input mono ${addrOk ? '' : 'input-error'}`}
                placeholder="G… adres"
                value={row.address}
                onChange={(e) => update(i, { address: e.target.value.trim() })}
                spellCheck={false}
              />
              <input
                className="input amount"
                type="number"
                min="0"
                step="0.0000001"
                placeholder="XLM"
                value={row.amount}
                onChange={(e) => update(i, { amount: e.target.value })}
              />
              <button
                type="button"
                className="icon-btn"
                onClick={() => setRows((p) => p.filter((_, idx) => idx !== i))}
                disabled={rows.length === 1}
                aria-label="Satırı sil"
              >
                ✕
              </button>
            </div>
          )
        })}

        <div className="row row-wrap" style={{ marginTop: 10 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRows((p) => [...p, emptyRow()])}>
            + Katılımcı
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => wallet.address && update(rows.length - 1, { address: wallet.address })}
            disabled={!wallet.connected}
            title="Son satıra kendi adresini yaz (test için pratik)"
          >
            Kendi adresimi ekle
          </button>
        </div>

        <button className="btn btn-primary btn-block" type="submit" disabled={!valid || isBusy(status)}>
          {isBusy(status) ? 'İşleniyor…' : '📝 Kontrata yaz'}
        </button>
        {!wallet.connected && <p className="muted sm">Önce cüzdanını bağla.</p>}
      </form>

      <TxStatus status={status} />

      {createdId != null && (
        <div className="alert alert-ok">
          <strong>✅ Hesap #{createdId} oluşturuldu</strong>
          <p className="sm">Katılımcılar bu numarayla payını görüp ödeyebilir.</p>
        </div>
      )}
    </section>
  )
}

const isBusy = (status) =>
  status && !['success', 'error'].includes(status.state)
