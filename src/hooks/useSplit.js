// Bir hesap paylaşımının zincirdeki durumu + canlı event akışı.
//
// Durum senkronizasyonu iki kaynaktan gelir:
//   • get_split (simülasyon ile okuma) — kesin, anlık fotoğraf
//   • getEvents (RPC) — kim ne zaman ödedi akışı; yeni event gelince durumu tazeliyoruz.
import { useCallback, useEffect, useRef, useState } from 'react'
import { getSplit, fetchEvents, stroopsToXlm, CONTRACT_ID } from '../lib/soroban'
import { explainError } from '../lib/errors'

const POLL_MS = 6000

export function useSplit(readerAddress) {
  const [splitId, setSplitId] = useState(null)
  const [split, setSplit] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [events, setEvents] = useState([])
  const [live, setLive] = useState(false)
  const cursorRef = useRef(null)
  const seenRef = useRef(new Set())

  /** Zincirden güncel durumu oku. */
  const refresh = useCallback(
    async (id = splitId) => {
      if (!id || !readerAddress || !CONTRACT_ID) return
      setLoading(true)
      setError(null)
      try {
        const raw = await getSplit(readerAddress, id)
        setSplit(normalize(raw))
      } catch (e) {
        setSplit(null)
        setError(explainError(e))
      } finally {
        setLoading(false)
      }
    },
    [splitId, readerAddress],
  )

  const load = useCallback(
    async (id) => {
      setSplitId(Number(id))
      await refresh(Number(id))
    },
    [refresh],
  )

  // Event akışı: kontrat eventlerini periyodik çek, yenileri listeye ekle.
  useEffect(() => {
    if (!CONTRACT_ID) return
    let stop = false

    const tick = async () => {
      try {
        const { events: fresh, latestLedger } = await fetchEvents(cursorRef.current)
        if (stop) return
        setLive(true)

        const unseen = fresh.filter((e) => !seenRef.current.has(e.id))
        unseen.forEach((e) => seenRef.current.add(e.id))

        if (unseen.length) {
          setEvents((prev) => [...unseen.reverse(), ...prev].slice(0, 40))
          // Yeni bir ödeme geldiyse görüntülenen hesabı tazele.
          if (splitId && unseen.some((e) => e.topics?.includes('share') || e.topics?.includes('split'))) {
            refresh(splitId)
          }
        }
        // Bir sonraki turda sadece yeni ledger'lara bak.
        cursorRef.current = Math.max((latestLedger || 0) - 5, 1)
      } catch {
        if (!stop) setLive(false)
      }
    }

    tick()
    const timer = setInterval(tick, POLL_MS)
    return () => {
      stop = true
      clearInterval(timer)
    }
  }, [splitId, refresh])

  return { splitId, split, events, live, loading, error, load, refresh, setError }
}

/** Kontrattan gelen ham veriyi arayüzün kullandığı biçime çevirir (stroop → XLM). */
function normalize(raw) {
  if (!raw) return null
  return {
    id: Number(raw.id),
    organizer: raw.organizer,
    token: raw.token,
    memo: raw.memo,
    total: stroopsToXlm(raw.total),
    collected: stroopsToXlm(raw.collected),
    shares: (raw.shares || []).map((s) => ({
      who: s.who,
      amount: stroopsToXlm(s.amount),
      paid: Boolean(s.paid),
    })),
  }
}
