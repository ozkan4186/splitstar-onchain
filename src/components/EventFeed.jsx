// Canlı event akışı — kontratın yaydığı olaylar RPC'den periyodik çekilip burada gösterilir.
import { EXPLORER } from '../lib/soroban'

const short = (a) => (typeof a === 'string' && a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a)

/**
 * Event'i okunabilir bir satıra çevirir.
 *
 * Kontrat `#[contractevent]` kullandığı için veri şu şekilde geliyor:
 *   topics: ["split", "created", <split_id>]            value: { organizer, total }
 *   topics: ["share", "paid", <split_id>, <who>]        value: { amount, collected }
 *   topics: ["split", "done", <split_id>]               value: { total }
 * `#[topic]` işaretli alanlar topic listesinde, diğerleri veri nesnesinde yer alır.
 */
function describe(event) {
  const [subject, action, topicId, topicWho] = event.topics || []
  const v = event.value && typeof event.value === 'object' ? event.value : {}
  const id = topicId ?? v.split_id

  if (subject === 'split' && action === 'created') {
    return {
      icon: '📝',
      text: `Hesap #${id} oluşturuldu — ${fmt(v.total)} XLM · ${short(v.organizer)}`,
    }
  }
  if (subject === 'share' && action === 'paid') {
    const who = topicWho ?? v.who
    return {
      icon: '💸',
      text: `${short(who)} → hesap #${id} için ${fmt(v.amount)} XLM ödedi (toplam ${fmt(v.collected)})`,
    }
  }
  if (subject === 'split' && action === 'done') {
    return { icon: '🎉', text: `Hesap #${id} tamamlandı — ${fmt(v.total)} XLM toplandı` }
  }
  return { icon: '•', text: `${subject ?? '?'} / ${action ?? '?'}` }
}

// i128 alanlar BigInt olarak geliyor; XLM'e çevirip iki hane gösteriyoruz.
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
