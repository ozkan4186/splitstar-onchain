// Üst çubuk: çoklu cüzdan bağlantısı, bakiye, ağ ve kontrat bilgisi.
import { CONTRACT_ID, EXPLORER } from '../lib/soroban'

const short = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '')

export default function WalletBar({ wallet }) {
  const { address, walletName, wallets, balance, connected, connecting, connect, disconnect, fund } =
    wallet

  const available = wallets.filter((w) => w.isAvailable)

  return (
    <header className="walletbar">
      <div className="brand">
        <span className="logo">✦</span>
        <div>
          <strong>SplitStar On-Chain</strong>
          <span className="tag">Hesap paylaşımı Soroban kontratında</span>
        </div>
      </div>

      <div className="bar-right">
        <span className="badge badge-ok">TESTNET</span>

        {CONTRACT_ID ? (
          <a
            className="badge badge-contract"
            href={`${EXPLORER}/contract/${CONTRACT_ID}`}
            target="_blank"
            rel="noreferrer"
            title={CONTRACT_ID}
          >
            📜 {short(CONTRACT_ID)}
          </a>
        ) : (
          <span className="badge badge-warn">kontrat deploy edilmedi</span>
        )}

        {connected ? (
          <>
            {walletName && <span className="badge badge-muted">{walletName}</span>}
            <span className="balance">
              {balance === null ? '…' : `${balance.toFixed(2)} XLM`}
            </span>
            {balance === 0 && (
              <button className="btn btn-ghost btn-sm" onClick={fund}>
                🚰 Fonla
              </button>
            )}
            <code className="mono sm" title={address}>{short(address)}</code>
            <button className="btn btn-ghost btn-sm btn-danger" onClick={disconnect}>
              Çıkış
            </button>
          </>
        ) : (
          <>
            <span className="muted xs" title={available.map((w) => w.name).join(', ')}>
              {available.length} cüzdan hazır
            </span>
            <button className="btn btn-primary btn-sm" onClick={connect} disabled={connecting}>
              {connecting ? 'Bağlanıyor…' : 'Cüzdan Bağla'}
            </button>
          </>
        )}
      </div>
    </header>
  )
}
