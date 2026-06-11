"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAuthRouter = createAuthRouter;
const express_1 = require("express");
const auth_controller_1 = require("../controllers/auth.controller");
function createAuthRouter(runSyncSequence) {
    const router = (0, express_1.Router)();
    const controller = new auth_controller_1.AuthController(runSyncSequence);
    router.get('/config-status', controller.getConfigStatus);
    router.get('/google-auth', controller.getGoogleAuthSettings);
    router.post('/google-auth', controller.updateGoogleAuthSettings);
    router.get('/github/status', controller.getGitHubAuthStatus);
    router.post('/github/start', controller.startGitHubDeviceAuth);
    router.get('/github/poll', controller.pollGitHubDeviceAuth);
    router.post('/github/logout', controller.logoutGitHub);
    router.get('/settings/rclone', controller.getRcloneSettings);
    router.post('/settings/rclone', controller.updateRcloneSettings);
    router.get('/settings/sync', controller.getSyncSettings);
    router.post('/settings/sync', controller.updateSyncProvider);
    router.get('/google', controller.getAuthUrl);
    router.post('/google/login', controller.loginGoogle);
    router.get('/google/callback', controller.handleCallback);
    router.get('/user', controller.getUserProfile);
    router.post('/logout', controller.logout);
    return router;
}
