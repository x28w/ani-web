"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WatchlistController = void 0;
const logger_1 = __importDefault(require("../logger"));
const sync_1 = require("../sync");
const watchlist_repository_1 = require("../repositories/watchlist.repository");
const watched_episodes_repository_1 = require("../repositories/watched-episodes.repository");
const shows_meta_repository_1 = require("../repositories/shows-meta.repository");
const notifications_repository_1 = require("../repositories/notifications.repository");
const async_handler_1 = require("../utils/async-handler");
class WatchlistController {
    provider;
    activeTypeFetches = new Set();
    constructor(provider) {
        this.provider = provider;
    }
    getProgressUserId(req) {
        return req.siteUser?.username || 'local';
    }
    normalizeFilterValue(value) {
        if (typeof value !== 'string')
            return undefined;
        const trimmed = value.trim();
        return trimmed && trimmed !== 'ALL' ? trimmed : undefined;
    }
    getWatchlistFilters(query) {
        return {
            query: this.normalizeFilterValue(query.query),
            type: this.normalizeFilterValue(query.type),
            season: this.normalizeFilterValue(query.season),
            year: this.normalizeFilterValue(query.year),
            country: this.normalizeFilterValue(query.country),
            translation: this.normalizeFilterValue(query.translation),
            genres: this.normalizeFilterValue(query.genres),
            excludeGenres: this.normalizeFilterValue(query.excludeGenres),
            tags: this.normalizeFilterValue(query.tags),
            excludeTags: this.normalizeFilterValue(query.excludeTags),
            studios: this.normalizeFilterValue(query.studios),
            sortBy: this.normalizeFilterValue(query.sortBy),
            titlePreference: ['name', 'nativeName', 'englishName'].includes(String(query.titlePreference))
                ? query.titlePreference
                : 'name',
        };
    }
    hasProviderFilters(filters) {
        return !!(filters.season ||
            filters.year ||
            filters.country ||
            filters.translation ||
            filters.genres ||
            filters.excludeGenres ||
            filters.tags ||
            filters.excludeTags ||
            filters.studios);
    }
    matchesLocalFilters(row, filters) {
        if (filters.query) {
            const needle = filters.query.toLowerCase();
            const haystack = [row.name, row.nativeName, row.englishName]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            if (!haystack.includes(needle))
                return false;
        }
        if (filters.type && row.type !== filters.type)
            return false;
        return true;
    }
    sortFilteredRows(rows, filters) {
        const getSortTitle = (row) => {
            const preferredTitle = filters.titlePreference ? row[filters.titlePreference] : undefined;
            return preferredTitle || row.name || '';
        };
        if (filters.sortBy === 'name_asc') {
            return [...rows].sort((a, b) => getSortTitle(a).localeCompare(getSortTitle(b)));
        }
        if (filters.sortBy === 'name_desc') {
            return [...rows].sort((a, b) => getSortTitle(b).localeCompare(getSortTitle(a)));
        }
        return rows;
    }
    async getProviderMatchedIds(filters) {
        if (!this.hasProviderFilters(filters))
            return new Set();
        const searchOptions = {
            season: filters.season,
            year: filters.year,
            country: filters.country,
            translation: filters.translation,
            genres: filters.genres,
            excludeGenres: filters.excludeGenres,
            tags: filters.tags,
            excludeTags: filters.excludeTags,
            studios: filters.studios,
        };
        const ids = new Set();
        const maxPages = 25;
        for (let page = 1; page <= maxPages; page += 1) {
            const results = await this.provider.search({ ...searchOptions, page: String(page) });
            for (const show of results)
                ids.add(show._id);
            if (results.length < 28)
                break;
            await new Promise((res) => setImmediate(res));
        }
        return ids;
    }
    async filterWatchlistRows(rows, filters) {
        let filtered = rows.filter((row) => this.matchesLocalFilters(row, filters));
        if (this.hasProviderFilters(filters)) {
            const matchedIds = await this.getProviderMatchedIds(filters);
            filtered = filtered.filter((row) => matchedIds.has(row.id));
        }
        return this.sortFilteredRows(filtered, filters);
    }
    async getContinueWatchingData(req, limit) {
        const userId = this.getProgressUserId(req);
        const rows = await watched_episodes_repository_1.WatchedEpisodesRepository.getContinueWatching(req.db, userId, limit);
        const showsNeedingEpisodes = rows.filter((show) => {
            const watchedCount = show.watchedCount || 0;
            return !show.episodeCount || (watchedCount > 0 && show.episodeCount <= watchedCount);
        });
        const episodeFetchResults = new Map();
        if (showsNeedingEpisodes.length > 0) {
            const BATCH_SIZE = 5;
            for (let i = 0; i < showsNeedingEpisodes.length; i += BATCH_SIZE) {
                const batch = showsNeedingEpisodes.slice(i, i + BATCH_SIZE);
                const batchResults = await Promise.allSettled(batch.map((show) => this.provider.getEpisodes(show.id, 'sub')));
                batch.forEach((show, index) => {
                    const result = batchResults[index];
                    if (result.status === 'fulfilled' && result.value?.episodes) {
                        const epCount = result.value.episodes.length;
                        episodeFetchResults.set(show.id, epCount);
                        shows_meta_repository_1.ShowsMetaRepository.updateEpisodeCount(req.db, show.id, epCount).catch((e) => {
                            logger_1.default.error({ err: e, showId: show.id }, 'Failed to update episode count in DB');
                        });
                    }
                });
            }
        }
        const enrichedRows = rows.map((show) => {
            const epCount = episodeFetchResults.get(show.id) ?? show.episodeCount;
            return {
                ...show,
                episodeCount: epCount,
                type: show.type || show.smType,
                thumbnail: this.provider.deobfuscateUrl(show.thumbnail ?? ''),
            };
        });
        setImmediate(async () => {
            if (req.db.isClosedCheck())
                return;
            const delay = () => new Promise((res) => setImmediate(res));
            for (const show of enrichedRows) {
                const currentThumbnail = show.thumbnail || '';
                const fixedThumbnail = this.provider.deobfuscateUrl(currentThumbnail);
                const needsThumbnailUpdate = fixedThumbnail !== currentThumbnail;
                if ((!show.type || needsThumbnailUpdate) && !this.activeTypeFetches.has(show.id)) {
                    this.activeTypeFetches.add(show.id);
                    try {
                        let didUpdate = false;
                        if (needsThumbnailUpdate && !req.db.isClosedCheck()) {
                            await watchlist_repository_1.WatchlistRepository.updateThumbnail(req.db, show.id, fixedThumbnail);
                            await shows_meta_repository_1.ShowsMetaRepository.updateThumbnail(req.db, show.id, fixedThumbnail);
                            didUpdate = true;
                        }
                        if (!show.type) {
                            const meta = await this.provider.getShowMeta(show.id);
                            if (meta && meta.type && !req.db.isClosedCheck()) {
                                await shows_meta_repository_1.ShowsMetaRepository.updateType(req.db, show.id, meta.type);
                                await watchlist_repository_1.WatchlistRepository.updateType(req.db, show.id, meta.type);
                                didUpdate = true;
                            }
                        }
                        if (didUpdate)
                            req.db.scheduleSave();
                    }
                    catch (e) {
                        logger_1.default.error({ err: e, showId: show.id }, 'Lazy migration error for show');
                    }
                    finally {
                        this.activeTypeFetches.delete(show.id);
                    }
                    await delay();
                }
            }
        });
        return enrichedRows;
    }
    async getUpNextShowsData(req) {
        const userId = this.getProgressUserId(req);
        const watchingShows = await watched_episodes_repository_1.WatchedEpisodesRepository.getUpNextShows(req.db, userId);
        if (watchingShows.length === 0)
            return [];
        const showIds = watchingShows.map((s) => s.id);
        const allWatchedEps = await watched_episodes_repository_1.WatchedEpisodesRepository.getEpisodesForShows(req.db, userId, showIds);
        const watchedByShow = new Map();
        for (const ep of allWatchedEps) {
            const arr = watchedByShow.get(ep.showId);
            if (arr)
                arr.push(ep);
            else
                watchedByShow.set(ep.showId, [ep]);
        }
        const BATCH_SIZE = 5;
        const upNextShows = [];
        for (let i = 0; i < watchingShows.length; i += BATCH_SIZE) {
            const batch = watchingShows.slice(i, i + BATCH_SIZE);
            const batchResults = await Promise.allSettled(batch.map(async (show) => {
                try {
                    const epDetails = await this.provider.getEpisodes(show.id, 'sub');
                    const watchedEpisodesResult = watchedByShow.get(show.id) ?? [];
                    const allEps = epDetails?.episodes?.sort((a, b) => parseFloat(a) - parseFloat(b)) || [];
                    const watchedEpsMap = new Map(watchedEpisodesResult.map((r) => [r.episodeNumber.toString(), r]));
                    const unwatchedEps = allEps.filter((ep) => !watchedEpsMap.has(ep));
                    if (unwatchedEps.length > 0) {
                        return {
                            _id: show.id,
                            id: show.id,
                            name: show.name,
                            thumbnail: this.provider.deobfuscateUrl(show.thumbnail ?? ''),
                            nativeName: show.nativeName,
                            englishName: show.englishName,
                            type: show.type || show.smType,
                            nextEpisodeToWatch: unwatchedEps[0],
                            newEpisodesCount: unwatchedEps.length,
                            episodeCount: allEps.length,
                            watchedCount: watchedEpsMap.size,
                        };
                    }
                    return null;
                }
                catch (e) {
                    logger_1.default.error({ err: e, showId: show.id }, 'Error processing show for Up Next list');
                    return null;
                }
            }));
            for (const result of batchResults) {
                if (result.status === 'fulfilled' && result.value) {
                    upNextShows.push(result.value);
                }
            }
            if (i + BATCH_SIZE < watchingShows.length) {
                await new Promise((res) => setImmediate(res));
            }
        }
        return upNextShows;
    }
    getContinueWatchingFast = (0, async_handler_1.asyncHandler)(async (req, res) => {
        const limit = parseInt(req.query.limit) || 10;
        const data = await this.getContinueWatchingData(req, limit);
        res.json(data);
    });
    getContinueWatchingUpNext = (0, async_handler_1.asyncHandler)(async (req, res) => {
        const data = await this.getUpNextShowsData(req);
        res.json(data);
    });
    getContinueWatching = (0, async_handler_1.asyncHandler)(async (req, res) => {
        const limit = parseInt(req.query.limit) || 10;
        const data = await this.getContinueWatchingData(req);
        res.json(data.slice(0, limit));
    });
    getAllContinueWatching = (0, async_handler_1.asyncHandler)(async (req, res) => {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const filters = this.getWatchlistFilters(req.query);
        const data = await this.filterWatchlistRows(await this.getContinueWatchingData(req), filters);
        res.json({
            data: data.slice(offset, offset + limit),
            total: data.length,
            page,
            limit,
        });
    });
    updateProgress = (0, async_handler_1.asyncHandler)(async (req, res) => {
        const { showId, episodeNumber, currentTime, duration, showName, showThumbnail, nativeName, englishName, genres, popularityScore, type, status, episodeCount, } = req.body;
        if (!showId || !episodeNumber) {
            res.status(400).json({ error: 'showId and episodeNumber are required' });
            return;
        }
        const genresStr = Array.isArray(genres) ? JSON.stringify(genres) : genres;
        await (0, sync_1.performWriteTransaction)(req.db, (tx) => {
            shows_meta_repository_1.ShowsMetaRepository.upsert(tx, {
                id: showId,
                name: showName,
                thumbnail: this.provider.deobfuscateUrl(showThumbnail),
                nativeName,
                englishName,
                genres: genresStr,
                popularityScore,
                status,
                episodeCount,
                type,
            });
            watched_episodes_repository_1.WatchedEpisodesRepository.upsert(tx, {
                userId: this.getProgressUserId(req),
                showId,
                episodeNumber,
                currentTime,
                duration,
            });
            notifications_repository_1.NotificationsRepository.deleteSpecificDismissed(tx, showId, episodeNumber);
        });
        req.db.scheduleSave();
        res.json({ success: true });
    });
    recordWatchTime = (0, async_handler_1.asyncHandler)(async (req, res) => {
        const { showId, episodeNumber } = req.body;
        const seconds = Number(req.body?.seconds);
        if (!showId || !episodeNumber || !Number.isFinite(seconds) || seconds <= 0 || seconds > 30) {
            res.status(400).json({ error: 'A valid episode and watch interval are required' });
            return;
        }
        await (0, sync_1.performWriteTransaction)(req.db, (tx) => {
            watched_episodes_repository_1.WatchedEpisodesRepository.addWatchTime(tx, this.getProgressUserId(req), showId, episodeNumber, Math.round(seconds));
        });
        req.db.scheduleSave();
        res.json({ success: true });
    });
    removeContinueWatching = (0, async_handler_1.asyncHandler)(async (req, res) => {
        const { showId } = req.body;
        await (0, sync_1.performWriteTransaction)(req.db, (tx) => {
            const userId = this.getProgressUserId(req);
            watched_episodes_repository_1.WatchedEpisodesRepository.deleteByShow(tx, userId, showId);
            watched_episodes_repository_1.WatchedEpisodesRepository.deleteActivityByShow(tx, userId, showId);
        });
        res.json({ success: true });
    });
    getWatchlist = (0, async_handler_1.asyncHandler)(async (req, res) => {
        const { status, page: pageStr, limit: limitStr } = req.query;
        const page = parseInt(pageStr) || 1;
        const limit = parseInt(limitStr) || 10;
        const offset = (page - 1) * limit;
        const filters = this.getWatchlistFilters(req.query);
        const allRows = await watchlist_repository_1.WatchlistRepository.getAll(req.db, status);
        const filteredRows = await this.filterWatchlistRows(allRows, filters);
        const rows = filteredRows.slice(offset, offset + limit);
        res.json({
            data: rows.map((row) => ({
                ...row,
                _id: row.id,
                thumbnail: this.provider.deobfuscateUrl(row.thumbnail || ''),
            })),
            total: filteredRows.length,
            page,
            limit,
        });
        setImmediate(async () => {
            if (req.db.isClosedCheck())
                return;
            const delay = () => new Promise((res) => setImmediate(res));
            for (const row of rows) {
                const currentThumbnail = row.thumbnail || '';
                const fixedThumbnail = this.provider.deobfuscateUrl(currentThumbnail);
                const needsThumbnailUpdate = fixedThumbnail !== currentThumbnail;
                if ((!row.type || needsThumbnailUpdate) && !this.activeTypeFetches.has(row.id)) {
                    this.activeTypeFetches.add(row.id);
                    try {
                        let didUpdate = false;
                        if (needsThumbnailUpdate && !req.db.isClosedCheck()) {
                            await watchlist_repository_1.WatchlistRepository.updateThumbnail(req.db, row.id, fixedThumbnail);
                            await shows_meta_repository_1.ShowsMetaRepository.updateThumbnail(req.db, row.id, fixedThumbnail);
                            didUpdate = true;
                        }
                        if (!row.type) {
                            const meta = await this.provider.getShowMeta(row.id);
                            if (meta && !req.db.isClosedCheck()) {
                                if (meta.type) {
                                    await watchlist_repository_1.WatchlistRepository.updateType(req.db, row.id, meta.type);
                                    await shows_meta_repository_1.ShowsMetaRepository.updateType(req.db, row.id, meta.type);
                                    didUpdate = true;
                                }
                                if (meta.thumbnail) {
                                    const metaThumb = this.provider.deobfuscateUrl(meta.thumbnail);
                                    if (metaThumb !== fixedThumbnail) {
                                        await watchlist_repository_1.WatchlistRepository.updateThumbnail(req.db, row.id, metaThumb);
                                        await shows_meta_repository_1.ShowsMetaRepository.updateThumbnail(req.db, row.id, metaThumb);
                                        didUpdate = true;
                                    }
                                }
                            }
                        }
                        if (didUpdate)
                            req.db.scheduleSave();
                    }
                    catch (e) {
                        logger_1.default.error({ err: e, showId: row.id }, 'Watchlist lazy migration error');
                    }
                    finally {
                        this.activeTypeFetches.delete(row.id);
                    }
                    await delay();
                }
            }
        });
    });
    checkWatchlist = (0, async_handler_1.asyncHandler)(async (req, res) => {
        const item = await watchlist_repository_1.WatchlistRepository.getById(req.db, req.params.showId);
        res.json({ inWatchlist: !!item, status: item?.status ?? null });
    });
    getEpisodeProgress = (0, async_handler_1.asyncHandler)(async (req, res) => {
        const progress = await watched_episodes_repository_1.WatchedEpisodesRepository.getByShowAndEpisode(req.db, this.getProgressUserId(req), req.params.showId, req.params.episodeNumber);
        res.json(progress || { currentTime: 0, duration: 0 });
    });
    getWatchedEpisodes = (0, async_handler_1.asyncHandler)(async (req, res) => {
        const episodes = await watched_episodes_repository_1.WatchedEpisodesRepository.getWatchedEpisodeNumbers(req.db, this.getProgressUserId(req), req.params.showId);
        res.json(episodes);
    });
    addToWatchlist = (0, async_handler_1.asyncHandler)(async (req, res) => {
        const { id, status, nativeName, englishName } = req.body;
        let { name, thumbnail, type } = req.body;
        if (id && !id.startsWith('show_')) {
            try {
                const meta = await this.provider.getShowMeta(id);
                if (meta && meta.type) {
                    if (!type || type === 'TV')
                        type = meta.type;
                    if (meta.name && !name)
                        name = meta.name;
                    if (meta.thumbnail && !thumbnail)
                        thumbnail = meta.thumbnail;
                }
            }
            catch (e) {
                logger_1.default.warn({ id, err: e }, 'Failed to fetch metadata, proceeding with provided data');
            }
        }
        await (0, sync_1.performWriteTransaction)(req.db, (tx) => {
            watchlist_repository_1.WatchlistRepository.upsert(tx, {
                id,
                name,
                thumbnail: this.provider.deobfuscateUrl(thumbnail),
                status: status || 'Watching',
                nativeName: nativeName || '',
                englishName: englishName || '',
                type: type || 'TV',
            });
        });
        await req.db.saveNow();
        res.json({ success: true });
    });
    removeFromWatchlist = (0, async_handler_1.asyncHandler)(async (req, res) => {
        const { id } = req.body;
        await (0, sync_1.performWriteTransaction)(req.db, (tx) => {
            watchlist_repository_1.WatchlistRepository.delete(tx, id);
            watched_episodes_repository_1.WatchedEpisodesRepository.deleteAllByShow(tx, id);
            watched_episodes_repository_1.WatchedEpisodesRepository.deleteAllActivityByShow(tx, id);
            notifications_repository_1.NotificationsRepository.deleteByShow(tx, id);
        });
        res.json({ success: true });
    });
    updateWatchlistStatus = (0, async_handler_1.asyncHandler)(async (req, res) => {
        const { id, status } = req.body;
        await (0, sync_1.performWriteTransaction)(req.db, (tx) => {
            watchlist_repository_1.WatchlistRepository.updateStatus(tx, id, status);
        });
        res.json({ success: true });
    });
    getNotifications = (0, async_handler_1.asyncHandler)(async (req, res) => {
        const db = req.db;
        const userId = this.getProgressUserId(req);
        const watchingShows = await watchlist_repository_1.WatchlistRepository.getWatchingShows(db);
        const notifications = [];
        const BATCH_SIZE = 5;
        for (let i = 0; i < watchingShows.length; i += BATCH_SIZE) {
            const batch = watchingShows.slice(i, i + BATCH_SIZE);
            await Promise.allSettled(batch.map(async (show) => {
                try {
                    const [epDetails, watchedEps, dismissedEps, showStatus, discoveredEps] = await Promise.all([
                        this.provider.getEpisodes(show.id, 'sub'),
                        watched_episodes_repository_1.WatchedEpisodesRepository.getWatchedEpisodeNumbers(db, userId, show.id),
                        notifications_repository_1.NotificationsRepository.getDismissedByShow(db, show.id),
                        shows_meta_repository_1.ShowsMetaRepository.getStatus(db, show.id),
                        notifications_repository_1.NotificationsRepository.getDiscoveredByShow(db, show.id),
                    ]);
                    if (!epDetails || !epDetails.episodes || epDetails.episodes.length === 0)
                        return;
                    if (showStatus && !['Ongoing', 'Releasing', 'Currently Airing'].includes(showStatus)) {
                        return;
                    }
                    const watchedSet = new Set(watchedEps.map((e) => e.toString()));
                    const dismissedSet = new Set(dismissedEps.map((e) => e.episodeNumber.toString()));
                    const discoveredSet = new Set(discoveredEps.map((e) => e.episodeNumber.toString()));
                    const maxWatched = Math.max(0, ...Array.from(watchedSet).map((e) => parseFloat(e)));
                    const episodes = epDetails.episodes;
                    const sortedEpisodes = [...episodes].sort((a, b) => parseFloat(a) - parseFloat(b));
                    const latestAvailable = sortedEpisodes[sortedEpisodes.length - 1];
                    if (parseFloat(latestAvailable) > maxWatched &&
                        !watchedSet.has(latestAvailable.toString()) &&
                        !dismissedSet.has(latestAvailable.toString()) &&
                        !discoveredSet.has(latestAvailable.toString())) {
                        await notifications_repository_1.NotificationsRepository.addDiscovered(db, show.id, latestAvailable.toString());
                        discoveredSet.add(latestAvailable.toString());
                    }
                    Array.from(discoveredSet).forEach((epStr) => {
                        const epNum = parseFloat(epStr);
                        if (epNum > maxWatched && !watchedSet.has(epStr) && !dismissedSet.has(epStr)) {
                            notifications.push({
                                showId: show.id,
                                name: show.name,
                                nativeName: show.nativeName,
                                englishName: show.englishName,
                                thumbnail: this.provider.deobfuscateUrl(show.thumbnail),
                                episodeNumber: epStr,
                                id: `${show.id}-${epStr}`,
                            });
                        }
                    });
                }
                catch (e) {
                    logger_1.default.error({ err: e, showId: show.id }, 'Failed to fetch notifications for show');
                }
            }));
            if (i + BATCH_SIZE < watchingShows.length) {
                await new Promise((res) => setImmediate(res));
            }
        }
        res.json(notifications.sort((a, b) => parseFloat(b.episodeNumber) - parseFloat(a.episodeNumber)));
    });
    dismissNotification = (0, async_handler_1.asyncHandler)(async (req, res) => {
        const { showId, episodeNumber } = req.body;
        await (0, sync_1.performWriteTransaction)(req.db, (tx) => {
            notifications_repository_1.NotificationsRepository.addDismissed(tx, showId, episodeNumber);
        });
        res.json({ success: true });
    });
    clearAllNotifications = (0, async_handler_1.asyncHandler)(async (req, res) => {
        const { showId } = req.body;
        await (0, sync_1.performWriteTransaction)(req.db, (tx) => {
            notifications_repository_1.NotificationsRepository.dismissFromDiscovered(tx, showId);
        });
        res.json({ success: true });
    });
}
exports.WatchlistController = WatchlistController;
