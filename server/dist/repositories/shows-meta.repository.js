"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShowsMetaRepository = void 0;
const db_utils_1 = require("../utils/db-utils");
exports.ShowsMetaRepository = {
    getById: (db, id) => (0, db_utils_1.dbGet)(db, 'SELECT * FROM shows_meta WHERE id = ?', [id]),
    getStatus: async (db, id) => {
        const row = await (0, db_utils_1.dbGet)(db, 'SELECT status FROM shows_meta WHERE id = ?', [
            id,
        ]);
        return row?.status;
    },
    upsert: (db, data) => (0, db_utils_1.dbRun)(db, `INSERT INTO shows_meta (id, name, thumbnail, nativeName, englishName, genres, popularityScore, status, episodeCount, type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = COALESCE(EXCLUDED.name, shows_meta.name),
         thumbnail = COALESCE(EXCLUDED.thumbnail, shows_meta.thumbnail),
         nativeName = COALESCE(EXCLUDED.nativeName, shows_meta.nativeName),
         englishName = COALESCE(EXCLUDED.englishName, shows_meta.englishName),
         genres = COALESCE(EXCLUDED.genres, shows_meta.genres),
         popularityScore = COALESCE(EXCLUDED.popularityScore, shows_meta.popularityScore),
         status = COALESCE(EXCLUDED.status, shows_meta.status),
         episodeCount = COALESCE(EXCLUDED.episodeCount, shows_meta.episodeCount),
         type = COALESCE(EXCLUDED.type, shows_meta.type)`, [
        data.id,
        data.name,
        data.thumbnail,
        data.nativeName || '',
        data.englishName || '',
        data.genres || '',
        data.popularityScore || 0,
        data.status || '',
        data.episodeCount || 0,
        data.type || '',
    ]),
    updateEpisodeCount: (db, id, episodeCount) => (0, db_utils_1.dbRun)(db, 'UPDATE shows_meta SET episodeCount = ? WHERE id = ?', [episodeCount, id]),
    updateType: (db, id, type) => (0, db_utils_1.dbRun)(db, 'UPDATE shows_meta SET type = ? WHERE id = ?', [type, id]),
    updateThumbnail: (db, id, thumbnail) => (0, db_utils_1.dbRun)(db, 'UPDATE shows_meta SET thumbnail = ? WHERE id = ?', [thumbnail, id]),
    cleanupOrphanedMeta: (db) => (0, db_utils_1.dbRun)(db, 'DELETE FROM shows_meta WHERE id NOT IN (SELECT id FROM watchlist)'),
};
