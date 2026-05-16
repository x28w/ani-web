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

  getContinueWatching: (db: DatabaseWrapper, userId: string, limit?: number) => {
    const limitClause = typeof limit === 'number' ? `LIMIT ${limit}` : ''
    const query = `
      SELECT 
        w.id as _id,
        w.id as id,
        w.name as name,
        w.thumbnail as thumbnail,
        w.nativeName as nativeName,
        w.englishName as englishName,
        w.type as type,
        sm.episodeCount,
        sm.type as smType,
        (SELECT COUNT(DISTINCT episodeNumber) FROM watched_episodes WHERE userId = ? AND showId = w.id) as watchedCount,
        we.episodeNumber, we.currentTime, we.duration, we.watchedAt
      FROM (
        SELECT *, ROW_NUMBER() OVER(PARTITION BY showId ORDER BY watchedAt DESC) as rn
        FROM watched_episodes
        WHERE userId = ?
      ) we
      JOIN watchlist w ON we.showId = w.id
      LEFT JOIN shows_meta sm ON we.showId = sm.id
      WHERE we.rn = 1 AND w.status = 'Watching'
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
