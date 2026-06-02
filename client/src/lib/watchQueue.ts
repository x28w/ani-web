export interface QueueItem {
  id: string
  name: string
  thumbnail: string
  nativeName?: string
  englishName?: string
  type?: string
  addedAt: number
}

const STORAGE_KEY = 'ani-web:watch-queue:v1'

export function getWatchQueue(): QueueItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as QueueItem[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveQueue(items: QueueItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  window.dispatchEvent(new CustomEvent('watch-queue-updated'))
}

export function addToWatchQueue(item: Omit<QueueItem, 'addedAt'>): boolean {
  const queue = getWatchQueue()
  if (queue.some((q) => q.id === item.id)) return false
  saveQueue([{ ...item, addedAt: Date.now() }, ...queue])
  return true
}

export function removeFromWatchQueue(id: string) {
  saveQueue(getWatchQueue().filter((q) => q.id !== id))
}

export function clearWatchQueue() {
  saveQueue([])
}

export function isInWatchQueue(id: string): boolean {
  return getWatchQueue().some((q) => q.id === id)
}

export function reorderWatchQueue(fromIndex: number, toIndex: number) {
  const queue = getWatchQueue()
  if (fromIndex < 0 || fromIndex >= queue.length || toIndex < 0 || toIndex >= queue.length) {
    return
  }
  const next = [...queue]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  saveQueue(next)
}
