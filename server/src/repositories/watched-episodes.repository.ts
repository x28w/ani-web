import { DatabaseWrapper } from '../db'
import { dbAll, dbGet, dbRun } from '../utils/db-utils'

export interface WatchedEpisode {
  userId: string
  showId: string
  episodeNumber: string
  currentTime: number
  duration: number
  watchedSeconds: number
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

const MAX_TRACKED_PROGRESS_STEP_SECONDS = 90

export const WatchedEpisodesRepository = {
  getByShowAndEpisode: (
    db: DatabaseWrapper,
    userId: string,
    showId: string,
    episodeNumber: string
  ) =>
    dbGet<{ currentTime: number; duration: number; watchedSeconds: number }>(
      db,
      'SELECT currentTime, duration, watchedSeconds FROM watched_episodes WHERE userId = ? AND showId = ? AND episodeNumber = ?',
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
      `INSERT INTO watched_episodes
        (userId, showId, episodeNumber, watchedAt, currentTime, duration, watchedSeconds)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?, CASE WHEN ? <= ? THEN ? ELSE 0 END)
       ON CONFLICT(userId, showId, episodeNumber) DO UPDATE SET
         watchedAt = CURRENT_TIMESTAMP,
         currentTime = excluded.currentTime,
         duration = CASE WHEN excluded.duration > 0 THEN excluded.duration ELSE watched_episodes.duration END,
         watchedSeconds = watched_episodes.watchedSeconds +
           CASE
             WHEN excluded.currentTime > watched_episodes.currentTime
              AND excluded.currentTime - watched_episodes.currentTime <= ?
             THEN excluded.currentTime - watched_episodes.currentTime
             ELSE 0
           END`,
      [
        data.userId,
        data.showId,
        data.episodeNumber,
        data.currentTime,
        data.duration,
        data.currentTime,
        MAX_TRACKED_PROGRESS_STEP_SECONDS,
        data.currentTime,
        MAX_TRACKED_PROGRESS_STEP_SECONDS,
      ]
    ),

  addWatchTime: (
    db: DatabaseWrapper,
    userId: string,
    showId: string,
    episodeNumber: string,
    seconds: number
  ) =>
    dbRun(
      db,
      `UPDATE watched_episodes
       SET watchedSeconds = watchedSeconds + ?, watchedAt = CURRENT_TIMESTAMP
       WHERE userId = ? AND showId = ? AND episodeNumber = ?`,
      [seconds, userId, showId, episodeNumber]
    ),

  deleteByShow: (db: DatabaseWrapper, userId: string, showId: string) =>
    dbRun(db, 'DELETE FROM watched_episodes WHERE userId = ? AND showId = ?', [userId, showId]),

  deleteActivityByShow: (db: DatabaseWrapper, userId: string, showId: string) =>
    dbRun(db, 'DELETE FROM watch_activity WHERE userId = ? AND showId = ?', [userId, showId]),

  deleteAllByShow: (db: DatabaseWrapper, showId: string) =>
    dbRun(db, 'DELETE FROM watched_episodes WHERE showId = ?', [showId]),

  deleteAllActivityByShow: (db: DatabaseWrapper, showId: string) =>
    dbRun(db, 'DELETE FROM watch_activity WHERE showId = ?', [showId]),

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
      WHERE we.rn = 1 AND COALESCE(w.status, 'Watching') NOT IN ('Completed', 'Dropped')
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
      `SELECT userId, showId, episodeNumber, currentTime, duration, watchedSeconds, watchedAt FROM watched_episodes WHERE userId = ? AND showId IN (${placeholders})`,
      [userId, ...showIds]
    )
  },
}
