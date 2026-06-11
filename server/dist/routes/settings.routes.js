"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSettingsRouter = createSettingsRouter;
const express_1 = require("express");
const settings_controller_1 = require("../controllers/settings.controller");
const multer_1 = __importDefault(require("multer"));
const config_1 = require("../config");
const site_auth_1 = require("../site-auth");
function createSettingsRouter(provider, getDb, initializeDatabase, setDb) {
    const router = (0, express_1.Router)();
    const controller = new settings_controller_1.SettingsController(provider);
    router.get('/settings', controller.getSettings);
    router.post('/settings', controller.updateSettings);
    router.get('/backup-db', site_auth_1.requireSiteAdmin, controller.backupDatabase);
    const restoreStorage = (0, multer_1.default)({
        storage: multer_1.default.diskStorage({
            destination: (_req, _f, cb) => cb(null, config_1.CONFIG.ROOT),
            filename: (_r, _f, cb) => cb(null, `restore_temp.db`),
        }),
    });
    router.post('/restore-db', site_auth_1.requireSiteAdmin, restoreStorage.single('dbfile'), (req, res) => controller.restoreDatabase(req, res, getDb(), initializeDatabase, setDb));
    router.post('/import/mal-xml', (0, multer_1.default)().single('xmlfile'), controller.importMalXml);
    return router;
}
