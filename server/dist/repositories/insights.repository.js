"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InsightsRepository = void 0;
const db_utils_1 = require("../utils/db-utils");
exports.InsightsRepository = {
    getCoreStats: (db) => (0, db_utils_1.dbGet)(db, `SELECT
        (SELECT SUM(currentTime) FROM watched_episodes) as totalSeconds,
        (SELECT COUNT(*) FROM watched_episodes) as totalEpisodes,
        (SELECT COUNT(*) FROM watchlist WHERE status = 'Completed') as completedCount,
        (SELECT COUNT(*) FROM watchlist) as totalWatchlist`),
    getActivityGrid: (db) => (0, db_utils_1.dbAll)(db, `SELECT date(watchedAt) as day, COUNT(*) as count FROM watched_episodes GROUP BY day`),
    getHourlyDist: (db) => (0, db_utils_1.dbAll)(db, `SELECT strftime('%H', watchedAt) as hour, COUNT(*) as count FROM watched_episodes GROUP BY hour`),
    getSeasonality: (db) => (0, db_utils_1.dbAll)(db, `SELECT strftime('%m', watchedAt) as month, SUM(currentTime) as seconds FROM watched_episodes GROUP BY month`),
    getAllWatches: (db) => (0, db_utils_1.dbAll)(db, 'SELECT watchedAt, currentTime FROM watched_episodes ORDER BY watchedAt ASC'),
    getWatchedShowsMeta: (db) => (0, db_utils_1.dbAll)(db, `SELECT DISTINCT sm.id, sm.genres, sm.popularityScore
      FROM shows_meta sm
      JOIN watched_episodes we ON sm.id = we.showId`),
    getDroppedShows: (db) => (0, db_utils_1.dbAll)(db, `SELECT w.id, w.name, MAX(we.watchedAt) as lastActivity
        FROM watchlist w
        JOIN watched_episodes we ON w.id = we.showId
        WHERE w.status = 'Watching'
        GROUP BY w.id
        HAVING lastActivity < date('now', '-90 days')`),
    getCompletionVelocities: (db) => (0, db_utils_1.dbAll)(db, `SELECT
        (julianday(MAX(we.watchedAt)) - julianday(MIN(we.watchedAt))) as daysToFinish
        FROM watchlist w
        JOIN watched_episodes we ON w.id = we.showId
        WHERE w.status = 'Completed'
        GROUP BY w.id`),
};
