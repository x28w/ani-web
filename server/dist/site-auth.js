"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireSiteAdmin = exports.requireSiteAuth = void 0;
exports.isSiteAuthEnabled = isSiteAuthEnabled;
exports.createSiteAuthRouter = createSiteAuthRouter;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const config_1 = require("./config");
const logger_1 = __importDefault(require("./logger"));
const COOKIE_NAME = 'ani_web_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const MAX_PROFILE_PICTURE_BYTES = 1024 * 1024;
const PROFILE_DIR = path_1.default.join(config_1.CONFIG.ROOT, 'profile-pictures');
const PROFILE_META_PATH = path_1.default.join(PROFILE_DIR, 'profile-pictures.json');
const allowedImageTypes = {
    'image/gif': 'gif',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
};
function normalizeRole(role, index) {
    return role === 'admin' || index === 0 ? 'admin' : 'user';
}
function getConfiguredUsers() {
    if (process.env.SITE_USERS) {
        try {
            const parsed = JSON.parse(process.env.SITE_USERS);
            if (!Array.isArray(parsed))
                return [];
            return parsed
                .map((entry, index) => ({
                username: String(entry.username || '').trim(),
                password: String(entry.password || ''),
                displayName: String(entry.displayName || entry.username || '').trim(),
                role: normalizeRole(entry.role, index),
            }))
                .filter((entry) => entry.username && entry.password);
        }
        catch (error) {
            logger_1.default.error({ err: error }, 'Invalid SITE_USERS JSON');
            return [];
        }
    }
    const username = process.env.SITE_LOGIN_USER?.trim();
    const password = process.env.SITE_LOGIN_PASSWORD || '';
    if (!username || !password)
        return [];
    return [
        {
            username,
            password,
            displayName: process.env.SITE_LOGIN_DISPLAY_NAME?.trim() || username,
            role: 'admin',
        },
    ];
}
function isSiteAuthEnabled() {
    return getConfiguredUsers().length > 0;
}
function getSessionSecret() {
    return process.env.SESSION_SECRET || process.env.SITE_LOGIN_PASSWORD || 'ani-web-local-session';
}
function encodeJson(value) {
    return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}
function signPayload(encodedPayload) {
    return crypto_1.default.createHmac('sha256', getSessionSecret()).update(encodedPayload).digest('base64url');
}
function createSessionToken(username) {
    const payload = {
        username,
        exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
    };
    const encodedPayload = encodeJson(payload);
    return `${encodedPayload}.${signPayload(encodedPayload)}`;
}
function createGuestSessionToken() {
    const payload = {
        username: `guest:${crypto_1.default.randomBytes(12).toString('base64url')}`,
        exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
        guest: true,
    };
    const encodedPayload = encodeJson(payload);
    return `${encodedPayload}.${signPayload(encodedPayload)}`;
}
function safeCompare(left, right) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && crypto_1.default.timingSafeEqual(leftBuffer, rightBuffer);
}
function parseCookies(cookieHeader) {
    if (!cookieHeader)
        return {};
    return cookieHeader.split(';').reduce((cookies, item) => {
        const separatorIndex = item.indexOf('=');
        if (separatorIndex === -1)
            return cookies;
        const key = item.slice(0, separatorIndex).trim();
        const value = item.slice(separatorIndex + 1).trim();
        cookies[key] = decodeURIComponent(value);
        return cookies;
    }, {});
}
function getProfileMeta() {
    try {
        if (!fs_1.default.existsSync(PROFILE_META_PATH))
            return {};
        return JSON.parse(fs_1.default.readFileSync(PROFILE_META_PATH, 'utf8'));
    }
    catch (error) {
        logger_1.default.warn({ err: error }, 'Failed to read profile picture metadata');
        return {};
    }
}
function writeProfileMeta(meta) {
    fs_1.default.mkdirSync(PROFILE_DIR, { recursive: true });
    fs_1.default.writeFileSync(PROFILE_META_PATH, JSON.stringify(meta, null, 2));
}
function getSafeProfileStem(username) {
    return Buffer.from(username, 'utf8').toString('base64url');
}
function getProfilePictureUrl(username) {
    const meta = getProfileMeta()[username];
    if (!meta)
        return undefined;
    const profilePath = path_1.default.join(PROFILE_DIR, meta.filename);
    if (!fs_1.default.existsSync(profilePath))
        return undefined;
    return `/api/site-auth/profile-picture/${encodeURIComponent(username)}?v=${meta.updatedAt}`;
}
function toPublicUser(user) {
    return {
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        profilePictureUrl: getProfilePictureUrl(user.username),
    };
}
function getLocalUser() {
    return {
        username: 'local',
        displayName: 'Local User',
        role: 'admin',
        profilePictureUrl: getProfilePictureUrl('local'),
    };
}
function toGuestUser(username) {
    return {
        username,
        displayName: 'Guest',
        role: 'guest',
    };
}
function getUserFromSession(req) {
    const users = getConfiguredUsers();
    const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
    if (!token)
        return null;
    const [encodedPayload, signature] = token.split('.');
    if (!encodedPayload || !signature || !safeCompare(signature, signPayload(encodedPayload))) {
        return null;
    }
    try {
        const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
        if (typeof payload.username !== 'string' || typeof payload.exp !== 'number')
            return null;
        if (payload.exp < Date.now())
            return null;
        if (payload.guest === true && payload.username.startsWith('guest:')) {
            return toGuestUser(payload.username);
        }
        const user = users.find((entry) => entry.username === payload.username);
        return user ? toPublicUser(user) : null;
    }
    catch {
        return null;
    }
}
function setSessionCookie(res, username) {
    const secure = !config_1.CONFIG.IS_DEV && process.env.RENDER === 'true';
    const token = createSessionToken(username);
    const cookieParts = [
        `${COOKIE_NAME}=${encodeURIComponent(token)}`,
        'HttpOnly',
        'Path=/',
        'SameSite=Lax',
        `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    ];
    if (secure)
        cookieParts.push('Secure');
    res.setHeader('Set-Cookie', cookieParts.join('; '));
}
function setGuestSessionCookie(res) {
    const secure = !config_1.CONFIG.IS_DEV && process.env.RENDER === 'true';
    const token = createGuestSessionToken();
    const cookieParts = [
        `${COOKIE_NAME}=${encodeURIComponent(token)}`,
        'HttpOnly',
        'Path=/',
        'SameSite=Lax',
        `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    ];
    if (secure)
        cookieParts.push('Secure');
    res.setHeader('Set-Cookie', cookieParts.join('; '));
    const [encodedPayload] = token.split('.');
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    return toGuestUser(payload.username);
}
function clearSessionCookie(res) {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}
function attachSiteUser(req) {
    if (!isSiteAuthEnabled()) {
        req.siteUser = getLocalUser();
        return req.siteUser;
    }
    const user = getUserFromSession(req);
    if (user)
        req.siteUser = user;
    return user;
}
const requireSiteAuth = (req, res, next) => {
    const user = attachSiteUser(req);
    if (!user) {
        return res.status(401).json({ error: 'Login required' });
    }
    next();
};
exports.requireSiteAuth = requireSiteAuth;
const requireSiteAdmin = (req, res, next) => {
    const user = attachSiteUser(req);
    if (!user) {
        return res.status(401).json({ error: 'Login required' });
    }
    if (user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};
exports.requireSiteAdmin = requireSiteAdmin;
function removeOldProfilePictures(username) {
    const stem = getSafeProfileStem(username);
    if (!fs_1.default.existsSync(PROFILE_DIR))
        return;
    for (const file of fs_1.default.readdirSync(PROFILE_DIR)) {
        if (file.startsWith(`${stem}.`)) {
            fs_1.default.rmSync(path_1.default.join(PROFILE_DIR, file), { force: true });
        }
    }
}
const profileUpload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: MAX_PROFILE_PICTURE_BYTES },
    fileFilter: (_req, file, cb) => {
        if (allowedImageTypes[file.mimetype]) {
            cb(null, true);
            return;
        }
        cb(new Error('Only PNG, JPEG, WebP, and GIF images are supported.'));
    },
});
function handleUploadError(error, res) {
    if (!error)
        return false;
    if (error instanceof multer_1.default.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: 'Profile picture must be 1 MB or smaller.' });
        return true;
    }
    const message = error instanceof Error ? error.message : 'Profile picture upload failed.';
    res.status(400).json({ error: message });
    return true;
}
async function saveProfilePicture(req, res) {
    if (!req.siteUser)
        return res.status(401).json({ error: 'Login required' });
    if (req.siteUser.role === 'guest') {
        return res.status(403).json({ error: 'Guest profiles cannot upload pictures.' });
    }
    if (!req.file)
        return res.status(400).json({ error: 'No profile picture uploaded.' });
    const ext = allowedImageTypes[req.file.mimetype];
    if (!ext)
        return res.status(400).json({ error: 'Unsupported profile picture type.' });
    try {
        fs_1.default.mkdirSync(PROFILE_DIR, { recursive: true });
        removeOldProfilePictures(req.siteUser.username);
        const filename = `${getSafeProfileStem(req.siteUser.username)}.${ext}`;
        fs_1.default.writeFileSync(path_1.default.join(PROFILE_DIR, filename), req.file.buffer);
        const meta = getProfileMeta();
        meta[req.siteUser.username] = { filename, updatedAt: Date.now() };
        writeProfileMeta(meta);
        const users = getConfiguredUsers();
        const configuredUser = users.find((entry) => entry.username === req.siteUser?.username);
        res.json({ user: configuredUser ? toPublicUser(configuredUser) : getLocalUser() });
    }
    catch (error) {
        logger_1.default.error({ err: error }, 'Failed to save profile picture');
        res.status(500).json({ error: 'Failed to save profile picture.' });
    }
}
function serveProfilePicture(req, res) {
    const username = String(req.params.username || '');
    const meta = getProfileMeta()[username];
    if (!meta)
        return res.status(404).send('Not found');
    const profilePath = path_1.default.resolve(PROFILE_DIR, meta.filename);
    if (!profilePath.startsWith(path_1.default.resolve(PROFILE_DIR)) || !fs_1.default.existsSync(profilePath)) {
        return res.status(404).send('Not found');
    }
    res.sendFile(profilePath);
}
function createSiteAuthRouter() {
    const router = (0, express_1.Router)();
    router.get('/status', (req, res) => {
        const user = attachSiteUser(req);
        res.json({
            enabled: isSiteAuthEnabled(),
            authenticated: !!user,
            user,
            maxProfilePictureBytes: MAX_PROFILE_PICTURE_BYTES,
        });
    });
    router.post('/login', (req, res) => {
        if (!isSiteAuthEnabled()) {
            return res.json({ user: getLocalUser() });
        }
        const username = String(req.body?.username || '').trim();
        const password = String(req.body?.password || '');
        const user = getConfiguredUsers().find((entry) => entry.username === username);
        if (!user || !safeCompare(user.password, password)) {
            return res.status(401).json({ error: 'Invalid username or password.' });
        }
        setSessionCookie(res, user.username);
        res.json({ user: toPublicUser(user) });
    });
    router.post('/guest', (_req, res) => {
        const user = setGuestSessionCookie(res);
        res.json({ user });
    });
    router.post('/logout', (_req, res) => {
        clearSessionCookie(res);
        res.json({ success: true });
    });
    router.get('/profile-picture/:username', exports.requireSiteAuth, serveProfilePicture);
    router.post('/profile-picture', exports.requireSiteAuth, (req, res, next) => {
        profileUpload.single('avatar')(req, res, (error) => {
            if (handleUploadError(error, res))
                return;
            saveProfilePicture(req, res).catch(next);
        });
    });
    return router;
}
