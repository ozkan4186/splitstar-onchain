// Cüzdan durumu: bağlan (çoklu cüzdan modalı), adres, bakiye, imzalama, fonlama.
import { useCallback, useEffect, useState } from 'react'
import { connectWallet, disconnectWallet, signXdr, listWallets } from '../lib/wallet'
import { explainError } from '../lib/errors'

const HORIZON = 'https://horizon-testnet.stellar.org'
const FRIENDBOT = 'https://friendbot.stellar.org'

export function useWallet() {
  const [address, setAddress] = useState('')
  const [walletName, setWalletName] = useState('')
  const [wallets, setWallets] = useState([])
  const [balance, setBalance] = useState(null) // null = bilinmiyor, 0 = fonsuz
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState(null)

  const connected = Boolean(address)

  // Hangi cüzdanların kurulu olduğunu bir kez öğren (arayüzde rozet olarak gösteriyoruz).
  useEffect(() => {
    listWallets().then(setWallets)
  }, [])

  const refreshBalance = useCallback(async (addr = address) => {
    if (!addr) return
    try {
      const res = await fetch(`${HORIZON}/accounts/${addr}`)
      if (res.status === 404) {
        setBalance(0) // hesap henüz ağda yok
        return
      }
      const data = await res.json()
      const native = (data.balances || []).find((b) => b.asset_type === 'native')
      setBalance(native ? Number(native.balance) : 0)
    } catch {
      setBalance(null)
    }
  }, [address])

  const connect = useCallback(async () => {
    setError(null)
    setConnecting(true)
    try {
      const result = await connectWallet()
      if (!result) return // kullanıcı modalı kapattı
      setAddress(result.address)
      setWalletName(result.walletName)
      await refreshBalance(result.address)
    } catch (e) {
      setError(explainError(e))
    } finally {
      setConnecting(false)
    }
  }, [refreshBalance])

  const disconnect = useCallback(async () => {
    await disconnectWallet()
    setAddress('')
    setWalletName('')
    setBalance(null)
    setError(null)
  }, [])

  const fund = useCallback(async () => {
    if (!address) return
    setError(null)
    try {
      const res = await fetch(`${FRIENDBOT}?addr=${address}`)
      if (!res.ok && res.status !== 400) throw new Error('Friendbot fonlaması başarısız.')
      await refreshBalance()
    } catch (e) {
      setError(explainError(e))
    }
  }, [address, refreshBalance])

  const sign = useCallback((xdr) => signXdr(xdr, address), [address])

  return {
    address, walletName, wallets, balance, connected, connecting, error,
    connect, disconnect, fund, sign, refreshBalance, setError,
  }
}
