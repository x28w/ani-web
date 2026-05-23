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
exports.AuthController = void 0;
const logger_1 = __importDefault(require("../logger"));
const google_1 = require("../google");
const github_sync_1 = require("../github-sync");
const sync_1 = require("../sync");
const config_1 = require("../config");
const rclone_1 = require("../rclone");
const async_handler_1 = require("../utils/async-handler");
class AuthController {
    runSyncSequence;
    constructor(runSyncSequence) {
        this.runSyncSequence = runSyncSequence;
    }
    getConfigStatus = (_req, res) => {
        const hasConfig = !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
        res.json({ hasConfig });
    };
    getGoogleAuthSettings = (_req, res) => {
        res.json({
            clientId: process.env.GOOGLE_CLIENT_ID || '',
            hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
        });
    };
    updateGoogleAuthSettings = (0, async_handler_1.asyncHandler)(async (req, res) => {
        const { clientId, clientSecret } = req.body;
        const { updateEnvFile } = await Promise.resolve().then(() => __importStar(require('../utils/env.utils')));
        const updates = {};
        if (typeof clientId === 'string') {
            updates.GOOGLE_CLIENT_ID = clientId;
        }
        if (typeof clientSecret === 'string') {
            updates.GOOGLE_CLIENT_SECRET = clientSecret;
        }
        await updateEnvFile(updates);
        res.json({ success: true });
    });
    getRcloneSettings = (0, async_handler_1.asyncHandler)(async (_req, res) => {
        const remotes = await rclone_1.rcloneService.listRemotes();
        res.json({
            remote: config_1.CONFIG.RCLONE_REMOTE || '',
            availableRemotes: remotes,
            activeRemote: rclone_1.rcloneService.isActive() ? rclone_1.rcloneService.getRemoteName() : null,
        });
    });
    getSyncSettings = (0, async_handler_1.asyncHandler)(async (_req, res) => {
        const { getActiveProvider } = await Promise.resolve().then(() => __importStar(require('../sync')));
        res.json({
            activeProvider: process.env.SYNC_PROVIDER || 'default',
            actualActiveProvider: getActiveProvider(),
            authenticatedProviders: {
                github: github_sync_1.githubSyncService.isAuthenticated(),
                google: google_1.googleDriveService.isAuthenticated(),
                rclone: rclone_1.rcloneService.isActive(),
            },
        });
    });
    updateSyncProvider = (0, async_handler_1.asyncHandler)(async (req, res) => {
        const { provider } = req.body;
        const { updateEnvFile } = await Promise.resolve().then(() => __importStar(require('../utils/env.utils')));
        const value = provider === 'default' ? '' : provider;
        await updateEnvFile({ SYNC_PROVIDER: value });
        await (0, sync_1.initSyncProvider)();
        res.json({ success: true, activeProvider: process.env.SYNC_PROVIDER || 'default' });
    });
    getGitHubAuthStatus = (0, async_handler_1.asyncHandler)(async (_req, res) => {
        try {
            const user = await github_sync_1.githubSyncService.getUserProfile();
            res.json({
                authenticated: !!user,
                user,
                device: github_sync_1.githubSyncService.getDeviceState(),
                clientId: process.env.GITHUB_CLIENT_ID || '',
                usingDefaultClientId: !process.env.GITHUB_CLIENT_ID,
            });
        }
        catch (error) {
            logger_1.default.error({ err: error }, 'Failed to fetch GitHub auth status');
            res.json({
                authenticated: false,
                user: null,
                device: github_sync_1.githubSyncService.getDeviceState(),
                clientId: process.env.GITHUB_CLIENT_ID || '',
                usingDefaultClientId: !process.env.GITHUB_CLIENT_ID,
            });
        }
    });
    startGitHubDeviceAuth = (0, async_handler_1.asyncHandler)(async (req, res) => {
        const state = await github_sync_1.githubSyncService.startDeviceAuth(req.db, this.runSyncSequence);
        res.json(state);
    });
    pollGitHubDeviceAuth = (_req, res) => {
        res.json(github_sync_1.githubSyncService.getDeviceState());
    };
    logoutGitHub = (0, async_handler_1.asyncHandler)(async (_req, res) => {
        await github_sync_1.githubSyncService.logout();
        const { updateEnvFile } = await Promise.resolve().then(() => __importStar(require('../utils/env.utils')));
        await updateEnvFile({ SYNC_PROVIDER: '' });
        await (0, sync_1.initSyncProvider)();
        res.json({ success: true });
    });
    updateRcloneSettings = (0, async_handler_1.asyncHandler)(async (req, res) => {
        const { remote } = req.body;
        const { updateEnvFile } = await Promise.resolve().then(() => __importStar(require('../utils/env.utils')));
        await updateEnvFile({
            RCLONE_REMOTE: remote,
            SYNC_PROVIDER: 'rclone',
        });
        await this.runSyncSequence(req.db, 'rclone');
        res.json({ success: true });
    });
    getAuthUrl = (0, async_handler_1.asyncHandler)(async (_req, res) => {
        const url = google_1.googleDriveService.getAuthUrl();
        res.json({ url });
    });
    loginGoogle = (0, async_handler_1.asyncHandler)(async (req, res) => {
        if (google_1.googleDriveService.isAuthenticated()) {
            const user = await google_1.googleDriveService.getUserProfile();
            if (user) {
                const { updateEnvFile } = await Promise.resolve().then(() => __importStar(require('../utils/env.utils')));
                await updateEnvFile({ SYNC_PROVIDER: 'google' });
                await this.runSyncSequence(req.db, 'google');
                return res.json({ url: null, authenticated: true });
            }
            else {
                logger_1.default.warn('Google tokens found but invalid. Clearing and requesting new auth.');
                await google_1.googleDriveService.logout();
            }
        }
        const url = google_1.googleDriveService.getAuthUrl();
        res.json({ url, authenticated: false });
    });
    handleCallback = (0, async_handler_1.asyncHandler)(async (req, res) => {
        const code = req.query.code;
        if (!code) {
            return res.status(400).send('No code provided');
        }
        await google_1.googleDriveService.handleCallback(code);
        const user = await google_1.googleDriveService.getUserProfile();
        const { updateEnvFile } = await Promise.resolve().then(() => __importStar(require('../utils/env.utils')));
        await updateEnvFile({ SYNC_PROVIDER: 'google' });
        logger_1.default.info('User logged in. Syncing database (please wait)...');
        try {
            await this.runSyncSequence(req.db, 'google');
        }
        catch (err) {
            logger_1.default.error({ err }, 'Post-login sync failed');
        }
        const responseHtml = `
            <html>
            <body>
            <h1>Authentication Successful</h1>
            <p>Database synced. Closing window...</p>
            <script>
            if (window.opener) {
                window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', user: ${JSON.stringify(user)} }, '*');
                window.close();
            } else {
                window.location.href = '/';
            }
            </script>
            </body>
            </html>
            `;
        res.send(responseHtml);
    });
    getUserProfile = (0, async_handler_1.asyncHandler)(async (_req, res) => {
        const user = await google_1.googleDriveService.getUserProfile();
        res.json(user);
    });
    logout = (0, async_handler_1.asyncHandler)(async (_req, res) => {
        await google_1.googleDriveService.logout();
        const { updateEnvFile } = await Promise.resolve().then(() => __importStar(require('../utils/env.utils')));
        await updateEnvFile({ SYNC_PROVIDER: '' });
        await (0, sync_1.initSyncProvider)();
        res.json({ success: true });
    });
}
exports.AuthController = AuthController;
