import { DatabaseWrapper } from '../db'
import { dbAll, dbGet, dbRun } from '../utils/db-utils'

export interface WatchedEpisode {
  userId: string
  showId: string
  episodeNumber: string
  currentTime: number
  duration: number
  watchedAt: string
}

export interface ContinueWatchingResult {
  _id: string
  id: string
  name: string
  thumbnail: string
  nativeName?: string
  englishName?: string
  type?: string
  episodeCount?: number
  smType?: string
  watchedCount: number
  episodeNumber: string
  currentTime: number
  duration: number
  watchedAt: string
}

export interface UpNextResult {
  id: string
  name: string
  thumbnail: string
  nativeName?: string
  englishName?: string
  type?: string
  episodeCount?: number
  smType?: string
}

export const WatchedEpisodesRepository = {
  getByShowAndEpisode: (
    db: DatabaseWrapper,
    userId: string,
    showId: string,
    episodeNumber: string
  ) =>
    dbGet<{ currentTime: number; duration: number }>(
      db,
      'SELECT currentTime, duration FROM watched_episodes WHERE userId = ? AND showId = ? AND episodeNumber = ?',
      [userId, showId, episodeNumber]
    ),

  getWatchedEpisodeNumbers: async (db: DatabaseWrapper, userId: string, showId: string) => {
    const rows = await dbAll<{ episodeNumber: string }>(
      db,
      'SELECT episodeNumber FROM watched_episodes WHERE userId = ? AND showId = ?',
      [userId, showId]
    )
    return rows.map((r) => r.episodeNumber)
  },

  upsert: (
    db: DatabaseWrapper,
    data: {
      userId: string
      showId: string
      episodeNumber: string
      currentTime: number
      duration: number
    }
  ) =>
    dbRun(
      db,
      'INSERT OR REPLACE INTO watched_episodes (userId, showId, episodeNumber, watchedAt, currentTime, duration) VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?)',
      [data.userId, data.showId, data.episodeNumber, data.currentTime, data.duration]
    ),

  deleteByShow: (db: DatabaseWrapper, userId: string, showId: string) =>
    dbRun(db, 'DELETE FROM watched_episodes WHERE userId = ? AND showId = ?', [userId, showId]),

  deleteAllByShow: (db: DatabaseWrapper, showId: string) =>
    dbRun(db, 'DELETE FROM watched_episodes WHERE showId = ?', [showId]),

  cleanupOrphanedProgress: (db: DatabaseWrapper) =>
    dbRun(db, 'DELETE FROM watched_episodes WHERE showId NOT IN (SELECT id FROM watchlist)'),

  getContinueWatching: (db: DatabaseWrapper, userId: string, limit?: number) => {
    const limitClause = typeof limit === 'number' ? `LIMIT ${limit}` : ''
    const query = `
      SELECT 
        COALESCE(w.id, sm.id, we.showId) as _id,
        COALESCE(w.id, sm.id, we.showId) as id,
        COALESCE(w.name, sm.name, we.showId) as name,
        COALESCE(w.thumbnail, sm.thumbnail, '') as thumbnail,
        COALESCE(w.nativeName, sm.nativeName) as nativeName,
        COALESCE(w.englishName, sm.englishName) as englishName,
        COALESCE(w.type, sm.type) as type,
        sm.episodeCount,
        sm.type as smType,
        (SELECT COUNT(DISTINCT episodeNumber) FROM watched_episodes WHERE userId = ? AND showId = we.showId) as watchedCount,
        we.episodeNumber, we.currentTime, we.duration, we.watchedAt
      FROM (
        SELECT *, ROW_NUMBER() OVER(PARTITION BY showId ORDER BY watchedAt DESC) as rn
        FROM watched_episodes
        WHERE userId = ?
      ) we
      LEFT JOIN shows_meta sm ON we.showId = sm.id
      LEFT JOIN watchlist w ON we.showId = w.id
      WHERE we.rn = 1 AND COALESCE(w.status, 'Watching') = 'Watching'
      ORDER BY we.watchedAt DESC
      ${limitClause}
    `
    return dbAll<ContinueWatchingResult>(db, query, [userId, userId])
  },

  getUpNextShows: (db: DatabaseWrapper, userId: string) => {
    const query = `
      SELECT w.id, w.name, w.thumbnail, w.nativeName, w.englishName, w.type, sm.episodeCount, sm.type as smType
      FROM watchlist w
      LEFT JOIN shows_meta sm ON w.id = sm.id
      LEFT JOIN (
        SELECT showId, MAX(watchedAt) as lastActivity
        FROM watched_episodes
        WHERE userId = ?
        GROUP BY showId
      ) we ON w.id = we.showId
      WHERE w.status = 'Watching'
      ORDER BY we.lastActivity DESC
      LIMIT 15
    `
    return dbAll<UpNextResult>(db, query, [userId])
  },

  getEpisodesForShows: (db: DatabaseWrapper, userId: string, showIds: string[]) => {
    const placeholders = showIds.map(() => '?').join(',')
    return dbAll<WatchedEpisode>(
      db,
      `SELECT userId, showId, episodeNumber, currentTime, duration, watchedAt FROM watched_episodes WHERE userId = ? AND showId IN (${placeholders})`,
      [userId, ...showIds]
    )
  },
}
