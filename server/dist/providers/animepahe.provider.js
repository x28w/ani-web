"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnimePaheProvider = void 0;
const cheerio = __importStar(require("cheerio"));
const logger_1 = __importDefault(require("../logger"));
class AnimePaheProvider {
    name = 'AnimePahe';
    base = 'https://animepahe.pw';
    apiBase = 'https://animepahe.pw/api';
    cache;
    constructor(cache) {
        this.cache = cache;
    }
    getHeaders(isApi = false) {
        const cookies = {
            __ddg1_: '5H0114JE1p0wQHdJiV2O',
            __ddg2_: 'FxnuwLkvPnXSQtPE',
            __ddg8_: 'j55RhixQcxVPfvqt',
            __ddg9_: '51.158.195.12',
            __ddg10_: '1769167572',
            __ddgid_: 'ExAWs3AJTzpAKb8m',
            __ddgmark_: 'slbgrX6Jj2jTxuo2',
        };
        const cookieString = Object.entries(cookies)
            .map(([key, val]) => `${key}=${val}`)
            .join('; ');
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            Referer: 'https://animepahe.pw/',
            Origin: 'https://animepahe.pw',
            Cookie: cookieString,
        };
        if (isApi) {
            headers['X-Requested-With'] = 'XMLHttpRequest';
            headers['Accept'] = 'application/json, text/javascript, */*; q=0.01';
        }
        return headers;
    }
    async get(url, isApi = false) {
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: this.getHeaders(isApi),
            });
            const text = await response.text();
            if (!response.ok) {
                if (response.status === 403 || text.includes('DDoS-Guard')) {
                    logger_1.default.error('DDoS-Guard blocked the request! Your ANIMEPAHE_COOKIES in .env are likely expired.');
                }
                throw new Error(`HTTP ${response.status}`);
            }
            return text;
        }
        catch (error) {
            const err = error;
            logger_1.default.error({ url, err: err.message }, 'AnimePahe Fetch failed');
            throw error;
        }
    }
    async getJson(url) {
        const data = await this.get(url, true);
        try {
            return JSON.parse(data);
        }
        catch {
            logger_1.default.error({ url }, 'Failed to parse JSON (likely blocked by bot protection)');
            return {};
        }
    }
    async search(options) {
        try {
            const query = options.query || '';
            const url = `${this.apiBase}?m=search&q=${encodeURIComponent(query)}`;
            const data = (await this.getJson(url));
            const animeRows = (data.data || data.results || data.items || []);
            return animeRows.map((a) => ({
                _id: a.session,
                id: a.session,
                name: a.title || a.name || '',
                englishName: a.title,
                thumbnail: a.poster || a.image,
                type: a.type,
                year: a.year,
                session: a.session,
            }));
        }
        catch {
            return [];
        }
    }
    async getEpisodes(showId) {
        try {
            const firstPageUrl = `${this.apiBase}?m=release&id=${showId}&sort=episode_asc&page=1`;
            const firstPageData = (await this.getJson(firstPageUrl));
            let episodes = (firstPageData.data || firstPageData.results || []);
            const lastPage = Number(firstPageData.last_page || firstPageData.lastPage || 1);
            for (let p = 2; p <= lastPage; p++) {
                const pageUrl = `${this.apiBase}?m=release&id=${showId}&sort=episode_asc&page=${p}`;
                const pageData = (await this.getJson(pageUrl));
                episodes = episodes.concat((pageData.data || pageData.results || []));
            }
            const episodeMap = {};
            const episodeNumbers = [];
            episodes.forEach((ep) => {
                const epNum = (ep.episode ?? ep.number ?? '').toString();
                if (epNum) {
                    episodeMap[epNum] = ep.session || ep.release_session || '';
                    episodeNumbers.push(epNum);
                }
            });
            this.cache.set(`animepahe_epmap_${showId}`, episodeMap, 86400);
            return {
                episodes: episodeNumbers.sort((a, b) => Number(a) - Number(b)),
                description: '',
            };
        }
        catch {
            return null;
        }
    }
    async getEpisodeSession(showId, episodeNumber) {
        const cacheKey = `animepahe_epmap_${showId}`;
        let cachedMap = this.cache.get(cacheKey);
        if (!cachedMap) {
            await this.getEpisodes(showId);
            cachedMap = this.cache.get(cacheKey);
        }
        if (!cachedMap)
            return null;
        if (cachedMap[episodeNumber]) {
            return cachedMap[episodeNumber];
        }
        const requestedNum = parseFloat(episodeNumber);
        const keys = Object.keys(cachedMap);
        for (const key of keys) {
            if (parseFloat(key) === requestedNum) {
                return cachedMap[key];
            }
        }
        const sortedKeys = keys.sort((a, b) => Number(a) - Number(b));
        const minEp = Number(sortedKeys[0]);
        if (requestedNum < minEp) {
            const index = Math.floor(requestedNum) - 1;
            if (index >= 0 && index < sortedKeys.length) {
                const actualEpNum = sortedKeys[index];
                return cachedMap[actualEpNum];
            }
        }
        return null;
    }
    async getStreamUrls(showId, episodeNumber, mode) {
        try {
            const epSession = await this.getEpisodeSession(showId, episodeNumber);
            if (!epSession)
                return null;
            const sources = await this.getSources(showId, epSession);
            const videoSources = [];
            for (const src of sources) {
                const audio = (src.audio || '').trim().toLowerCase();
                const sourceMode = audio.includes('eng') || audio.includes('dub')
                    ? 'dub'
                    : audio.includes('jpn') || audio.includes('jap') || audio.includes('sub')
                        ? 'sub'
                        : null;
                if (sourceMode !== mode)
                    continue;
                const label = src.fansub
                    ? `${src.quality || 'Auto'} - ${src.fansub} (${sourceMode.toUpperCase()})`
                    : `${src.quality || 'Auto'} (${sourceMode.toUpperCase()})`;
                videoSources.push({
                    sourceName: label,
                    links: [
                        {
                            resolutionStr: src.quality || 'Auto',
                            link: src.url,
                            hls: false,
                        },
                    ],
                    type: 'iframe',
                    actualEpisodeNumber: episodeNumber,
                });
            }
            return videoSources.length > 0 ? videoSources : null;
        }
        catch {
            return null;
        }
    }
    async getSources(animeSession, episodeSession) {
        try {
            const playUrl = `${this.base}/play/${animeSession}/${episodeSession}`;
            const html = await this.get(playUrl);
            const $ = cheerio.load(html);
            const sources = [];
            $('[data-src]').each((_, el) => {
                const src = $(el).attr('data-src')?.trim();
                if (!src || !/kwik/i.test(src))
                    return;
                const resolution = $(el).attr('data-resolution') || $(el).attr('data-res');
                sources.push({
                    url: src,
                    quality: resolution ? (resolution.endsWith('p') ? resolution : `${resolution}p`) : null,
                    fansub: $(el).attr('data-fansub') ?? null,
                    audio: $(el).attr('data-audio') ?? null,
                });
            });
            const unique = Array.from(new Map(sources.map((s) => [s.url, s])).values());
            unique.sort((a, b) => {
                const qa = a.quality ? parseInt(a.quality) || 0 : 0;
                const qb = b.quality ? parseInt(b.quality) || 0 : 0;
                return qb - qa;
            });
            return unique;
        }
        catch {
            return [];
        }
    }
    async resolveKwik(kwikUrl) {
        try {
            const fetchUrl = kwikUrl.replace('/e/', '/f/');
            const response = await fetch(fetchUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    Referer: 'https://animepahe.pw/',
                },
            });
            const html = await response.text();
            if (html.includes('Just a moment')) {
                throw new Error('Kwik triggered a Cloudflare challenge.');
            }
            const directMatch = html.match(/(?:source|file)\s*:\s*['"]([^'"]+\.m3u8)['"]/);
            if (directMatch)
                return { m3u8: directMatch[1], referer: kwikUrl };
            const packedMatch = html.match(/'([^']{50,})'\.split\('\|'\)/);
            if (packedMatch) {
                const parts = packedMatch[1].split('|');
                const hash = parts.find((p) => p.length === 64 && /^[a-f0-9]+$/.test(p));
                const domain = parts.find((p) => p.includes('owocdn'));
                if (hash) {
                    const cdn = domain || 'na.owocdn.top';
                    return { m3u8: `https://${cdn}/stream/01/${hash}/uwu.m3u8`, referer: kwikUrl };
                }
            }
            throw new Error('Could not regex m3u8 link from Kwik HTML');
        }
        catch (err) {
            const error = err;
            logger_1.default.error({ err: error.message }, 'Kwik Resolve failed');
            return { m3u8: '', referer: kwikUrl };
        }
    }
    async getShowMeta(showId) {
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
exports.AnimePaheProvider = AnimePaheProvider;
