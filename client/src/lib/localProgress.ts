import type { Anime } from '../hooks/useAnimeData'

const STORAGE_KEY = 'ani-web:local-progress:v1'
const MAX_ENTRIES = 250

export interface ProgressPayload {
  showId?: string
  episodeNumber?: string
  currentTime?: number
  duration?: number
  showName?: string
  showThumbnail?: string
  nativeName?: string
  englishName?: string
  genres?: string[]
  popularityScore?: number
  type?: string
  status?: string
  episodeCount?: number
}

export interface LocalProgressEntry extends Anime {
  episodeNumber: string
  currentTime: number
  duration: number
  watchedAt: string
}

const canUseStorage = () => typeof window !== 'undefined' && !!window.localStorage

const cleanNumber = (value: unknown) => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0
}

const getEntryKey = (showId: string, episodeNumber: string) => `${showId}::${episodeNumber}`

export const getLocalProgressEntries = (): LocalProgressEntry[] => {
  if (!canUseStorage()) return []

  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]')
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((entry): entry is LocalProgressEntry => {
        return Boolean(entry?.id && entry?._id && entry?.name && entry?.episodeNumber)
      })
      .sort((a, b) => new Date(b.watchedAt).getTime() - new Date(a.watchedAt).getTime())
  } catch {
    return []
  }
}

const writeLocalProgressEntries = (entries: LocalProgressEntry[]) => {
  if (!canUseStorage()) return

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)))
  } catch {
    // Local storage can be full or disabled. Server persistence still handles signed-in users.
  }
}

export const saveLocalProgress = (payload: ProgressPayload) => {
  const showId = String(payload.showId || '').trim()
  const episodeNumber = String(payload.episodeNumber || '').trim()
  const name = String(payload.showName || '').trim()
  const currentTime = cleanNumber(payload.currentTime)
  const duration = cleanNumber(payload.duration)

  if (!showId || !episodeNumber || !name || currentTime <= 0) return

  const entries = getLocalProgressEntries()
  const nextEntry: LocalProgressEntry = {
    _id: showId,
    id: showId,
    name,
    thumbnail: payload.showThumbnail || '',
    nativeName: payload.nativeName,
    englishName: payload.englishName,
    type: payload.type,
    status: payload.status,
    episodeCount: payload.episodeCount,
    episodeNumber,
    currentTime,
    duration,
    watchedAt: new Date().toISOString(),
  }

  const nextEntries = [
    nextEntry,
    ...entries.filter(
      (entry) => getEntryKey(entry.id, entry.episodeNumber) !== getEntryKey(showId, episodeNumber)
    ),
  ]

  writeLocalProgressEntries(nextEntries)
}

export const removeLocalContinueWatching = (showId: string) => {
  const normalizedId = String(showId)
  writeLocalProgressEntries(getLocalProgressEntries().filter((entry) => entry.id !== normalizedId))
}

export const getLocalEpisodeProgress = (showId: string, episodeNumber: string) => {
  return (
    getLocalProgressEntries().find(
      (entry) => entry.id === String(showId) && entry.episodeNumber === String(episodeNumber)
    ) || null
  )
}

export const getLocalWatchedEpisodeNumbers = (showId: string) => {
  return Array.from(
    new Set(
      getLocalProgressEntries()
        .filter((entry) => entry.id === String(showId))
        .map((entry) => entry.episodeNumber)
    )
  )
}

export const getLocalContinueWatching = (limit?: number): LocalProgressEntry[] => {
  const latestByShow = new Map<string, LocalProgressEntry>()
  const watchedCounts = new Map<string, Set<string>>()

  for (const entry of getLocalProgressEntries()) {
    if (!watchedCounts.has(entry.id)) watchedCounts.set(entry.id, new Set())
    watchedCounts.get(entry.id)?.add(entry.episodeNumber)
    if (!latestByShow.has(entry.id)) latestByShow.set(entry.id, entry)
  }

  const rows = Array.from(latestByShow.values()).map((entry) => ({
    ...entry,
    watchedCount: watchedCounts.get(entry.id)?.size || 1,
  }))

  return typeof limit === 'number' ? rows.slice(0, limit) : rows
}

export const mergeLocalContinueWatching = <T extends Anime>(
  remoteRows: T[] = [],
  limit?: number
) => {
  const localRows = getLocalContinueWatching()
  const localIds = new Set(localRows.map((entry) => entry.id))
  const merged = [
    ...localRows,
    ...remoteRows.filter((entry) => !localIds.has(String(entry.id || entry._id))),
  ]

  return (typeof limit === 'number' ? merged.slice(0, limit) : merged) as (T | LocalProgressEntry)[]
}
