"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsController = void 0;
const sync_1 = require("../sync");
const xml2js_1 = require("xml2js");
const logger_1 = __importDefault(require("../logger"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const config_1 = require("../config");
const settings_repository_1 = require("../repositories/settings.repository");
const async_handler_1 = require("../utils/async-handler");
class SettingsController {
    provider;
    constructor(provider) {
        this.provider = provider;
    }
    getSettings = async (req, res) => {
        try {
            const row = await settings_repository_1.SettingsRepository.getByKey(req.db, req.query.key);
            res.json({ value: row ? row.value : null });
        }
        catch {
            res.status(500).json({ error: 'DB error' });
        }
    };
    updateSettings = async (req, res) => {
        try {
            const key = String(req.body.key || '');
            if (req.siteUser?.role === 'guest') {
                if (key === 'titlePreference')
                    return res.json({ success: true });
                return res.status(403).json({ error: 'Guest settings are limited.' });
            }
            await (0, sync_1.performWriteTransaction)(req.db, (tx) => {
                settings_repository_1.SettingsRepository.upsert(tx, key, String(req.body.value));
            });
            res.json({ success: true });
        }
        catch {
            res.status(500).json({ error: 'DB error' });
        }
    };
    backupDatabase = (req, res) => {
        const backupPath = path_1.default.join(config_1.CONFIG.ROOT, 'ani-web-backup.db');
        try {
            req.db.backup(backupPath);
            res.download(backupPath, 'ani-web-backup.db', () => {
                fs_1.default.unlink(backupPath, () => { });
            });
        }
        catch (err) {
            logger_1.default.error({ err }, 'Manual backup failed');
            return res.status(500).json({ error: 'Backup failed' });
        }
    };
    restoreDatabase = (req, res, db, initializeDatabase, setDb) => {
        if (!req.file)
            return res.status(400).json({ error: 'No file uploaded.' });
        const dbName = config_1.CONFIG.IS_DEV ? config_1.CONFIG.DB_NAME_DEV : config_1.CONFIG.DB_NAME_PROD;
        const tempPath = path_1.default.join(config_1.CONFIG.ROOT, `restore_temp.db`);
        const dbPath = path_1.default.join(config_1.CONFIG.ROOT, dbName);
        db.close((closeErr) => {
            if (closeErr)
                return res.status(500).json({ error: 'Failed to close database.' });
            try {
                req.db.checkpoint();
            }
            catch (checkpointErr) {
                logger_1.default.warn({ err: checkpointErr }, 'WAL checkpoint failed');
            }
            try {
                if (fs_1.default.existsSync(`${dbPath}-wal`))
                    fs_1.default.unlinkSync(`${dbPath}-wal`);
                if (fs_1.default.existsSync(`${dbPath}-shm`))
                    fs_1.default.unlinkSync(`${dbPath}-shm`);
            }
            catch (cleanupErr) {
                logger_1.default.warn({ err: cleanupErr }, 'Failed to clean up WAL files');
            }
            fs_1.default.rename(tempPath, dbPath, async (renameErr) => {
                if (renameErr) {
                    try {
                        const reopenedDb = await initializeDatabase(dbPath);
                        setDb(reopenedDb);
                        req.db = reopenedDb;
                    }
                    catch (e) {
                        logger_1.default.error({ err: e }, 'Failed to reopen DB after rename failure');
                    }
                    return res.status(500).json({ error: 'Failed to replace database file.' });
                }
                try {
                    const newDb = await initializeDatabase(dbPath);
                    setDb(newDb);
                    req.db = newDb;
                    res.json({ success: true, message: 'Database restored.' });
                }
                catch (e) {
                    logger_1.default.error({ err: e }, 'Failed to initialize restored database');
                    res.status(500).json({ error: 'Failed to initialize restored database.' });
                }
            });
        });
    };
    importMalXml = (0, async_handler_1.asyncHandler)(async (req, res) => {
        if (!req.file)
            return res.status(400).json({ error: 'No file' });
        const { erase } = req.body;
        let result;
        try {
            result = await (0, xml2js_1.parseStringPromise)(req.file.buffer.toString());
        }
        catch {
            return res.status(400).json({ error: 'Invalid XML' });
        }
        const animeList = result?.myanimelist?.anime || [];
        let skippedCount = 0;
        const showsToInsert = [];
        const BATCH_SIZE = 5;
        for (let i = 0; i < animeList.length; i += BATCH_SIZE) {
            const batch = animeList.slice(i, i + BATCH_SIZE);
            const batchResults = await Promise.allSettled(batch.map((item) => this.provider.search({ query: item.series_title[0] })));
            batchResults.forEach((r, idx) => {
                if (r.status === 'fulfilled' && r.value.length > 0) {
                    showsToInsert.push({
                        id: r.value[0]._id,
                        name: r.value[0].name,
                        thumbnail: r.value[0].thumbnail,
                        status: batch[idx].my_status[0],
                    });
                }
                else {
                    skippedCount++;
                }
            });
        }
        await (0, sync_1.performWriteTransaction)(req.db, (tx) => {
            if (erase)
                settings_repository_1.SettingsRepository.clearWatchlist(tx);
            settings_repository_1.SettingsRepository.upsertWatchlistBatch(tx, showsToInsert);
        });
        res.json({ imported: showsToInsert.length, skipped: skippedCount });
    });
}
exports.SettingsController = SettingsController;
