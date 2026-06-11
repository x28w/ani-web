"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseWrapper = void 0;
const node_sqlite_1 = require("node:sqlite");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const logger_1 = __importDefault(require("./logger"));
class DatabaseWrapper {
    db;
    isClosed = false;
    statementCache = new Map();
    constructor(_dbPath, db) {
        this.db = db;
    }
    static async create(dbPath) {
        try {
            const dir = path_1.default.dirname(dbPath);
            if (!fs_1.default.existsSync(dir)) {
                fs_1.default.mkdirSync(dir, { recursive: true });
            }
            const db = new node_sqlite_1.DatabaseSync(dbPath);
            return new DatabaseWrapper(dbPath, db);
        }
        catch (e) {
            logger_1.default.error({ err: e }, `Failed to initialize database at ${dbPath}`);
            throw e;
        }
    }
    scheduleSave() { }
    async saveNow() { }
    configure(option, value) {
        if (option === 'busyTimeout') {
            this.db.exec(`PRAGMA busy_timeout = ${value}`);
        }
    }
    serialize(cb) {
        this.db.exec('BEGIN IMMEDIATE');
        try {
            cb();
            this.db.exec('COMMIT');
        }
        catch (e) {
            this.db.exec('ROLLBACK');
            throw e;
        }
    }
    close(cb) {
        if (this.isClosed) {
            if (cb)
                cb(null);
            return;
        }
        try {
            this.isClosed = true;
            this.statementCache.clear();
            this.db.close();
            if (cb)
                cb(null);
        }
        catch (e) {
            logger_1.default.error({ err: e }, 'Error during database close');
            if (cb)
                cb(e);
        }
    }
    isClosedCheck() {
        return this.isClosed;
    }
    getPreparedStatement(query) {
        let stmt = this.statementCache.get(query);
        if (!stmt) {
            if (this.statementCache.size > 100) {
                this.statementCache.clear();
            }
            stmt = this.db.prepare(query);
            this.statementCache.set(query, stmt);
        }
        return stmt;
    }
    executeAndFinalize(query, params, operation) {
        const stmt = this.getPreparedStatement(query);
        let result;
        if (operation === 'run') {
            if (params && params.length > 0) {
                stmt.run(...params);
            }
            else {
                stmt.run();
            }
            result = null;
        }
        else if (operation === 'get') {
            if (params && params.length > 0) {
                result = stmt.get(...params);
            }
            else {
                result = stmt.get();
            }
        }
        else {
            if (params && params.length > 0) {
                result = stmt.all(...params);
            }
            else {
                result = stmt.all();
            }
        }
        return result;
    }
    run(query, params, cb, _options) {
        if (this.isClosed) {
            if (cb)
                cb(new Error('Database is closed'));
            return;
        }
        if (typeof params === 'function') {
            cb = params;
            params = [];
        }
        try {
            const bindableParams = params && Array.isArray(params) && params.length > 0
                ? params
                : undefined;
            this.executeAndFinalize(query, bindableParams, 'run');
            if (cb)
                cb(null);
        }
        catch (e) {
            logger_1.default.error({ err: e, query, params }, 'SQL Execution Error (run)');
            if (cb)
                cb(e);
        }
    }
    get(query, params, cb) {
        if (this.isClosed) {
            if (cb)
                cb(new Error('Database is closed'), null);
            return;
        }
        if (typeof params === 'function') {
            cb = params;
            params = [];
        }
        try {
            const bindableParams = params && Array.isArray(params) && params.length > 0
                ? params
                : undefined;
            const res = this.executeAndFinalize(query, bindableParams, 'get');
            if (cb)
                cb(null, res);
        }
        catch (e) {
            logger_1.default.error({ err: e, query, params }, 'SQL Execution Error (get)');
            if (cb)
                cb(e, null);
        }
    }
    all(query, params, cb) {
        if (this.isClosed) {
            if (cb)
                cb(new Error('Database is closed'), []);
            return;
        }
        if (typeof params === 'function') {
            cb = params;
            params = [];
        }
        try {
            const bindableParams = params && Array.isArray(params) && params.length > 0
                ? params
                : undefined;
            const res = this.executeAndFinalize(query, bindableParams, 'all');
            if (cb)
                cb(null, res);
        }
        catch (e) {
            logger_1.default.error({ err: e, query, params }, 'SQL Execution Error (all)');
            if (cb)
                cb(e, []);
        }
    }
    prepare(query) {
        const stmt = this.getPreparedStatement(query);
        return {
            run: (...args) => {
                stmt.run(...args);
            },
            all: () => {
                return stmt.all();
            },
            get: () => {
                return stmt.get();
            },
            finalize: () => { },
            runAsync: (cb) => {
                try {
                    stmt.run();
                    cb(null);
                }
                catch (e) {
                    cb(e);
                }
            },
        };
    }
    backup(backupPath) {
        try {
            if (fs_1.default.existsSync(backupPath)) {
                fs_1.default.rmSync(backupPath, { force: true });
            }
            this.db.exec(`VACUUM INTO '${backupPath}'`);
        }
        catch (e) {
            logger_1.default.error({ err: e, backupPath }, 'Database backup failed via VACUUM INTO');
            throw e;
        }
    }
    checkpoint() {
        try {
            this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
        }
        catch (e) {
            logger_1.default.error({ err: e }, 'Database WAL checkpoint failed');
            throw e;
        }
    }
}
exports.DatabaseWrapper = DatabaseWrapper;
