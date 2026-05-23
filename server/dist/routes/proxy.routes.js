"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProxyRouter = createProxyRouter;
const express_1 = require("express");
const proxy_controller_1 = require("../controllers/proxy.controller");
function createProxyRouter() {
    const router = (0, express_1.Router)();
    const controller = new proxy_controller_1.ProxyController();
    router.get('/proxy', controller.handleProxy);
    router.get('/embed-proxy', controller.handleEmbedProxy);
    router.get('/subtitle-proxy', controller.handleSubtitleProxy);
    router.get('/image-proxy', controller.handleImageProxy);
    return router;
}
