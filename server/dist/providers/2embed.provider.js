"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwoEmbedProvider = void 0;
const logger_1 = __importDefault(require("../logger"));
const EMBED_BASE_URL = 'https://hnembed.cc';
const VIDAPI_BASE_URL = 'https://vaplayer.ru';
const IMDB_SUGGEST_URL = 'https://v3.sg.media-imdb.com/suggestion/x';
const TV_TYPES = new Set(['tvSeries', 'tvMiniSeries']);
function toValidSeason(value) {
    const season = Number(value);
    return Number.isInteger(season) && season >= 1 && season <= 99 ? season : undefined;
}
function extractTitleAndSeason(title) {
    const seasonMatch = title.match(/\bseason\s*(\d+)\b/i) ||
        title.match(/\b(\d+)(?:st|nd|rd|th)\s+season\b/i) ||
        title.match(/\bs(\d+)\b/i);
    const season = toValidSeason(seasonMatch?.[1]) || 1;
    const cleanTitle = seasonMatch
        ? title
            .replace(seasonMatch[0], '')
            .replace(/\s*[-:]\s*$/, '')
            .trim()
        : title.trim();
    return {
        title: cleanTitle || title.trim(),
        season,
        hasExplicitSeason: !!seasonMatch,
    };
}
function normalizeTitle(title) {
    return title
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}
function scoreTitleMatch(queryTitles, title) {
    const candidate = normalizeTitle(title);
    if (!candidate)
        return -1;
    return Math.max(...queryTitles.map((queryTitle) => {
        const query = normalizeTitle(queryTitle);
        if (!query)
            return -1;
        if (candidate === query)
            return 100;
        if (candidate.startsWith(query) || query.startsWith(candidate))
            return 70;
        const queryTerms = new Set(query.split(' ').filter((term) => term.length > 2));
        const candidateTerms = new Set(candidate.split(' ').filter((term) => term.length > 2));
        const overlap = [...queryTerms].filter((term) => candidateTerms.has(term)).length;
        return overlap * 10 - Math.abs(queryTerms.size - candidateTerms.size);
    }));
}
function encodeProviderId(imdbId, season) {
    return `${imdbId}::s${season}`;
}
function decodeProviderId(providerId) {
    const match = providerId.match(/^(tt\d+)(?:::s(\d+))?$/i);
    if (!match)
        return null;
    return {
        imdbId: match[1],
        season: Math.max(1, Number(match[2]) || 1),
    };
}
function createIframeSource(sourceName, link) {
    return {
        sourceName,
        type: 'iframe',
        links: [
            {
                resolutionStr: 'Embed',
                link,
                hls: false,
            },
        ],
    };
}
class TwoEmbedProvider {
    cache;
    name = '2Embed';
    constructor(cache) {
        this.cache = cache;
    }
    async search(options) {
        const rawTitle = String(options.query || '').trim();
        if (!rawTitle)
            return [];
        const rawTitles = [rawTitle, ...String(options.aliases || '').split('|')];
        const parsedTitleMap = new Map();
        rawTitles
            .map((title) => extractTitleAndSeason(title.trim()))
            .filter(({ title }) => !!title)
            .forEach((parsed) => {
            const key = parsed.title.toLowerCase();
            const existing = parsedTitleMap.get(key);
            if (!existing || (!existing.hasExplicitSeason && parsed.hasExplicitSeason)) {
                parsedTitleMap.set(key, parsed);
            }
        });
        const parsedTitles = Array.from(parsedTitleMap.values());
        const queryTitles = parsedTitles.map(({ title }) => title).slice(0, 3);
        const season = toValidSeason(options.season) ||
            parsedTitles.find(({ hasExplicitSeason }) => hasExplicitSeason)?.season ||
            1;
        const cacheKey = `2embed-search-${queryTitles.map((title) => title.toLowerCase()).join('|')}-${season}`;
        const cached = this.cache.get(cacheKey);
        if (cached)
            return cached;
        try {
            const suggestions = await Promise.all(queryTitles.map(async (title) => {
                const response = await fetch(`${IMDB_SUGGEST_URL}/${encodeURIComponent(title)}.json`, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                });
                if (!response.ok)
                    return [];
                const data = (await response.json());
                return data.d || [];
            }));
            const matches = Array.from(new Map(suggestions
                .flat()
                .filter((entry) => !!entry.id && !!entry.l && TV_TYPES.has(String(entry.qid)))
                .map((entry) => [entry.id, entry])).values())
                .sort((left, right) => scoreTitleMatch(queryTitles, String(right.l)) -
                scoreTitleMatch(queryTitles, String(left.l)))
                .filter((entry) => !!entry.id && !!entry.l && TV_TYPES.has(String(entry.qid)))
                .slice(0, 5)
                .map((entry) => {
                const id = encodeProviderId(String(entry.id), season);
                return {
                    _id: id,
                    id,
                    name: String(entry.l),
                    englishName: String(entry.l),
                    thumbnail: entry.i?.imageUrl || '',
                    type: 'TV',
                };
            });
            this.cache.set(cacheKey, matches, 3600);
            return matches;
        }
        catch (error) {
            logger_1.default.warn({ err: error, titles: queryTitles }, '2Embed IMDb title lookup failed');
            return [];
        }
    }
    async getStreamUrls(showId, episodeNumber, _mode) {
        const id = decodeProviderId(showId);
        const episode = Number(episodeNumber);
        if (!id || !Number.isInteger(episode) || episode < 1)
            return null;
        const hnEmbedLink = `${EMBED_BASE_URL}/embed/tv/${id.imdbId}/${id.season}/${episode}?autoplay=1`;
        const vidApiLink = `${VIDAPI_BASE_URL}/embed/tv/${id.imdbId}/${id.season}/${episode}`;
        const sources = [];
        if (await this.hasHnEmbedEpisode(hnEmbedLink)) {
            sources.push(createIframeSource('HNEmbed (Audio varies)', hnEmbedLink));
        }
        sources.push(createIframeSource('VidAPI (Audio varies)', vidApiLink));
        return sources;
    }
    async hasHnEmbedEpisode(url) {
        const cacheKey = `2embed-episode-${url}`;
        const cached = this.cache.get(cacheKey);
        if (cached !== undefined)
            return cached;
        try {
            const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            const html = await response.text();
            const available = response.ok &&
                !html.includes('<title>Error 404</title>') &&
                !html.includes('API call failed with HTTP code');
            this.cache.set(cacheKey, available, available ? 3600 : 300);
            return available;
        }
        catch (error) {
            logger_1.default.warn({ err: error, url }, '2Embed episode availability check failed');
            return false;
        }
    }
    async getShowMeta(showId) {
        const id = decodeProviderId(showId);
        if (!id)
            return null;
        return { _id: showId, id: showId, name: id.imdbId };
    }
    async getEpisodes() {
        return null;
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
exports.TwoEmbedProvider = TwoEmbedProvider;
