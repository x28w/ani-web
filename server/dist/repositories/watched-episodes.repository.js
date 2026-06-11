"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WatchedEpisodesRepository = void 0;
const db_utils_1 = require("../utils/db-utils");
const MAX_TRACKED_PROGRESS_STEP_SECONDS = 90;
exports.WatchedEpisodesRepository = {
    getByShowAndEpisode: (db, userId, showId, episodeNumber) => (0, db_utils_1.dbGet)(db, 'SELECT currentTime, duration, watchedSeconds FROM watched_episodes WHERE userId = ? AND showId = ? AND episodeNumber = ?', [userId, showId, episodeNumber]),
    getWatchedEpisodeNumbers: async (db, userId, showId) => {
        const rows = await (0, db_utils_1.dbAll)(db, 'SELECT episodeNumber FROM watched_episodes WHERE userId = ? AND showId = ?', [userId, showId]);
        return rows.map((r) => r.episodeNumber);
    },
    upsert: (db, data) => (0, db_utils_1.dbRun)(db, `INSERT INTO watched_episodes
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
           END`, [
        data.userId,
        data.showId,
        data.episodeNumber,
        data.currentTime,
        data.duration,
        data.currentTime,
        MAX_TRACKED_PROGRESS_STEP_SECONDS,
        data.currentTime,
        MAX_TRACKED_PROGRESS_STEP_SECONDS,
    ]),
    addWatchTime: (db, userId, showId, episodeNumber, seconds) => (0, db_utils_1.dbRun)(db, `UPDATE watched_episodes
       SET watchedSeconds = watchedSeconds + ?, watchedAt = CURRENT_TIMESTAMP
       WHERE userId = ? AND showId = ? AND episodeNumber = ?`, [seconds, userId, showId, episodeNumber]),
    deleteByShow: (db, userId, showId) => (0, db_utils_1.dbRun)(db, 'DELETE FROM watched_episodes WHERE userId = ? AND showId = ?', [userId, showId]),
    deleteActivityByShow: (db, userId, showId) => (0, db_utils_1.dbRun)(db, 'DELETE FROM watch_activity WHERE userId = ? AND showId = ?', [userId, showId]),
    deleteAllByShow: (db, showId) => (0, db_utils_1.dbRun)(db, 'DELETE FROM watched_episodes WHERE showId = ?', [showId]),
    deleteAllActivityByShow: (db, showId) => (0, db_utils_1.dbRun)(db, 'DELETE FROM watch_activity WHERE showId = ?', [showId]),
    cleanupOrphanedProgress: (db) => (0, db_utils_1.dbRun)(db, 'DELETE FROM watched_episodes WHERE showId NOT IN (SELECT id FROM watchlist)'),
    getContinueWatching: (db, userId, limit) => {
        const limitClause = typeof limit === 'number' ? `LIMIT ${limit}` : '';
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
    `;
        return (0, db_utils_1.dbAll)(db, query, [userId, userId]);
    },
    getUpNextShows: (db, userId) => {
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
    `;
        return (0, db_utils_1.dbAll)(db, query, [userId]);
    },
    getEpisodesForShows: (db, userId, showIds) => {
        const placeholders = showIds.map(() => '?').join(',');
        return (0, db_utils_1.dbAll)(db, `SELECT userId, showId, episodeNumber, currentTime, duration, watchedSeconds, watchedAt FROM watched_episodes WHERE userId = ? AND showId IN (${placeholders})`, [userId, ...showIds]);
    },
};
