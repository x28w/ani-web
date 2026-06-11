"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONFIG = exports.SERVER_ROOT = void 0;
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
exports.SERVER_ROOT = path_1.default.resolve(__dirname, '..');
const PACKAGE_ROOT = path_1.default.resolve(exports.SERVER_ROOT, '..');
function resolveDataRoot() {
    if (process.env.DATA_ROOT) {
        return process.env.DATA_ROOT;
    }
    if (process.platform === 'win32' && process.env.APPDATA) {
        return path_1.default.join(process.env.APPDATA, 'ani-web');
    }
    if (process.platform === 'darwin') {
        return path_1.default.join(os_1.default.homedir(), 'Library', 'Application Support', 'ani-web');
    }
    if (process.env.XDG_DATA_HOME) {
        return path_1.default.join(process.env.XDG_DATA_HOME, 'ani-web');
    }
    return path_1.default.join(os_1.default.homedir(), '.local', 'share', 'ani-web');
}
function moveFileIfNeeded(sourcePath, destinationPath) {
    if (!fs_1.default.existsSync(sourcePath) || fs_1.default.existsSync(destinationPath)) {
        return;
    }
    try {
        fs_1.default.renameSync(sourcePath, destinationPath);
    }
    catch {
        fs_1.default.copyFileSync(sourcePath, destinationPath);
        fs_1.default.unlinkSync(sourcePath);
    }
}
function migrateLegacyData(packageServerRoot, dataRoot) {
    const legacyFiles = [
        '.env',
        'google_tokens.json',
        'sync_manifest.json',
        'sync_manifest.dev.json',
        'anime.db',
        'anime.db-shm',
        'anime.db-wal',
        'anime.dev.db',
        'anime.dev.db-shm',
        'anime.dev.db-wal',
    ];
    fs_1.default.mkdirSync(dataRoot, { recursive: true });
    for (const filename of legacyFiles) {
        moveFileIfNeeded(path_1.default.join(packageServerRoot, filename), path_1.default.join(dataRoot, filename));
    }
}
const DATA_ROOT = resolveDataRoot();
const ENV_PATH = path_1.default.join(DATA_ROOT, '.env');
migrateLegacyData(exports.SERVER_ROOT, DATA_ROOT);
dotenv_1.default.config({ path: ENV_PATH });
const IS_DEV = process.argv.includes('--dev');
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
const GOOGLE_REDIRECT_URI = IS_DEV
    ? 'http://localhost:5173/api/auth/google/callback'
    : `${PUBLIC_URL}/api/auth/google/callback`;
exports.CONFIG = {
    ROOT: DATA_ROOT,
    SERVER_ROOT: exports.SERVER_ROOT,
    PACKAGE_ROOT,
    ENV_PATH,
    TOKEN_PATH: path_1.default.join(DATA_ROOT, 'google_tokens.json'),
    LOCAL_MANIFEST_PATH: path_1.default.join(DATA_ROOT, IS_DEV ? 'sync_manifest.dev.json' : 'sync_manifest.json'),
    DB_NAME_PROD: 'anime.db',
    DB_NAME_DEV: 'anime.dev.db',
    REMOTE_FOLDER_PROD: 'aniweb_db',
    REMOTE_FOLDER_DEV: 'aniweb_dev_db',
    MANIFEST_FILENAME: IS_DEV ? 'sync_manifest.dev.json' : 'sync_manifest.json',
    GOOGLE_SCOPES: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/userinfo.profile',
    ],
    IS_DEV,
    PORT,
    PUBLIC_URL,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI,
    RCLONE_REMOTE: process.env.RCLONE_REMOTE,
    SYNC_PROVIDER: process.env.SYNC_PROVIDER,
};
