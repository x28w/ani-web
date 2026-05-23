"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInsightsRouter = createInsightsRouter;
const express_1 = require("express");
const insights_controller_1 = require("../controllers/insights.controller");
function createInsightsRouter(provider) {
    const router = (0, express_1.Router)();
    const controller = new insights_controller_1.InsightsController(provider);
    router.get('/insights', controller.getWatchInsights);
    return router;
}
