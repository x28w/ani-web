"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InsightsController = void 0;
const logger_1 = __importDefault(require("../logger"));
const insights_repository_1 = require("../repositories/insights.repository");
const async_handler_1 = require("../utils/async-handler");
function parseGenres(value) {
    if (!value)
        return [];
    try {
        if (value.startsWith('[')) {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed.filter((genre) => typeof genre === 'string') : [];
        }
    }
    catch (error) {
        logger_1.default.warn({ err: error }, 'Failed to parse genres for insights');
        return [];
    }
    return value
        .split(',')
        .map((genre) => genre.trim())
        .filter(Boolean);
}
function buildFavoriteGenres(titles) {
    const weights = new Map();
    titles.forEach((title) => {
        parseGenres(title.genres).forEach((genre) => {
            weights.set(genre, (weights.get(genre) || 0) + Number(title.watchedSeconds || 0));
        });
    });
    return Array.from(weights.entries())
        .map(([name, seconds]) => ({ name, seconds }))
        .sort((a, b) => b.seconds - a.seconds)
        .slice(0, 5);
}
class InsightsController {
    provider;
    constructor(provider) {
        this.provider = provider;
    }
    async getRecommendations(watched, favoriteGenres) {
        if (watched.length === 0 || favoriteGenres.length === 0)
            return [];
        const watchedIds = new Set(watched.map((title) => title.id));
        const recommendations = new Map();
        await Promise.all(favoriteGenres.slice(0, 2).map(async (genre) => {
            try {
                const matches = await this.provider.search({ genres: genre.name, limit: '8' });
                matches.forEach((show) => {
                    if (!watchedIds.has(show._id) && !show.isAdult && !recommendations.has(show._id)) {
                        recommendations.set(show._id, show);
                    }
                });
            }
            catch (error) {
                logger_1.default.warn({ err: error, genre: genre.name }, 'Unable to load insight recommendations');
            }
        }));
        return Array.from(recommendations.values()).slice(0, 8);
    }
    getWatchInsights = (0, async_handler_1.asyncHandler)(async (req, res) => {
        const userId = req.siteUser?.username || 'local';
        const [summary, mostWatched, genreTitles, activity] = await Promise.all([
            insights_repository_1.InsightsRepository.getSummary(req.db, userId),
            insights_repository_1.InsightsRepository.getMostWatched(req.db, userId),
            insights_repository_1.InsightsRepository.getGenreTitles(req.db, userId),
            insights_repository_1.InsightsRepository.getActivity(req.db, userId),
        ]);
        const favoriteGenres = buildFavoriteGenres(genreTitles);
        const recommendations = await this.getRecommendations(mostWatched, favoriteGenres);
        res.json({
            totalSeconds: Number(summary?.totalSeconds || 0),
            totalEpisodes: Number(summary?.totalEpisodes || 0),
            titlesWatched: Number(summary?.titlesWatched || 0),
            activeDays: Number(summary?.activeDays || 0),
            mostWatched: mostWatched.map((title) => ({
                ...title,
                watchedSeconds: Number(title.watchedSeconds || 0),
                episodesWatched: Number(title.episodesWatched || 0),
            })),
            favoriteGenres,
            activity: activity.map((day) => ({ ...day, seconds: Number(day.seconds || 0) })),
            recommendations,
        });
    });
}
exports.InsightsController = InsightsController;
