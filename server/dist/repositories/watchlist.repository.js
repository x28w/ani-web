"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WatchlistRepository = void 0;
const db_utils_1 = require("../utils/db-utils");
exports.WatchlistRepository = {
    getById: (db, id) => (0, db_utils_1.dbGet)(db, 'SELECT * FROM watchlist WHERE id = ?', [id]),
    exists: async (db, id) => {
        const row = await (0, db_utils_1.dbGet)(db, 'SELECT EXISTS(SELECT 1 FROM watchlist WHERE id = ?) as inWatchlist', [id]);
        return !!(row && row.inWatchlist);
    },
    getAll: (db, status, limit, offset) => {
        let query = 'SELECT * FROM watchlist';
        const params = [];
        if (status && status !== 'All') {
            query += ' WHERE status = ?';
            params.push(status);
        }
        query += ' ORDER BY rowid DESC';
        if (limit !== undefined && offset !== undefined) {
            query += ' LIMIT ? OFFSET ?';
            params.push(limit, offset);
        }
        return (0, db_utils_1.dbAll)(db, query, params);
    },
    getCount: async (db, status) => {
        let query = 'SELECT COUNT(*) as total FROM watchlist';
        const params = [];
        if (status && status !== 'All') {
            query += ' WHERE status = ?';
            params.push(status);
        }
        const row = await (0, db_utils_1.dbGet)(db, query, params);
        return row?.total || 0;
    },
    upsert: (db, data) => (0, db_utils_1.dbRun)(db, 'INSERT OR REPLACE INTO watchlist (id, name, thumbnail, status, nativeName, englishName, type) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        data.id,
        data.name,
        data.thumbnail,
        data.status,
        data.nativeName,
        data.englishName,
        data.type,
    ]),
    updateStatus: (db, id, status) => (0, db_utils_1.dbRun)(db, 'UPDATE watchlist SET status = ? WHERE id = ?', [status, id]),
    updateType: (db, id, type) => (0, db_utils_1.dbRun)(db, 'UPDATE watchlist SET type = ? WHERE id = ?', [type, id]),
    updateThumbnail: (db, id, thumbnail) => (0, db_utils_1.dbRun)(db, 'UPDATE watchlist SET thumbnail = ? WHERE id = ?', [thumbnail, id]),
    delete: (db, id) => (0, db_utils_1.dbRun)(db, 'DELETE FROM watchlist WHERE id = ?', [id]),
    getWatchingShows: (db) => (0, db_utils_1.dbAll)(db, "SELECT id, name, thumbnail, nativeName, englishName FROM watchlist WHERE status = 'Watching'"),
};
