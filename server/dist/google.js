"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.googleDriveService = exports.GoogleDriveService = void 0;
const fs_1 = __importDefault(require("fs"));
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
const axios_1 = __importDefault(require("axios"));
const promises_1 = require("stream/promises");
const logger_1 = __importDefault(require("./logger"));
const config_1 = require("./config");
const httpAgent = new http_1.default.Agent({ keepAlive: false });
const httpsAgent = new https_1.default.Agent({ keepAlive: false });
httpsAgent.setMaxListeners(100);
httpAgent.setMaxListeners(100);
const googleAxios = axios_1.default.create({
    httpAgent,
    httpsAgent,
    timeout: 30000,
});
class GoogleDriveService {
    tokens = {};
    folderIdCache = new Map();
    constructor() {
        if (!config_1.CONFIG.GOOGLE_CLIENT_ID) {
            logger_1.default.error('GOOGLE_CLIENT_ID is missing from .env!');
        }
        this.loadTokens();
    }
    loadTokens() {
        if (fs_1.default.existsSync(config_1.CONFIG.TOKEN_PATH)) {
            try {
                this.tokens = JSON.parse(fs_1.default.readFileSync(config_1.CONFIG.TOKEN_PATH, 'utf-8'));
            }
            catch (error) {
                logger_1.default.error({ err: error }, 'Failed to load Google tokens');
            }
        }
    }
    saveTokens(tokens) {
        const merged = { ...this.tokens, ...tokens };
        if (merged.expires_in && !merged.expiry_date) {
            merged.expiry_date = Date.now() + merged.expires_in * 1000;
        }
        this.tokens = merged;
        try {
            fs_1.default.writeFileSync(config_1.CONFIG.TOKEN_PATH, JSON.stringify(this.tokens));
        }
        catch (error) {
            logger_1.default.error({ err: error }, 'Failed to save refreshed tokens');
        }
    }
    getGoogleClientConfig() {
        if (!config_1.CONFIG.GOOGLE_CLIENT_ID || !config_1.CONFIG.GOOGLE_CLIENT_SECRET) {
            throw new Error('Google OAuth credentials are not configured');
        }
        return {
            clientId: config_1.CONFIG.GOOGLE_CLIENT_ID,
            clientSecret: config_1.CONFIG.GOOGLE_CLIENT_SECRET,
        };
    }
    async refreshAccessToken() {
        if (!this.tokens.refresh_token) {
            throw new Error('Missing refresh token');
        }
        const { clientId, clientSecret } = this.getGoogleClientConfig();
        const params = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: this.tokens.refresh_token,
            grant_type: 'refresh_token',
        });
        try {
            const { data } = await googleAxios.post('https://oauth2.googleapis.com/token', params.toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            });
            this.saveTokens(data);
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error) &&
                (error.response?.status === 400 || error.response?.status === 401)) {
                logger_1.default.warn('Failed to refresh Google access token. Token may be revoked. Logging out.');
                await this.logout();
            }
            throw error;
        }
    }
    async ensureAccessToken() {
        const expiresSoon = !this.tokens.expiry_date || Date.now() >= this.tokens.expiry_date - 60_000;
        if (!this.tokens.access_token || expiresSoon) {
            await this.refreshAccessToken();
        }
    }
    async googleRequest(config) {
        await this.ensureAccessToken();
        try {
            return await googleAxios.request({
                ...config,
                headers: {
                    Authorization: `Bearer ${this.tokens.access_token}`,
                    ...(config.headers ?? {}),
                },
            });
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error) &&
                (error.response?.status === 401 || error.response?.status === 403)) {
                logger_1.default.warn('Google API request failed with auth error. Logging out.');
                await this.logout();
            }
            throw error;
        }
    }
    isAuthenticated() {
        return !!this.tokens.refresh_token;
    }
    getAuthUrl() {
        const { clientId } = this.getGoogleClientConfig();
        const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        url.searchParams.set('client_id', clientId);
        url.searchParams.set('redirect_uri', config_1.CONFIG.GOOGLE_REDIRECT_URI);
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('access_type', 'offline');
        url.searchParams.set('prompt', 'consent');
        url.searchParams.set('scope', config_1.CONFIG.GOOGLE_SCOPES.join(' '));
        return url.toString();
    }
    async handleCallback(code) {
        const { clientId, clientSecret } = this.getGoogleClientConfig();
        const params = new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: config_1.CONFIG.GOOGLE_REDIRECT_URI,
            grant_type: 'authorization_code',
        });
        const { data } = await googleAxios.post('https://oauth2.googleapis.com/token', params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        this.saveTokens(data);
        return this.tokens;
    }
    async getUserProfile() {
        if (!this.isAuthenticated())
            return null;
        try {
            const res = await this.googleRequest({
                method: 'GET',
                url: 'https://www.googleapis.com/oauth2/v2/userinfo',
            });
            return res.data;
        }
        catch (error) {
            logger_1.default.error({ err: error }, 'Failed to fetch user profile');
            if (axios_1.default.isAxiosError(error) &&
                (error.response?.status === 401 || error.response?.status === 403)) {
                logger_1.default.warn('Google authentication token is invalid or expired. Logging out.');
                await this.logout();
            }
            return null;
        }
    }
    async logout() {
        if (fs_1.default.existsSync(config_1.CONFIG.TOKEN_PATH)) {
            fs_1.default.unlinkSync(config_1.CONFIG.TOKEN_PATH);
        }
        this.tokens = {};
        this.folderIdCache.clear();
    }
    async ensureFolder(folderName) {
        if (!this.isAuthenticated())
            throw new Error('Not authenticated');
        const cachedId = this.folderIdCache.get(folderName);
        if (cachedId)
            return cachedId;
        const existing = await this.findFile(folderName, undefined, 'application/vnd.google-apps.folder');
        if (existing) {
            this.folderIdCache.set(folderName, existing.id);
            return existing.id;
        }
        const fileMetadata = {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
        };
        try {
            const res = await this.googleRequest({
                method: 'POST',
                url: 'https://www.googleapis.com/drive/v3/files',
                params: { fields: 'id' },
                data: fileMetadata,
                headers: { 'Content-Type': 'application/json' },
            });
            const id = res.data.id;
            this.folderIdCache.set(folderName, id);
            return id;
        }
        catch (error) {
            logger_1.default.error({ err: error }, `Failed to create folder ${folderName}`);
            throw error;
        }
    }
    async findFile(filename, parentId, mimeType) {
        if (!this.isAuthenticated())
            return null;
        const safeName = filename.replace(/'/g, "\\'");
        let query = `name = '${safeName}' and trashed = false`;
        if (parentId) {
            const safeParentId = parentId.replace(/'/g, "\\'");
            query += ` and '${safeParentId}' in parents`;
        }
        if (mimeType) {
            const safeMimeType = mimeType.replace(/'/g, "\\'");
            query += ` and mimeType = '${safeMimeType}'`;
        }
        try {
            const res = await this.googleRequest({
                method: 'GET',
                url: 'https://www.googleapis.com/drive/v3/files',
                params: {
                    q: query,
                    fields: 'files(id, name)',
                    spaces: 'drive',
                    orderBy: 'createdTime desc',
                },
            });
            if (res.data.files && res.data.files.length > 0) {
                if (res.data.files.length > 1) {
                    logger_1.default.warn(`Multiple files found for ${filename}, using the most recent one.`);
                }
                return { id: res.data.files[0].id, name: res.data.files[0].name };
            }
            return null;
        }
        catch (error) {
            logger_1.default.error({ err: error }, `Error while searching for file ${filename}`);
            throw error;
        }
    }
    async downloadFile(fileId, destPath) {
        if (!this.isAuthenticated())
            throw new Error('Not authenticated');
        const dest = fs_1.default.createWriteStream(destPath);
        try {
            const res = await this.googleRequest({
                method: 'GET',
                url: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
                params: { alt: 'media' },
                responseType: 'stream',
            });
            await (0, promises_1.pipeline)(res.data, dest);
        }
        catch (error) {
            dest.destroy();
            throw error;
        }
    }
    async uploadFile(filePath, filename, mimeType = 'application/octet-stream', parentId, existingFileId) {
        if (!this.isAuthenticated())
            throw new Error('Not authenticated');
        let targetId = existingFileId;
        if (!targetId) {
            const existing = await this.findFile(filename, parentId, mimeType);
            if (existing)
                targetId = existing.id;
        }
        const media = {
            mimeType,
            body: fs_1.default.createReadStream(filePath),
        };
        try {
            if (targetId) {
                await this.googleRequest({
                    method: 'PATCH',
                    url: `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(targetId)}`,
                    params: { uploadType: 'media' },
                    data: media.body,
                    headers: { 'Content-Type': media.mimeType },
                });
            }
            else {
                const resource = { name: filename };
                if (parentId) {
                    resource.parents = [parentId];
                }
                const created = await this.googleRequest({
                    method: 'POST',
                    url: 'https://www.googleapis.com/drive/v3/files',
                    params: { fields: 'id' },
                    data: resource,
                    headers: { 'Content-Type': 'application/json' },
                });
                await this.googleRequest({
                    method: 'PATCH',
                    url: `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(created.data.id)}`,
                    params: { uploadType: 'media' },
                    data: media.body,
                    headers: { 'Content-Type': media.mimeType },
                });
            }
        }
        catch (error) {
            logger_1.default.error({ err: error }, `Failed to upload file ${filename}`);
            throw error;
        }
    }
}
exports.GoogleDriveService = GoogleDriveService;
exports.googleDriveService = new GoogleDriveService();
