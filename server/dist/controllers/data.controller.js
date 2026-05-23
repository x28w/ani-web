"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataController = void 0;
const constants_json_1 = require("../constants.json");
const logger_1 = __importDefault(require("../logger"));
const async_handler_1 = require("../utils/async-handler");
class DataController {
    providers;
    constructor(providers) {
        this.providers = providers;
    }
    getProvider(req) {
        const providerName = req.query.provider || 'allanime';
        return this.providers[providerName.toLowerCase()] || this.providers['allanime'];
    }
    getPopular = (0, async_handler_1.asyncHandler)(async (req, res) => {
        const timeframe = req.params.timeframe.toLowerCase();
        const data = await this.getProvider(req).getPopular(timeframe);
        res.set('Cache-Control', 'public, max-age=300').json(data);
    });
    getSchedule = (0, async_handler_1.asyncHandler)(async (req, res) => {
        const data = await this.getProvider(req).getSchedule(new Date(req.params.date + 'T00:00:00.000Z'));
        res.set('Cache-Control', 'public, max-age=300').json(data);
    });
    getSkipTimes = (0, async_handler_1.asyncHandler)(async (req, res) => {
        try {
            const data = await this.getProvider(req).getSkipTimes(req.params.showId, req.params.episodeNumber);
            res.json(data);
        }
        catch {
            res.json({ found: false, results: [] });
        }
    });
    getVideo = (0, async_handler_1.asyncHandler)(async (req, res) => {
        try {
            const urls = await this.getProvider(req).getStreamUrls(req.query.showId, req.query.episodeNumber, req.query.mode);
            res.json(urls || []);
        }
        catch (e) {
            // Return empty array instead of 500 so frontend can stay functional
            // and allow provider switching.
            logger_1.default.error({ err: e, provider: req.query.provider }, 'Provider video fetch failed');
            res.json([]);
        }
    });
    getEpisodes = (0, async_handler_1.asyncHandler)(async (req, res) => {
        res.json(await this.getProvider(req).getEpisodes(req.query.showId, req.query.mode));
    });
    search = (0, async_handler_1.asyncHandler)(async (req, res) => {
        res.json(await this.getProvider(req).search(req.query));
    });
    getSeasonal = (0, async_handler_1.asyncHandler)(async (req, res) => {
        const page = parseInt(req.query.page) || 1;
        res.json(await this.getProvider(req).getSeasonal(page));
    });
    getLatestReleases = (0, async_handler_1.asyncHandler)(async (req, res) => {
        res.json(await this.getProvider(req).getLatestReleases());
    });
    getShowMeta = (0, async_handler_1.asyncHandler)(async (req, res) => {
        const [meta, details] = await Promise.all([
            this.getProvider(req).getShowMeta(req.params.id),
            this.getProvider(req)
                .getShowDetails(req.params.id)
                .catch(() => ({})),
        ]);
        const merged = { ...meta, ...details };
        res.json(merged);
    });
    getShowDetails = (0, async_handler_1.asyncHandler)(async (req, res) => {
        try {
            const details = await this.getProvider(req).getShowDetails(req.params.id);
            res.json(details || {});
        }
        catch (e) {
            const error = e;
            logger_1.default.warn({ err: error.message }, 'Optional show details fetch failed');
            res.json({});
        }
    });
    getAllmangaDetails = (0, async_handler_1.asyncHandler)(async (req, res) => {
        res.json(await this.getProvider(req).getAllmangaDetails(req.params.id));
    });
    getGenresAndTags = (_req, res) => {
        res.json({ genres: constants_json_1.genres, tags: constants_json_1.tags, studios: constants_json_1.studios });
    };
}
exports.DataController = DataController;
