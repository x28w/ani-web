"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
process.setMaxListeners(100);
const events_1 = require("events");
events_1.EventEmitter.defaultMaxListeners = 100;
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const cors_1 = __importDefault(require("cors"));
const compression_1 = __importDefault(require("compression"));
const node_cache_1 = __importDefault(require("node-cache"));
const fs_1 = __importDefault(require("fs"));
const chokidar_1 = __importDefault(require("chokidar"));
const logger_1 = __importDefault(require("./logger"));
const allanime_provider_1 = require("./providers/allanime.provider");
const animepahe_provider_1 = require("./providers/animepahe.provider");
const _123anime_provider_1 = require("./providers/123anime.provider");
const animeya_provider_1 = require("./providers/animeya.provider");
const _2embed_provider_1 = require("./providers/2embed.provider");
const megaplay_provider_1 = require("./providers/megaplay.provider");
const config_1 = require("./config");
const sync_1 = require("./sync");
const auth_routes_1 = require("./routes/auth.routes");
const watchlist_routes_1 = require("./routes/watchlist.routes");
const data_routes_1 = require("./routes/data.routes");
const proxy_routes_1 = require("./routes/proxy.routes");
const settings_routes_1 = require("./routes/settings.routes");
const insights_routes_1 = require("./routes/insights.routes");
const site_auth_1 = require("./site-auth");
const app = (0, express_1.default)();
const apiCache = new node_cache_1.default({ stdTTL: 3600 });
const allAnimeProvider = new allanime_provider_1.AllAnimeProvider(apiCache);
const animePaheProvider = new animepahe_provider_1.AnimePaheProvider(apiCache);
const _123AnimeProvider = new _123anime_provider_1._123AnimeProvider(apiCache);
const animeyaProvider = new animeya_provider_1.AnimeyaProvider(apiCache);
const twoEmbedProvider = new _2embed_provider_1.TwoEmbedProvider(apiCache);
const megaPlayProvider = new megaplay_provider_1.MegaPlayProvider(apiCache);
const providers = {
    allanime: allAnimeProvider,
    animepahe: animePaheProvider,
    '123anime': _123AnimeProvider,
    animeya: animeyaProvider,
    '2embed': twoEmbedProvider,
    megaplay: megaPlayProvider,
};
let db;
let isShuttingDown = false;
async function runSyncSequence(database, preferredProvider) {
    const dbName = config_1.CONFIG.IS_DEV ? config_1.CONFIG.DB_NAME_DEV : config_1.CONFIG.DB_NAME_PROD;
    const dbPath = path_1.default.join(config_1.CONFIG.ROOT, dbName);
    const remoteFolder = config_1.CONFIG.IS_DEV ? config_1.CONFIG.REMOTE_FOLDER_DEV : config_1.CONFIG.REMOTE_FOLDER_PROD;
    await (0, sync_1.initSyncProvider)(preferredProvider);
    const didDownload = await (0, sync_1.syncDownOnBoot)(database, dbPath, remoteFolder, () => {
        return new Promise((resolve) => {
            if (database && !database.isClosedCheck()) {
                database.checkpoint();
                database.close(() => resolve());
            }
            else {
                resolve();
            }
        });
    });
    if (didDownload) {
        db = await (0, sync_1.initializeDatabase)(dbPath);
        logger_1.default.info('Database re-initialized after sync.');
    }
}
app.use((req, res, next) => {
    if (isShuttingDown) {
        return res.status(503).send('Server is shutting down...');
    }
    if (!db) {
        return res.status(503).send('Database initializing...');
    }
    req.db = db;
    next();
});
// axiosRetry is applied only on the dedicated proxy axiosInstance (proxy.controller.ts)
// to avoid amplifying retries on providers that already have their own fallback logic.
app.use((0, compression_1.default)({
    level: 2,
    threshold: 1024,
    filter: (req, res) => {
        if (req.headers['x-no-compression']) {
            return false;
        }
        return compression_1.default.filter(req, res);
    },
}));
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '10mb' }));
app.use('/api/site-auth', (0, site_auth_1.createSiteAuthRouter)());
app.use('/api/auth', site_auth_1.requireSiteAdmin, (0, auth_routes_1.createAuthRouter)((database, provider) => runSyncSequence(database, provider)));
app.use('/api', site_auth_1.requireSiteAuth, (0, watchlist_routes_1.createWatchlistRouter)(allAnimeProvider));
app.use('/api', site_auth_1.requireSiteAuth, (0, data_routes_1.createDataRouter)(apiCache, providers));
app.use('/api', site_auth_1.requireSiteAuth, (0, proxy_routes_1.createProxyRouter)());
app.use('/api', site_auth_1.requireSiteAuth, (0, insights_routes_1.createInsightsRouter)(allAnimeProvider));
app.use('/api', site_auth_1.requireSiteAuth, (0, settings_routes_1.createSettingsRouter)(allAnimeProvider, () => db, sync_1.initializeDatabase, (newDb) => {
    db = newDb;
}));
if (!config_1.CONFIG.IS_DEV) {
    const frontendPath = path_1.default.join(config_1.CONFIG.PACKAGE_ROOT, 'client', 'dist');
    logger_1.default.info(`Serving frontend from: ${frontendPath}`);
    app.use(express_1.default.static(frontendPath));
    app.get(/^(?!\/api).+/, (req, res) => {
        res.sendFile('index.html', { root: frontendPath }, (err) => {
            if (err) {
                logger_1.default.error({ err }, `Failed to serve index.html from ${frontendPath}`);
                if (!res.headersSent) {
                    res.status(500).send('Server Error: Frontend build not found.');
                }
            }
        });
    });
}
app.use((err, req, res, next) => {
    logger_1.default.error({ err, url: req.url, method: req.method }, 'Unhandled error');
    if (res.headersSent) {
        return next(err);
    }
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
        status: err.status || 500,
    });
});
async function main() {
    logger_1.default.info('DEBUG: main() started');
    const dbName = config_1.CONFIG.IS_DEV ? config_1.CONFIG.DB_NAME_DEV : config_1.CONFIG.DB_NAME_PROD;
    const dbPath = path_1.default.join(config_1.CONFIG.ROOT, dbName);
    const remoteFolder = config_1.CONFIG.IS_DEV ? config_1.CONFIG.REMOTE_FOLDER_DEV : config_1.CONFIG.REMOTE_FOLDER_PROD;
    db = await (0, sync_1.initializeDatabase)(dbPath);
    logger_1.default.info(`Database initialized at ${dbPath}`);
    await runSyncSequence(db);
    if (!fs_1.default.existsSync(config_1.CONFIG.LOCAL_MANIFEST_PATH)) {
        fs_1.default.writeFileSync(config_1.CONFIG.LOCAL_MANIFEST_PATH, JSON.stringify({ version: 0 }));
    }
    const watcher = chokidar_1.default.watch(config_1.CONFIG.LOCAL_MANIFEST_PATH, {
        persistent: true,
        ignoreInitial: true,
    });
    let debounceTimer;
    const HOST = process.env.IP || process.env.HOST || '::';
    const expressServer = app.listen(config_1.CONFIG.PORT, HOST, () => {
        logger_1.default.info(`Server running on http://${HOST}:${config_1.CONFIG.PORT}`);
    });
    watcher.on('change', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => (0, sync_1.syncUp)(db, dbPath, remoteFolder), 60000);
    });
    const shutdown = async (signal) => {
        if (isShuttingDown)
            return;
        isShuttingDown = true;
        clearTimeout(debounceTimer);
        // Close the watcher first to prevent a stale 'change' event from arming
        // a new debounce timer that would call syncUp on an already-closed database.
        await watcher.close();
        if (expressServer) {
            expressServer.close();
        }
        try {
            await (0, sync_1.syncUp)(db, dbPath, remoteFolder);
        }
        catch (e) {
            console.error('Sync failed:', e);
        }
        await (0, sync_1.waitForSync)();
        db.close(() => {
            console.log('[SERVER_EXIT]');
            setTimeout(() => {
                if (signal === 'SIGUSR2') {
                    process.kill(process.pid, 'SIGUSR2');
                }
                else {
                    process.exit(0);
                }
            }, 600);
        });
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGUSR2', () => shutdown('SIGUSR2'));
    app.post('/api/internal/shutdown', (req, res) => {
        if (req.ip === '::1' || req.ip === '127.0.0.1' || req.ip === '::ffff:127.0.0.1') {
            res.status(200).json({ message: 'Shutting down' });
            setTimeout(() => shutdown(), 500);
        }
        else {
            res.status(403).send('Forbidden');
        }
    });
}
main().catch((err) => {
    console.error('Server failed to start:', err);
    process.exit(1);
});
