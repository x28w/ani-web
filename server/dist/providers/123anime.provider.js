"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports._123AnimeProvider = void 0;
const logger_1 = __importDefault(require("../logger"));
const BASE_URL = 'https://shirayuki-scrapper-api.onrender.com';
class _123AnimeProvider {
    name = '123Anime';
    cache;
    constructor(cache) {
        this.cache = cache;
    }
    createSlug(title) {
        return title
            .toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-+|-+$/g, '');
    }
    normalizeSlugForSearch(title) {
        return title
            .toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/['"]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-+|-+$/g, '');
    }
    /**
     * Picks the best-matching show from a list of search results by comparing
     * how closely each result's title / id matches the query.
     * Scoring (highest wins):
     *   3 – id/slug exact match
     *   2 – title exact match (case-insensitive)
     *   1 – title starts with query
     *   0 – title contains query word (partial)
     *  -1 – no match (but still returned as last resort)
     */
    bestMatch(results, query) {
        const q = query.toLowerCase().trim();
        const qSlug = this.normalizeSlugForSearch(q);
        let best = results[0];
        let bestScore = -1;
        for (const s of results) {
            const id = (s.id || s._id || '').toLowerCase();
            const title = (s.name || '').toLowerCase();
            let score = -1;
            if (id === qSlug || id === q) {
                score = 3;
            }
            else if (title === q) {
                score = 2;
            }
            else if (title.startsWith(q)) {
                score = 1;
            }
            else if (title.includes(q) || id.startsWith(qSlug)) {
                score = 0;
            }
            if (score > bestScore) {
                bestScore = score;
                best = s;
                if (score === 3)
                    break; // can't do better
            }
        }
        return best;
    }
    extractSlugFromUrl(url) {
        if (!url)
            return null;
        try {
            const parts = url.split('/');
            const lastPart = parts[parts.length - 1];
            if (lastPart) {
                return lastPart.replace(/\.(jpg|jpeg|png|webp|gif)$/i, '');
            }
        }
        catch (e) {
            // ignore
        }
        return null;
    }
    async search(options) {
        try {
            const rawQuery = options.query || '';
            const query = rawQuery.replace(/[""]/g, '').replace(/[']/g, '').replace(/\s+/g, ' ').trim();
            const url = `${BASE_URL}/search?keyword=${encodeURIComponent(query)}`;
            const response = await fetch(url);
            if (!response.ok) {
                logger_1.default.warn({ url, status: response.status }, '123Anime search failed with non-200 status');
                return [];
            }
            const data = (await response.json());
            if (!data.success || !data.data) {
                return [];
            }
            return (data.data || []).map((anime) => {
                const imageUrl = anime.thumbnail || anime.image || anime.poster;
                const slugFromUrl = this.extractSlugFromUrl(imageUrl);
                const titleForSlug = anime.japanese_title || anime.title;
                const id = anime.id || slugFromUrl || this.normalizeSlugForSearch(titleForSlug);
                return {
                    _id: id,
                    id: id,
                    name: anime.title,
                    englishName: anime.title,
                    thumbnail: imageUrl,
                    type: anime.type,
                    availableEpisodesDetail: {
                        sub: Array.from({ length: Number(anime.episode) || 0 }, (_, i) => (i + 1).toString()),
                        dub: [],
                    },
                };
            });
        }
        catch (error) {
            logger_1.default.error({ err: error }, '123Anime search failed');
            return [];
        }
    }
    async getEpisodes(showId) {
        try {
            const cacheKey = `123anime_eps_${showId}`;
            const cached = this.cache.get(cacheKey);
            if (cached) {
                return cached;
            }
            const results = await this.search({ query: showId.replace(/ /g, '-') });
            const show = results.find((s) => s.id === showId || s._id === showId) ||
                (results.length > 0 ? this.bestMatch(results, showId) : undefined);
            if (!show || !show.availableEpisodesDetail) {
                return null;
            }
            const episodes = show.availableEpisodesDetail.sub || [];
            const result = {
                episodes,
                description: '',
            };
            this.cache.set(cacheKey, result, 3600);
            return result;
        }
        catch (error) {
            logger_1.default.error({ err: error, showId }, '123Anime getEpisodes failed');
            return null;
        }
    }
    async getStreamUrls(showId, episodeNumber, mode) {
        try {
            const animeId = showId.trim();
            if (!animeId)
                return null;
            const isDubResult = /\bdub\b/i.test(animeId.replace(/-/g, ' '));
            if ((mode === 'dub') !== isDubResult)
                return [];
            const url = `${BASE_URL}/episode-stream?id=${animeId}&ep=${episodeNumber}`;
            const response = await fetch(url);
            if (!response.ok) {
                logger_1.default.warn({ url, status: response.status }, '123Anime stream request failed');
                return null;
            }
            const data = (await response.json());
            if (!data.success || !data.data) {
                return null;
            }
            const streamingLink = data.data['streaming_link'] || data.data['stream'] || data.data['url'];
            if (!streamingLink) {
                logger_1.default.warn({ data }, '123Anime No streaming link found in response data');
                return null;
            }
            const separator = streamingLink.includes('?') ? '&' : '?';
            const finalUrl = `${streamingLink}${separator}autoplay=1`;
            return [
                {
                    sourceName: `123Anime (${mode.toUpperCase()})`,
                    links: [
                        {
                            resolutionStr: 'auto',
                            link: finalUrl,
                            hls: false,
                        },
                    ],
                    type: 'iframe',
                },
            ];
        }
        catch (error) {
            logger_1.default.error({ err: error, showId, episodeNumber }, '123Anime getStreamUrls failed');
            return null;
        }
    }
    async getShowMeta(showId) {
        const results = await this.search({ query: showId.replace(/ /g, '-') });
        return results.find((s) => s.id === showId || s._id === showId) || null;
    }
    async getPopular() {
        return [];
    }
    async getSchedule() {
        return [];
    }
    async getSeasonal() {
        return [];
    }
    async getLatestReleases() {
        return [];
    }
    async getSkipTimes() {
        return { found: false, results: [] };
    }
    async getShowDetails() {
        return { status: 'Unknown' };
    }
    async getAllmangaDetails() {
        return {
            Rating: 'N/A',
            Season: 'N/A',
            Episodes: 'N/A',
            Date: 'N/A',
            'Original Broadcast': 'N/A',
        };
    }
}
exports._123AnimeProvider = _123AnimeProvider;
