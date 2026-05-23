"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.waitForSync = waitForSync;
exports.getActiveProvider = getActiveProvider;
exports.initSyncProvider = initSyncProvider;
exports.getLocalManifestVersion = getLocalManifestVersion;
exports.setLocalManifestVersion = setLocalManifestVersion;
exports.syncDownOnBoot = syncDownOnBoot;
exports.syncUp = syncUp;
exports.performWriteTransaction = performWriteTransaction;
exports.initializeDatabase = initializeDatabase;
const fs = __importStar(require("fs/promises"));
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const logger_1 = __importDefault(require("./logger"));
const google_1 = require("./google");
const rclone_1 = require("./rclone");
const github_sync_1 = require("./github-sync");
const config_1 = require("./config");
const db_1 = require("./db");
const db_utils_1 = require("./utils/db-utils");
const log = logger_1.default.child({ module: 'Sync' });
class Mutex {
    _locked = false;
    _waiting = [];
    async lock() {
        return new Promise((resolve) => {
            if (!this._locked) {
                this._locked = true;
                resolve();
            }
            else {
                this._waiting.push(resolve);
            }
        });
    }
    unlock() {
        if (this._waiting.length > 0) {
            const resolve = this._waiting.shift();
            resolve();
        }
        else {
            this._locked = false;
        }
    }
}
const syncMutex = new Mutex();
let isSyncing = false;
let activeProvider = 'none';
function getDefaultProgressUserId() {
    if (process.env.SITE_USERS) {
        try {
            const users = JSON.parse(process.env.SITE_USERS);
            if (Array.isArray(users)) {
                const firstUser = users.find((user) => typeof user?.username === 'string');
                if (firstUser?.username?.trim())
                    return firstUser.username.trim();
            }
        }
        catch {
            return 'local';
        }
    }
    return process.env.SITE_LOGIN_USER?.trim() || 'local';
}
function getTableColumns(db, tableName) {
    let columns = [];
    db.all(`PRAGMA table_info(${tableName})`, (error, rows) => {
        if (error)
            throw error;
        columns = rows.map((row) => row.name);
    });
    return columns;
}
function migrateWatchedEpisodesForUsers(db, initOpts) {
    const columns = getTableColumns(db, 'watched_episodes');
    if (columns.includes('userId'))
        return;
    const defaultUserId = getDefaultProgressUserId().replace(/'/g, "''");
    db.run(`CREATE TABLE IF NOT EXISTS watched_episodes_new (
      userId TEXT NOT NULL,
      showId TEXT NOT NULL,
      episodeNumber TEXT NOT NULL,
      watchedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      currentTime REAL DEFAULT 0,
      duration REAL DEFAULT 0,
      PRIMARY KEY (userId, showId, episodeNumber)
    )`, undefined, undefined, initOpts);
    db.run(`INSERT OR REPLACE INTO watched_episodes_new (userId, showId, episodeNumber, watchedAt, currentTime, duration)
     SELECT '${defaultUserId}', showId, episodeNumber, watchedAt, currentTime, duration FROM watched_episodes`, undefined, undefined, initOpts);
    db.run('DROP TABLE watched_episodes', undefined, undefined, initOpts);
    db.run('ALTER TABLE watched_episodes_new RENAME TO watched_episodes', undefined, undefined, initOpts);
}
async function waitForSync() {
    await syncMutex.lock();
    syncMutex.unlock();
}
function getActiveProvider() {
    return activeProvider;
}
async function initSyncProvider(preferred) {
    const provider = preferred || process.env.SYNC_PROVIDER;
    if (provider === 'github' && github_sync_1.githubSyncService.isAuthenticated()) {
        activeProvider = 'github';
        log.info('Sync Provider: GitHub (Selected)');
        return;
    }
    if (provider === 'google' && google_1.googleDriveService.isAuthenticated()) {
        activeProvider = 'google';
        log.info('Sync Provider: Google Drive API (Selected)');
        return;
    }
    if (provider === 'rclone') {
        const rcloneAvailable = await rclone_1.rcloneService.init();
        if (rcloneAvailable) {
            activeProvider = 'rclone';
            log.info(`Sync Provider: Rclone (${rclone_1.rcloneService.getRemoteName()}) (Selected)`);
            return;
        }
    }
    if (provider === 'none') {
        activeProvider = 'none';
        log.info('Sync Provider: None (Forced)');
        return;
    }
    // Fallback to priority if no preferred provider is authenticated
    if (github_sync_1.githubSyncService.isAuthenticated()) {
        activeProvider = 'github';
        log.info('Sync Provider: GitHub (Fallback)');
        return;
    }
    if (google_1.googleDriveService.isAuthenticated()) {
        activeProvider = 'google';
        log.info('Sync Provider: Google Drive API (Fallback)');
        return;
    }
    const rcloneAvailable = await rclone_1.rcloneService.init();
    if (rcloneAvailable) {
        activeProvider = 'rclone';
        log.info(`Sync Provider: Rclone (${rclone_1.rcloneService.getRemoteName()}) (Fallback)`);
        return;
    }
    activeProvider = 'none';
    log.info('No sync provider available.');
}
async function getLocalManifestVersion() {
    if ((0, fs_1.existsSync)(config_1.CONFIG.LOCAL_MANIFEST_PATH)) {
        try {
            const content = await fs.readFile(config_1.CONFIG.LOCAL_MANIFEST_PATH, 'utf-8');
            return JSON.parse(content).version || 0;
        }
        catch {
            return 0;
        }
    }
    return 0;
}
async function setLocalManifestVersion(version) {
    await fs.writeFile(config_1.CONFIG.LOCAL_MANIFEST_PATH, JSON.stringify({ version }));
}
async function getRemoteManifestVersion(remoteFolder) {
    try {
        if (activeProvider === 'github') {
            if (!github_sync_1.githubSyncService.isAuthenticated())
                return { version: 0 };
            return { version: await github_sync_1.githubSyncService.getRemoteVersion() };
        }
        else if (activeProvider === 'google') {
            if (!google_1.googleDriveService.isAuthenticated())
                return { version: 0 };
            const folderId = await google_1.googleDriveService.ensureFolder(remoteFolder);
            const file = await google_1.googleDriveService.findFile(config_1.CONFIG.MANIFEST_FILENAME, folderId);
            if (!file)
                return { version: 0 };
            const tempPath = path_1.default.join(config_1.CONFIG.ROOT, `temp_${Date.now()}_manifest.json`);
            try {
                await google_1.googleDriveService.downloadFile(file.id, tempPath);
                const content = await fs.readFile(tempPath, 'utf-8');
                return { version: JSON.parse(content).version || 0, fileId: file.id };
            }
            finally {
                if ((0, fs_1.existsSync)(tempPath))
                    await fs.unlink(tempPath);
            }
        }
        else if (activeProvider === 'rclone') {
            const exists = await rclone_1.rcloneService.fileExists(remoteFolder, config_1.CONFIG.MANIFEST_FILENAME);
            if (!exists)
                return { version: 0 };
            const tempPath = path_1.default.join(config_1.CONFIG.ROOT, `temp_${Date.now()}_manifest.json`);
            try {
                await rclone_1.rcloneService.downloadFile(remoteFolder, config_1.CONFIG.MANIFEST_FILENAME, tempPath);
                const content = await fs.readFile(tempPath, 'utf-8');
                return { version: JSON.parse(content).version || 0 };
            }
            finally {
                if ((0, fs_1.existsSync)(tempPath))
                    await fs.unlink(tempPath);
            }
        }
    }
    catch (err) {
        log.warn({ err }, 'Could not read remote manifest.');
    }
    return { version: 0 };
}
async function syncDownOnBoot(db, dbPath, remoteFolderName, closeMainDb) {
    let localVersion = await getLocalManifestVersion();
    if (localVersion === 0 && db) {
        const row = await (0, db_utils_1.dbGet)(db, "SELECT value FROM sync_metadata WHERE key = 'db_version'");
        localVersion = row?.value ?? 0;
        if (localVersion > 0) {
            await setLocalManifestVersion(localVersion);
        }
    }
    if (activeProvider === 'none')
        return false;
    await syncMutex.lock();
    if (isSyncing) {
        syncMutex.unlock();
        return false;
    }
    isSyncing = true;
    try {
        console.log(`[SYNC_START] Initial sync check (${activeProvider})`);
        const { version: remoteVersion } = await getRemoteManifestVersion(remoteFolderName);
        console.log('[SYNC_END]');
        log.info(`Sync Check: Local v${localVersion} vs Remote v${remoteVersion}`);
        if (remoteVersion > localVersion) {
            if (activeProvider === 'github') {
                if (!github_sync_1.githubSyncService.isAuthenticated())
                    return false;
                console.log(`[SYNC_START] Importing GitHub sync data (Remote v${remoteVersion})`);
                const importedVersion = await github_sync_1.githubSyncService.syncDown(db);
                await setLocalManifestVersion(importedVersion || remoteVersion);
                console.log('[SYNC_END]');
                log.info('GitHub sync down complete.');
                return false;
            }
            console.log(`[SYNC_START] Downloading remote database (Remote v${remoteVersion})`);
            await closeMainDb();
            const backupPath = `${dbPath}.bak`;
            const dbName = path_1.default.basename(dbPath);
            try {
                if ((0, fs_1.existsSync)(dbPath)) {
                    await fs.copyFile(dbPath, backupPath);
                }
                try {
                    await fs.unlink(`${dbPath}-wal`);
                }
                catch (e) {
                    void e;
                }
                try {
                    await fs.unlink(`${dbPath}-shm`);
                }
                catch (e) {
                    void e;
                }
                if (activeProvider === 'google') {
                    if (!google_1.googleDriveService.isAuthenticated())
                        return true;
                    const folderId = await google_1.googleDriveService.ensureFolder(remoteFolderName);
                    const remoteDb = await google_1.googleDriveService.findFile(dbName, folderId);
                    const remoteManifest = await google_1.googleDriveService.findFile(config_1.CONFIG.MANIFEST_FILENAME, folderId);
                    if (remoteDb)
                        await google_1.googleDriveService.downloadFile(remoteDb.id, dbPath);
                    if (remoteManifest)
                        await google_1.googleDriveService.downloadFile(remoteManifest.id, config_1.CONFIG.LOCAL_MANIFEST_PATH);
                }
                else if (activeProvider === 'rclone') {
                    await rclone_1.rcloneService.downloadFile(remoteFolderName, dbName, dbPath);
                    await rclone_1.rcloneService.downloadFile(remoteFolderName, config_1.CONFIG.MANIFEST_FILENAME, config_1.CONFIG.LOCAL_MANIFEST_PATH);
                }
                if ((0, fs_1.existsSync)(backupPath)) {
                    await fs.unlink(backupPath);
                }
                console.log('[SYNC_END]');
                log.info('Sync down complete.');
                return true;
            }
            catch (err) {
                console.log('[SYNC_END]');
                log.error({ err }, 'Sync down failed. Restoring backup.');
                if ((0, fs_1.existsSync)(backupPath)) {
                    try {
                        await fs.copyFile(backupPath, dbPath);
                        log.info('Backup restored successfully after failed sync down.');
                    }
                    catch (restoreErr) {
                        log.error({ err: restoreErr }, 'Critical: restore from backup also failed.');
                        // The DB may be corrupt - propagate so the caller can exit cleanly.
                        throw new Error('Sync down and restore both failed. Database may be corrupt.', {
                            cause: restoreErr,
                        });
                    }
                }
                // DB was already closed before the attempt; re-open is required regardless.
                return true;
            }
        }
        else {
            log.info('Local DB is up to date.');
            return false;
        }
    }
    catch (err) {
        console.log('[SYNC_END]');
        log.error({ err }, 'Sync boot error.');
        return false;
    }
    finally {
        isSyncing = false;
        syncMutex.unlock();
    }
}
async function syncUp(db, dbPath, remoteFolderName) {
    if (activeProvider === 'none')
        return;
    await syncMutex.lock();
    if (isSyncing) {
        syncMutex.unlock();
        return;
    }
    isSyncing = true;
    try {
        const localVersion = await getLocalManifestVersion();
        console.log(`[SYNC_START] Syncing up (Local v${localVersion})`);
        const { version: remoteVersion, fileId: manifestId } = await getRemoteManifestVersion(remoteFolderName);
        if (localVersion > remoteVersion) {
            const dbName = path_1.default.basename(dbPath);
            const syncDbPath = `${dbPath}.sync.db`;
            try {
                if (activeProvider === 'github') {
                    if (!github_sync_1.githubSyncService.isAuthenticated())
                        return;
                    await github_sync_1.githubSyncService.syncUp(db);
                }
                else {
                    db.backup(syncDbPath);
                }
                if (activeProvider === 'google') {
                    if (!google_1.googleDriveService.isAuthenticated())
                        return;
                    const folderId = await google_1.googleDriveService.ensureFolder(remoteFolderName);
                    const remoteDbFile = await google_1.googleDriveService.findFile(dbName, folderId);
                    await google_1.googleDriveService.uploadFile(syncDbPath, dbName, 'application/x-sqlite3', folderId, remoteDbFile?.id);
                    await google_1.googleDriveService.uploadFile(config_1.CONFIG.LOCAL_MANIFEST_PATH, config_1.CONFIG.MANIFEST_FILENAME, 'application/json', folderId, manifestId);
                }
                else if (activeProvider === 'rclone') {
                    await rclone_1.rcloneService.uploadFile(syncDbPath, remoteFolderName, dbName);
                    await rclone_1.rcloneService.uploadFile(config_1.CONFIG.LOCAL_MANIFEST_PATH, remoteFolderName, config_1.CONFIG.MANIFEST_FILENAME);
                }
            }
            finally {
                if ((0, fs_1.existsSync)(syncDbPath))
                    await fs.unlink(syncDbPath).catch(() => { });
            }
            console.log('[SYNC_END]');
            log.info('Sync up complete.');
        }
        else {
            console.log('[SYNC_END]');
            log.info('No changes to sync up or remote is newer.');
        }
    }
    catch (err) {
        console.log('[SYNC_END]');
        log.error({ err }, 'Sync up failed.');
    }
    finally {
        isSyncing = false;
        syncMutex.unlock();
    }
}
async function performWriteTransaction(db, runnable) {
    // node:sqlite is fully synchronous - serialize/run/get all complete before returning,
    // so we can avoid the nested Promise/callback pattern that could hang forever if
    // setLocalManifestVersion threw after resolve/reject was no longer reachable.
    db.serialize(() => {
        runnable(db);
        db.run("UPDATE sync_metadata SET value = value + 1 WHERE key = 'db_version'");
    });
    // Capture version synchronously; the callback fires immediately with node:sqlite.
    const row = await (0, db_utils_1.dbGet)(db, "SELECT value FROM sync_metadata WHERE key = 'db_version'");
    const newVersion = row?.value ?? 1;
    // Only the manifest write is truly async (disk I/O); errors here propagate normally.
    await setLocalManifestVersion(newVersion);
}
async function initializeDatabase(dbPath) {
    try {
        const db = await db_1.DatabaseWrapper.create(dbPath);
        db.configure('busyTimeout', 5000);
        db.run('PRAGMA journal_mode = WAL;');
        db.run('PRAGMA synchronous = NORMAL;');
        db.run('PRAGMA cache_size = -20000;');
        db.run('PRAGMA temp_store = MEMORY;');
        db.run('PRAGMA mmap_size = 268435456;');
        db.run('PRAGMA foreign_keys = ON;');
        const initOpts = { skipSave: true };
        db.run(`CREATE TABLE IF NOT EXISTS watchlist (id TEXT NOT NULL, name TEXT, thumbnail TEXT, status TEXT, nativeName TEXT, englishName TEXT, type TEXT, PRIMARY KEY (id))`, undefined, undefined, initOpts);
        db.run(`CREATE TABLE IF NOT EXISTS watched_episodes (userId TEXT NOT NULL DEFAULT 'local', showId TEXT NOT NULL, episodeNumber TEXT NOT NULL, watchedAt DATETIME DEFAULT CURRENT_TIMESTAMP, currentTime REAL DEFAULT 0, duration REAL DEFAULT 0, PRIMARY KEY (userId, showId, episodeNumber))`, undefined, undefined, initOpts);
        migrateWatchedEpisodesForUsers(db, initOpts);
        db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT NOT NULL, value TEXT, PRIMARY KEY (key))`, undefined, undefined, initOpts);
        db.run(`CREATE TABLE IF NOT EXISTS shows_meta (id TEXT PRIMARY KEY, name TEXT, thumbnail TEXT, nativeName TEXT, englishName TEXT, episodeCount INTEGER, status TEXT, genres TEXT, popularityScore INTEGER, type TEXT)`, undefined, undefined, initOpts);
        db.run(`CREATE TABLE IF NOT EXISTS dismissed_notifications (showId TEXT NOT NULL, episodeNumber TEXT NOT NULL, dismissedAt DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (showId, episodeNumber))`, undefined, undefined, initOpts);
        db.run(`CREATE TABLE IF NOT EXISTS discovered_notifications (showId TEXT NOT NULL, episodeNumber TEXT NOT NULL, discoveredAt DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (showId, episodeNumber))`, undefined, undefined, initOpts);
        db.run(`CREATE TABLE IF NOT EXISTS sync_metadata (key TEXT PRIMARY KEY, value INTEGER)`, undefined, undefined, initOpts);
        db.run(`INSERT OR IGNORE INTO sync_metadata (key, value) VALUES ('db_version', 1)`, undefined, undefined, initOpts);
        db.run(`CREATE INDEX IF NOT EXISTS idx_watched_episodes_showId ON watched_episodes(showId)`, undefined, undefined, initOpts);
        db.run(`CREATE INDEX IF NOT EXISTS idx_watched_episodes_userId ON watched_episodes(userId)`, undefined, undefined, initOpts);
        db.run(`CREATE INDEX IF NOT EXISTS idx_watched_episodes_showId_episodeNumber ON watched_episodes(userId, showId, episodeNumber)`, undefined, undefined, initOpts);
        db.run(`CREATE INDEX IF NOT EXISTS idx_watched_episodes_watchedAt ON watched_episodes(watchedAt)`, undefined, undefined, initOpts);
        db.run(`CREATE INDEX IF NOT EXISTS idx_watchlist_status ON watchlist(status)`, undefined, undefined, initOpts);
        db.run('DELETE FROM dismissed_notifications WHERE showId NOT IN (SELECT id FROM watchlist)');
        db.run('DELETE FROM discovered_notifications WHERE showId NOT IN (SELECT id FROM watchlist)');
        db.run('DELETE FROM dismissed_notifications WHERE EXISTS (SELECT 1 FROM watched_episodes we WHERE we.showId = dismissed_notifications.showId AND we.episodeNumber = dismissed_notifications.episodeNumber)');
        db.run('DELETE FROM discovered_notifications WHERE EXISTS (SELECT 1 FROM watched_episodes we WHERE we.showId = discovered_notifications.showId AND we.episodeNumber = discovered_notifications.episodeNumber)');
        const addCol = (tbl, col, type) => {
            db.all(`PRAGMA table_info(${tbl})`, (e, r) => {
                const columns = r;
                if (!columns.some((c) => c.name === col))
                    db.run(`ALTER TABLE ${tbl} ADD COLUMN ${col} ${type}`, undefined, undefined, initOpts);
            });
        };
        addCol('watchlist', 'nativeName', 'TEXT');
        addCol('watchlist', 'englishName', 'TEXT');
        addCol('shows_meta', 'nativeName', 'TEXT');
        addCol('shows_meta', 'englishName', 'TEXT');
        addCol('shows_meta', 'episodeCount', 'INTEGER');
        addCol('shows_meta', 'status', 'TEXT');
        addCol('shows_meta', 'genres', 'TEXT');
        addCol('shows_meta', 'popularityScore', 'INTEGER');
        addCol('watchlist', 'type', 'TEXT');
        addCol('shows_meta', 'type', 'TEXT');
        await db.saveNow();
        return db;
    }
    catch (err) {
        log.error({ err }, 'Database opening error');
        throw err;
    }
}
