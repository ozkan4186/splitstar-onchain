// Canlı event akışı — kontratın yaydığı olaylar RPC'den periyodik çekilip burada gösterilir.
import { EXPLORER } from '../lib/soroban'

const short = (a) => (typeof a === 'string' && a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a)

/** Event topic'lerine göre okunabilir bir satır üretir. */
function describe(event) {
  const [subject, action] = event.topics || []
  const v = event.value

  if (subject === 'split' && action === 'created') {
    const [id, organizer, total] = v || []
    return { icon: '📝', text: `Hesap #${id} oluşturuldu — ${fmt(total)} XLM · ${short(organizer)}` }
  }
  if (subject === 'share' && action === 'paid') {
    const [id, who, amount, collected] = v || []
    return { icon: '💸', text: `${short(who)} → hesap #${id} için ${fmt(amount)} XLM ödedi (toplam ${fmt(collected)})` }
  }
  if (subject === 'split' && action === 'done') {
    const [id, total] = v || []
    return { icon: '🎉', text: `Hesap #${id} tamamlandı — ${fmt(total)} XLM toplandı` }
  }
  return { icon: '•', text: `${subject ?? '?'} / ${action ?? '?'}` }
}

const fmt = (stroops) => (stroops == null ? '?' : (Number(stroops) / 1e7).toFixed(2))

export default function EventFeed({ events, live }) {
  return (
    <section className="card">
      <div className="card-head">
        <h2><span className="step-no">3</span> Canlı olay akışı</h2>
        <span className={`badge ${live ? 'badge-live' : 'badge-warn'}`}>
          {live ? '● dinleniyor' : 'bağlanıyor…'}
        </span>
      </div>

      {events.length === 0 ? (
        <p className="muted sm">
          Henüz olay yok. Bir hesap oluştur ya da pay öde — kontratın yaydığı event saniyeler içinde
          burada belirir.
        </p>
      ) : (
        <ul className="feed">
          {events.map((event) => {
            const { icon, text } = describe(event)
            return (
              <li className="feed-item" key={event.id}>
                <span className="feed-icon">{icon}</span>
                <div className="feed-body">
                  <p>{text}</p>
                  <div className="feed-meta">
                    <span>ledger {event.ledger}</span>
                    {event.txHash && (
                      <a
                        className="link"
                        href={`${EXPLORER}/tx/${event.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        işlem ↗
                      </a>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
