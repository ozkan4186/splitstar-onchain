// SplitStar On-Chain — Level 2 (Yellow Belt)
// Çoklu cüzdan + Soroban kontratı + canlı event akışı + işlem durumu takibi.
import { useEffect } from 'react'
import { useWallet } from './hooks/useWallet'
import { useSplit } from './hooks/useSplit'
import { CONTRACT_ID, EXPLORER } from './lib/soroban'
import WalletBar from './components/WalletBar'
import CreateSplit from './components/CreateSplit'
import SplitView from './components/SplitView'
import EventFeed from './components/EventFeed'
import './App.css'

// Okuma çağrıları için cüzdan gerekmez; bağlı değilken bu bilinen hesabı kaynak olarak kullanırız.
const READ_ONLY_SOURCE = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN7'

export default function App() {
  const wallet = useWallet()
  const splitState = useSplit(wallet.address || READ_ONLY_SOURCE)

  // Bağlantı linkiyle gelindiyse (?split=3) o hesabı otomatik aç.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('split')
    if (id) splitState.load(id)
    // yalnızca ilk açılışta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="page">
      <WalletBar wallet={wallet} />

      {wallet.error && (
        <div className="alert alert-err page-alert">
          <div>
            <strong>{wallet.error.title}</strong>
            <p>{wallet.error.detail}</p>
            {wallet.error.hint && <p className="muted sm">💡 {wallet.error.hint}</p>}
          </div>
          <button className="icon-btn" onClick={() => wallet.setError(null)} aria-label="Kapat">✕</button>
        </div>
      )}

      <section className="hero">
        <h1>Hesap paylaşımı, zincir üzerinde</h1>
        <p className="subtitle">
          Kimin ne kadar borcu olduğu bir <strong>Soroban kontratında</strong> tutulur. Katılımcı
          payını öderken para transferi ve kayıt <strong>aynı işlemde</strong> gerçekleşir — kim
          ödedi tartışması bitiyor.
        </p>
        {!CONTRACT_ID && (
          <p className="alert alert-warn">
            Kontrat henüz deploy edilmemiş. <code>npm run contract:build && npm run contract:deploy</code>
          </p>
        )}
      </section>

      <main className="content">
        <div className="col">
          <CreateSplit wallet={wallet} onCreated={(id) => splitState.load(id)} />
          <EventFeed events={splitState.events} live={splitState.live} />
        </div>
        <div className="col">
          <SplitView wallet={wallet} splitState={splitState} />
        </div>
      </main>

      <footer className="footer">
        <span>Stellar <strong>Testnet</strong> · gerçek para kullanılmaz</span>
        {CONTRACT_ID && (
          <a className="link" href={`${EXPLORER}/contract/${CONTRACT_ID}`} target="_blank" rel="noreferrer">
            Kontratı Explorer’da gör ↗
          </a>
        )}
      </footer>
    </div>
  )
}
