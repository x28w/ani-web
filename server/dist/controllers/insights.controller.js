"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InsightsController = void 0;
const logger_1 = __importDefault(require("../logger"));
const insights_repository_1 = require("../repositories/insights.repository");
const async_handler_1 = require("../utils/async-handler");
class InsightsController {
    provider;
    constructor(provider) {
        this.provider = provider;
    }
    getWatchInsights = (0, async_handler_1.asyncHandler)(async (req, res) => {
        const db = req.db;
        const [core, activityGrid, hourlyDist, seasonality, allWatches, watchedShows, droppedWarning, velocities,] = (await Promise.all([
            insights_repository_1.InsightsRepository.getCoreStats(db),
            insights_repository_1.InsightsRepository.getActivityGrid(db),
            insights_repository_1.InsightsRepository.getHourlyDist(db),
            insights_repository_1.InsightsRepository.getSeasonality(db),
            insights_repository_1.InsightsRepository.getAllWatches(db),
            insights_repository_1.InsightsRepository.getWatchedShowsMeta(db),
            insights_repository_1.InsightsRepository.getDroppedShows(db),
            insights_repository_1.InsightsRepository.getCompletionVelocities(db),
        ]));
        const bingeFactor = activityGrid.length > 0 ? Math.max(...activityGrid.map((a) => a.count)) : 0;
        const sessions = [];
        if (allWatches.length > 0) {
            let currentSessionSeconds = allWatches[0].currentTime;
            for (let i = 1; i < allWatches.length; i++) {
                const prev = new Date(allWatches[i - 1].watchedAt).getTime();
                const curr = new Date(allWatches[i].watchedAt).getTime();
                if (curr - prev < 3600000) {
                    currentSessionSeconds += allWatches[i].currentTime;
                }
                else {
                    sessions.push(currentSessionSeconds);
                    currentSessionSeconds = allWatches[i].currentTime;
                }
            }
            sessions.push(currentSessionSeconds);
        }
        const avgSessionMinutes = sessions.length > 0
            ? Math.round(sessions.reduce((a, b) => a + b, 0) / sessions.length / 60)
            : 0;
        const genreCounts = {};
        let totalPopScore = 0;
        let popCount = 0;
        for (const show of watchedShows) {
            let genres = [];
            if (show.genres) {
                try {
                    if (show.genres.startsWith('[')) {
                        genres = JSON.parse(show.genres);
                    }
                    else {
                        genres = show.genres.split(',').map((g) => g.trim());
                    }
                }
                catch (e) {
                    logger_1.default.warn({ err: e, showId: show.id }, 'Failed to parse genres for insights');
                }
            }
            for (const g of genres) {
                genreCounts[g] = (genreCounts[g] || 0) + 1;
            }
            if (show.popularityScore) {
                totalPopScore += show.popularityScore;
                popCount++;
            }
        }
        const topGenre = Object.entries(genreCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
        const personaMap = {
            Action: 'Shonen Warrior',
            Romance: 'Hopeless Romantic',
            Comedy: 'Chaos Enjoyer',
            'Slice of Life': 'Vibe Seeker',
            Horror: 'Fearless Watcher',
            Fantasy: 'Isekai Traveller',
            'Sci-Fi': 'Future Scientist',
            Drama: 'Feels Collector',
        };
        const persona = personaMap[topGenre || ''] || 'Anime Enthusiast';
        const avgCompletionDays = velocities.length > 0
            ? Math.round(velocities.reduce((a, b) => a + b.daysToFinish, 0) / velocities.length)
            : 0;
        res.json({
            totalHours: Math.round((core?.totalSeconds || 0) / 3600),
            totalEpisodes: core?.totalEpisodes || 0,
            completedAnime: core?.completedCount || 0,
            completionRate: core?.totalWatchlist > 0
                ? Math.round((core.completedCount / core.totalWatchlist) * 100)
                : 0,
            persona,
            bingeFactor,
            avgSessionMinutes,
            avgCompletionDays,
            popularityScore: popCount > 0 ? Math.round(totalPopScore / popCount) : 0,
            genreSplit: Object.entries(genreCounts)
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 8) || [],
            activityGrid: activityGrid || [],
            hourlyDist: Array.from({ length: 24 }, (_, i) => {
                const hour = i.toString().padStart(2, '0');
                return { hour, count: hourlyDist?.find((d) => d.hour === hour)?.count || 0 };
            }) || [],
            seasonality: Array.from({ length: 12 }, (_, i) => {
                const month = (i + 1).toString().padStart(2, '0');
                return {
                    month,
                    seconds: seasonality?.find((s) => s.month === month)?.seconds || 0,
                };
            }) || [],
            droppedShows: (droppedWarning || []).slice(0, 5),
        });
    });
}
exports.InsightsController = InsightsController;
