import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import {
  addToWatchQueue,
  clearWatchQueue,
  getWatchQueue,
  isInWatchQueue,
  removeFromWatchQueue,
  reorderWatchQueue,
  type QueueItem,
} from '../lib/watchQueue'
import { resolveShowId } from '../lib/showId'

interface WatchQueueContextValue {
  queue: QueueItem[]
  add: (item: Omit<QueueItem, 'addedAt'>) => boolean
  remove: (id: string) => void
  clear: () => void
  reorder: (from: number, to: number) => void
  isQueued: (id: string) => boolean
  refresh: () => void
}

const WatchQueueContext = createContext<WatchQueueContextValue | null>(null)

export const WatchQueueProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [queue, setQueue] = useState<QueueItem[]>(() => getWatchQueue())

  const refresh = useCallback(() => setQueue(getWatchQueue()), [])

  useEffect(() => {
    const onUpdate = () => refresh()
    window.addEventListener('watch-queue-updated', onUpdate)
    window.addEventListener('storage', onUpdate)
    return () => {
      window.removeEventListener('watch-queue-updated', onUpdate)
      window.removeEventListener('storage', onUpdate)
    }
  }, [refresh])

  const add = useCallback(
    (item: Omit<QueueItem, 'addedAt'>) => {
      const id = resolveShowId(item)
      if (!id) return false
      const payload = { ...item, id }
      const added = addToWatchQueue(payload)
      if (added) {
        refresh()
        toast.success('Added to queue')
      } else {
        toast('Already in your queue')
      }
      return added
    },
    [refresh]
  )

  const remove = useCallback(
    (id: string) => {
      removeFromWatchQueue(id)
      refresh()
      toast.success('Removed from queue')
    },
    [refresh]
  )

  const clear = useCallback(() => {
    clearWatchQueue()
    refresh()
    toast.success('Queue cleared')
  }, [refresh])

  const reorder = useCallback(
    (from: number, to: number) => {
      reorderWatchQueue(from, to)
      refresh()
    },
    [refresh]
  )

  const isQueued = useCallback((id: string) => isInWatchQueue(id), [queue])

  return (
    <WatchQueueContext.Provider value={{ queue, add, remove, clear, reorder, isQueued, refresh }}>
      {children}
    </WatchQueueContext.Provider>
  )
}

export function useWatchQueue() {
  const ctx = useContext(WatchQueueContext)
  if (!ctx) throw new Error('useWatchQueue must be used within WatchQueueProvider')
  return ctx
}
