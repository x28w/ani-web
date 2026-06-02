/** Canonical show id used for API calls (watchlist, progress, queue). */
export function resolveShowId(anime: {
  id?: string
  _id?: string
  showId?: string
}): string {
  const raw = anime.id || anime._id || anime.showId
  return raw ? String(raw) : ''
}

export function idsMatch(
  anime: { id?: string; _id?: string; showId?: string },
  targetId: string
): boolean {
  const t = String(targetId)
  if (!t) return false
  return [anime.id, anime._id, anime.showId].some((v) => v != null && String(v) === t)
}
