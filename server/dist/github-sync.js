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
exports.githubSyncService = void 0;
const logger_1 = __importDefault(require("./logger"));
const db_utils_1 = require("./utils/db-utils");
const env_utils_1 = require("./utils/env.utils");
const config_1 = require("./config");
const log = logger_1.default.child({ module: 'GitHubSync' });
const REPO_NAME = 'aniweb-sync-data';
const DEFAULT_CLIENT_ID = 'Ov23liT1ZtPk7XtN9PZk';
const GITHUB_SCOPES = ['repo'];
const GITHUB_API_HEADERS = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2026-03-10',
};
const SYNC_TABLES = [
    'watchlist',
    'watched_episodes',
    'settings',
    'shows_meta',
    'sync_metadata',
    'dismissed_notifications',
    'discovered_notifications',
];
const nativeImport = new Function('specifier', 'return import(specifier)');
function getGitHubClientId() {
    return process.env.GITHUB_CLIENT_ID || DEFAULT_CLIENT_ID;
}
function getSyncFilename() {
    return config_1.CONFIG.IS_DEV ? 'sync.dev.json' : 'sync.json';
}
async function loadOctokit(token) {
    const { Octokit } = await nativeImport('@octokit/rest');
    return new Octokit({
        auth: token,
        request: {
            headers: GITHUB_API_HEADERS,
        },
    });
}
function getErrorStatus(error) {
    if (typeof error === 'object' && error && 'status' in error) {
        return Number(error.status);
    }
    return undefined;
}
function quoteIdentifier(identifier) {
    return `"${identifier.replace(/"/g, '""')}"`;
}
function getRowsFromAll(db, sql) {
    return (0, db_utils_1.dbAll)(db, sql);
}
function readVersion(payload) {
    const versionRow = payload.tables.sync_metadata.find((row) => row.key === 'db_version');
    const value = versionRow?.value;
    return typeof value === 'number' ? value : Number(value || payload.version || 0);
}
function normalizePayload(input) {
    if (!input || typeof input !== 'object' || !('tables' in input)) {
        throw new Error('Invalid GitHub sync payload.');
    }
    const payload = input;
    for (const table of SYNC_TABLES) {
        if (!Array.isArray(payload.tables?.[table])) {
            throw new Error(`Invalid GitHub sync payload: missing ${table}.`);
        }
    }
    return payload;
}
class GitHubSyncService {
    deviceState = { status: 'idle' };
    devicePromise = null;
    isAuthenticated() {
        return !!process.env.GITHUB_TOKEN;
    }
    getDeviceState() {
        return this.deviceState;
    }
    async startDeviceAuth(db, runSyncSequence) {
        if (this.isAuthenticated()) {
            const user = await this.getUserProfile();
            if (user) {
                this.deviceState = {
                    status: 'success',
                    user: user,
                };
                const { updateEnvFile } = await Promise.resolve().then(() => __importStar(require('./utils/env.utils')));
                await updateEnvFile({ SYNC_PROVIDER: 'github' });
                await runSyncSequence(db, 'github');
                return this.deviceState;
            }
            else {
                // Token exists but is invalid/expired, clear it
                log.warn('Saved GitHub token is invalid or expired. Clearing for new auth.');
                await this.logout();
            }
        }
        if (this.deviceState.status === 'pending') {
            return this.deviceState;
        }
        this.deviceState = { status: 'pending' };
        let resolveVerification;
        const verificationReady = new Promise((resolve) => {
            resolveVerification = resolve;
        });
        this.devicePromise = this.runDeviceAuth(db, runSyncSequence, resolveVerification);
        await verificationReady;
        return this.deviceState;
    }
    async getUserProfile() {
        if (!process.env.GITHUB_TOKEN)
            return null;
        try {
            const octokit = await loadOctokit(process.env.GITHUB_TOKEN);
            const { data } = await octokit.rest.users.getAuthenticated({
                headers: GITHUB_API_HEADERS,
            });
            return {
                login: data.login,
                name: data.name,
                avatarUrl: data.avatar_url,
            };
        }
        catch (err) {
            if (getErrorStatus(err) === 401) {
                log.warn('GitHub token is invalid or expired. Logging out.');
                await this.logout();
            }
            return null;
        }
    }
    async logout() {
        await (0, env_utils_1.updateEnvFile)({ GITHUB_TOKEN: '' });
        delete process.env.GITHUB_TOKEN;
        this.deviceState = { status: 'idle' };
    }
    async getRemoteVersion() {
        const payload = await this.fetchSyncPayload();
        return payload ? readVersion(payload) : 0;
    }
    async syncUp(db) {
        const payload = await this.exportDatabase(db);
        const octokit = await this.getOctokit();
        const owner = await this.ensureRepo(octokit);
        const existing = await this.getSyncFile(octokit, owner);
        const content = Buffer.from(JSON.stringify(payload, null, 2), 'utf8').toString('base64');
        await octokit.rest.repos.createOrUpdateFileContents({
            owner,
            repo: REPO_NAME,
            path: getSyncFilename(),
            message: `Sync ani-web data v${payload.version}`,
            content,
            sha: existing?.sha,
            headers: GITHUB_API_HEADERS,
        });
    }
    async syncDown(db) {
        const payload = await this.fetchSyncPayload();
        if (!payload) {
            return 0;
        }
        this.importDatabase(db, payload);
        return readVersion(payload);
    }
    async runDeviceAuth(db, runSyncSequence, resolveVerification) {
        try {
            const { createOAuthDeviceAuth } = await nativeImport('@octokit/auth-oauth-device');
            const auth = createOAuthDeviceAuth({
                clientId: getGitHubClientId(),
                scopes: GITHUB_SCOPES,
                onVerification: (verification) => {
                    this.deviceState = {
                        status: 'pending',
                        verification: {
                            user_code: verification.user_code,
                            verification_uri: verification.verification_uri,
                            expires_in: verification.expires_in,
                            interval: verification.interval,
                        },
                    };
                    resolveVerification();
                },
            });
            const authentication = await auth({ type: 'oauth' });
            await (0, env_utils_1.updateEnvFile)({ GITHUB_TOKEN: authentication.token, SYNC_PROVIDER: 'github' });
            process.env.GITHUB_TOKEN = authentication.token;
            const user = await this.getUserProfile();
            this.deviceState = {
                status: 'success',
                user: user || undefined,
            };
            try {
                await runSyncSequence(db, 'github');
            }
            catch (err) {
                log.error({ err }, 'Post-GitHub-login sync failed');
            }
        }
        catch (err) {
            this.deviceState = {
                status: 'error',
                error: err instanceof Error ? err.message : 'GitHub device authentication failed.',
            };
            resolveVerification();
            log.error({ err }, 'GitHub device authentication failed');
        }
        finally {
            this.devicePromise = null;
        }
    }
    async getOctokit() {
        if (!process.env.GITHUB_TOKEN) {
            throw new Error('GitHub token is not configured.');
        }
        return loadOctokit(process.env.GITHUB_TOKEN);
    }
    async ensureRepo(octokit) {
        const { data: user } = await octokit.rest.users.getAuthenticated({
            headers: GITHUB_API_HEADERS,
        });
        try {
            await octokit.rest.repos.get({
                owner: user.login,
                repo: REPO_NAME,
                headers: GITHUB_API_HEADERS,
            });
        }
        catch (err) {
            if (getErrorStatus(err) !== 404) {
                throw err;
            }
            await octokit.rest.repos.createForAuthenticatedUser({
                name: REPO_NAME,
                private: true,
                auto_init: true,
                description: 'Private ani-web synchronization data.',
                headers: GITHUB_API_HEADERS,
            });
        }
        return user.login;
    }
    async getSyncFile(octokit, owner) {
        try {
            const response = await octokit.rest.repos.getContent({
                owner,
                repo: REPO_NAME,
                path: getSyncFilename(),
                headers: GITHUB_API_HEADERS,
            });
            const data = response.data;
            if (data.type !== 'file' || !data.content || !data.sha) {
                return null;
            }
            return {
                content: Buffer.from(data.content, 'base64').toString('utf8'),
                sha: data.sha,
            };
        }
        catch (err) {
            if (getErrorStatus(err) === 404) {
                return null;
            }
            throw err;
        }
    }
    async fetchSyncPayload() {
        const octokit = await this.getOctokit();
        const owner = await this.ensureRepo(octokit);
        const file = await this.getSyncFile(octokit, owner);
        if (!file) {
            return null;
        }
        return normalizePayload(JSON.parse(file.content));
    }
    async exportDatabase(db) {
        const tables = {};
        for (const table of SYNC_TABLES) {
            tables[table] = await getRowsFromAll(db, `SELECT * FROM ${quoteIdentifier(table)}`);
        }
        return {
            version: readVersion({ version: 0, exportedAt: '', tables }),
            exportedAt: new Date().toISOString(),
            tables,
        };
    }
    importDatabase(db, payload) {
        db.serialize(() => {
            for (const table of SYNC_TABLES) {
                db.run(`DELETE FROM ${quoteIdentifier(table)}`);
            }
            for (const table of SYNC_TABLES) {
                for (const row of payload.tables[table]) {
                    const columns = Object.keys(row);
                    if (columns.length === 0)
                        continue;
                    const columnSql = columns.map(quoteIdentifier).join(', ');
                    const placeholders = columns.map(() => '?').join(', ');
                    const values = columns.map((column) => row[column]);
                    db.run(`INSERT INTO ${quoteIdentifier(table)} (${columnSql}) VALUES (${placeholders})`, values);
                }
            }
        });
    }
}
exports.githubSyncService = new GitHubSyncService();
