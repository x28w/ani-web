"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rcloneService = void 0;
const child_process_1 = require("child_process");
const logger_1 = __importDefault(require("./logger"));
const config_1 = require("./config");
class RcloneService {
    activeRemote = null;
    executeCommand(command) {
        return new Promise((resolve, reject) => {
            (0, child_process_1.exec)(command, (err, stdout, stderr) => {
                if (err) {
                    if (stderr)
                        logger_1.default.warn({ stderr }, 'Rclone command warning');
                    return reject(new Error(stderr || err.message));
                }
                resolve(stdout.trim());
            });
        });
    }
    executeRcloneArgs(args) {
        return new Promise((resolve, reject) => {
            const process = (0, child_process_1.spawn)('rclone', args, { stdio: 'ignore' });
            process.on('close', (code) => {
                if (code === 0)
                    resolve();
                else
                    reject(new Error(`Rclone exited with code ${code}`));
            });
            process.on('error', (err) => reject(err));
        });
    }
    async listRemotes() {
        try {
            const remotesStr = await this.executeCommand('rclone listremotes');
            return remotesStr
                .split('\n')
                .map((r) => r.trim())
                .filter((r) => r !== '')
                .map((r) => r.replace(/:$/, ''));
        }
        catch {
            return [];
        }
    }
    async init() {
        try {
            await this.executeCommand('rclone version');
            const remotes = await this.listRemotes();
            if (config_1.CONFIG.RCLONE_REMOTE) {
                const found = remotes.find((r) => r.toLowerCase() === config_1.CONFIG.RCLONE_REMOTE?.toLowerCase());
                if (found) {
                    this.activeRemote = found;
                    logger_1.default.info(`Rclone initialized with manual remote: ${this.activeRemote}`);
                    return true;
                }
                else {
                    logger_1.default.warn(`Configured RCLONE_REMOTE '${config_1.CONFIG.RCLONE_REMOTE}' not found in rclone listremotes.`);
                }
            }
            if (remotes.length > 0 && !config_1.CONFIG.RCLONE_REMOTE) {
                logger_1.default.info({ remotes }, 'Rclone available but no manual remote is configured in settings.');
                return false;
            }
            return false;
        }
        catch (error) {
            logger_1.default.warn({ err: error }, 'Rclone initialization failed');
            return false;
        }
    }
    isActive() {
        return this.activeRemote !== null;
    }
    getRemoteName() {
        return this.activeRemote || 'unknown';
    }
    async downloadFile(remoteFolder, fileName, localPath) {
        if (!this.activeRemote)
            throw new Error('Rclone not active');
        const remotePath = `${this.activeRemote}:${remoteFolder}/${fileName}`;
        await this.executeRcloneArgs(['copyto', remotePath, localPath]);
    }
    async uploadFile(localPath, remoteFolder, fileName) {
        if (!this.activeRemote)
            throw new Error('Rclone not active');
        const remotePath = `${this.activeRemote}:${remoteFolder}/${fileName}`;
        await this.executeRcloneArgs(['copyto', localPath, remotePath]);
    }
    executeRcloneArgsWithOutput(args) {
        return new Promise((resolve, reject) => {
            const process = (0, child_process_1.spawn)('rclone', args, { stdio: 'pipe' });
            let stdout = '';
            let stderr = '';
            process.stdout?.on('data', (data) => (stdout += data));
            process.stderr?.on('data', (data) => (stderr += data));
            process.on('close', (code) => {
                if (code === 0)
                    resolve(stdout.trim());
                else {
                    if (stderr)
                        logger_1.default.warn({ stderr }, 'Rclone command warning');
                    reject(new Error(stderr || `Rclone exited with code ${code}`));
                }
            });
            process.on('error', (err) => reject(err));
        });
    }
    async fileExists(remoteFolder, fileName) {
        if (!this.activeRemote)
            return false;
        try {
            const remotePath = `${this.activeRemote}:${remoteFolder}/${fileName}`;
            const output = await this.executeRcloneArgsWithOutput(['lsjson', remotePath]);
            const json = JSON.parse(output);
            return json && json.length > 0;
        }
        catch {
            return false;
        }
    }
}
exports.rcloneService = new RcloneService();
