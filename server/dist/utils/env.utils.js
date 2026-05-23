"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateEnvFile = updateEnvFile;
const fs_1 = __importDefault(require("fs"));
const config_1 = require("../config");
const lockPath = `${config_1.CONFIG.ENV_PATH}.lock`;
async function acquireLock() {
    let handle;
    let attempts = 0;
    while (!handle) {
        try {
            handle = await fs_1.default.promises.open(lockPath, 'wx');
        }
        catch {
            if (++attempts >= 100) {
                fs_1.default.promises.unlink(lockPath).catch(() => { });
                throw new Error('Failed to acquire lock on .env file - another process may be holding it');
            }
            await new Promise((r) => setTimeout(r, 100));
        }
    }
    return handle;
}
function releaseLock(handle) {
    handle.close().catch(() => { });
    fs_1.default.promises.unlink(lockPath).catch(() => { });
}
async function updateEnvFile(updates) {
    const lockHandle = await acquireLock();
    try {
        const envPath = config_1.CONFIG.ENV_PATH;
        let envContent = '';
        if (fs_1.default.existsSync(envPath)) {
            envContent = fs_1.default.readFileSync(envPath, 'utf8');
        }
        const lines = envContent.split('\n');
        const newLines = [...lines];
        Object.entries(updates).forEach(([key, value]) => {
            let found = false;
            for (let i = 0; i < newLines.length; i++) {
                const line = newLines[i];
                if (line && line.startsWith(`${key}=`)) {
                    if (value === '') {
                        newLines.splice(i, 1);
                        continue;
                    }
                    else {
                        newLines[i] = `${key}=${value}`;
                    }
                    found = true;
                    break;
                }
            }
            if (!found && value !== '') {
                newLines.push(`${key}=${value}`);
            }
        });
        const finalContent = newLines
            .join('\n')
            .replace(/\n{2,}/g, '\n')
            .trim() + '\n';
        fs_1.default.writeFileSync(envPath, finalContent);
        // Update process.env so the changes are reflected immediately in the running process
        Object.entries(updates).forEach(([key, value]) => {
            if (value === '') {
                delete process.env[key];
            }
            else {
                process.env[key] = value;
            }
        });
    }
    finally {
        releaseLock(lockHandle);
    }
}
