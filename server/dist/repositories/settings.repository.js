"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsRepository = void 0;
const db_utils_1 = require("../utils/db-utils");
exports.SettingsRepository = {
    getByKey: (db, key) => (0, db_utils_1.dbGet)(db, 'SELECT value FROM settings WHERE key = ?', [key]),
    upsert: (db, key, value) => (0, db_utils_1.dbRun)(db, 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]),
    clearWatchlist: (db) => (0, db_utils_1.dbRun)(db, 'DELETE FROM watchlist'),
    upsertWatchlistBatch: (db, shows) => {
        const stmt = db.prepare('INSERT OR REPLACE INTO watchlist (id, name, thumbnail, status) VALUES (?, ?, ?, ?)');
        shows.forEach((show) => stmt.run(show.id, show.name, show.thumbnail, show.status));
    },
};
