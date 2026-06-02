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
exports.AllAnimeProvider = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("../logger"));
const crypto = __importStar(require("node:crypto"));
const cheerio = __importStar(require("cheerio"));
const API_BASE_URL = 'https://allanime.day';
const API_ENDPOINT = `https://api.allanime.day/api`;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0';
const REFERER = 'https://youtu-chan.com';
const DEOBFUSCATION_MAP = {
    '79': 'A',
    '7a': 'B',
    '7b': 'C',
    '7c': 'D',
    '7d': 'E',
    '7e': 'F',
    '7f': 'G',
    '70': 'H',
    '71': 'I',
    '72': 'J',
    '73': 'K',
    '74': 'L',
    '75': 'M',
    '76': 'N',
    '77': 'O',
    '68': 'P',
    '69': 'Q',
    '6a': 'R',
    '6b': 'S',
    '6c': 'T',
    '6d': 'U',
    '6e': 'V',
    '6f': 'W',
    '60': 'X',
    '61': 'Y',
    '62': 'Z',
    '59': 'a',
    '5a': 'b',
    '5b': 'c',
    '5c': 'd',
    '5d': 'e',
    '5e': 'f',
    '5f': 'g',
    '50': 'h',
    '51': 'i',
    '52': 'j',
    '53': 'k',
    '54': 'l',
    '55': 'm',
    '56': 'n',
    '57': 'o',
    '48': 'p',
    '49': 'q',
    '4a': 'r',
    '4b': 's',
    '4c': 't',
    '4d': 'u',
    '4e': 'v',
    '4f': 'w',
    '40': 'x',
    '41': 'y',
    '42': 'z',
    '08': '0',
    '09': '1',
    '0a': '2',
    '0b': '3',
    '0c': '4',
    '0d': '5',
    '0e': '6',
    '0f': '7',
    '00': '8',
    '01': '9',
    '15': '-',
    '16': '.',
    '67': '_',
    '46': '~',
    '02': ':',
    '17': '/',
    '07': '?',
    '1b': '#',
    '63': '[',
    '65': ']',
    '78': '@',
    '19': '!',
    '1c': '$',
    '1e': '&',
    '10': '(',
    '11': ')',
    '12': '*',
    '13': '+',
    '14': ',',
    '03': ';',
    '05': '=',
    '1d': '%',
};
class AllAnimeProvider {
    name = 'AllAnime';
    cache;
    constructor(cache) {
        this.cache = cache;
    }
    decryptTobeparsed(encryptedBase64) {
        try {
            const secret = 'Xot36i3lK3:v1';
            const key = crypto.createHash('sha256').update(secret).digest();
            const encryptedBuffer = Buffer.from(encryptedBase64, 'base64');
            if (encryptedBuffer.length < 30) {
                throw new Error('Encrypted data too short');
            }
            const ivPart = encryptedBuffer.subarray(1, 13);
            const iv = Buffer.concat([ivPart, Buffer.from('00000002', 'hex')]);
            const ciphertext = encryptedBuffer.subarray(13, encryptedBuffer.length - 16);
            const decipher = crypto.createDecipheriv('aes-256-ctr', key, iv);
            let decrypted = decipher.update(ciphertext);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            const decryptedString = decrypted.toString('utf8');
            return JSON.parse(decryptedString);
        }
        catch (error) {
            const err = error;
            logger_1.default.error({ err: err.message, stack: err.stack }, 'Failed to decrypt tobeparsed field');
            const e = new Error(`Decryption failed: ${err.message}`);
            e.cause = error;
            throw e;
        }
    }
    _hexDecode(obfuscatedBody) {
        let result = '';
        for (let i = 0; i < obfuscatedBody.length; i += 2) {
            const chunk = obfuscatedBody.substring(i, i + 2);
            result += DEOBFUSCATION_MAP[chunk] || chunk;
        }
        return result;
    }
    deobfuscateStreamUrl(obfuscatedUrl) {
        if (!obfuscatedUrl)
            return '';
        if (!obfuscatedUrl.startsWith('--'))
            return obfuscatedUrl;
        let deobfuscated = this._hexDecode(obfuscatedUrl.slice(2));
        deobfuscated = deobfuscated.replace(/([^:]\/)\/+/g, '$1');
        if (deobfuscated.startsWith('/')) {
            return `${API_BASE_URL}${deobfuscated}`;
        }
        return deobfuscated;
    }
    deobfuscateUrl(obfuscatedUrl) {
        if (!obfuscatedUrl)
            return '';
        let finalUrl = obfuscatedUrl;
        if (!obfuscatedUrl.startsWith('--') &&
            (obfuscatedUrl.includes('s4.anilist.co') || obfuscatedUrl.startsWith('http'))) {
            // Direct access works, proxy is blocked
            finalUrl = obfuscatedUrl;
        }
        else if (obfuscatedUrl.startsWith('--')) {
            const deobfuscated = this._hexDecode(obfuscatedUrl.slice(2));
            if (deobfuscated.startsWith('/')) {
                if (deobfuscated.startsWith('/s4.anilist.co')) {
                    finalUrl = `https:/${deobfuscated}`;
                }
                else {
                    // Use API_BASE_URL instead of the blocked proxy
                    finalUrl = `${API_BASE_URL}${deobfuscated}`;
                }
            }
            else {
                finalUrl = deobfuscated;
            }
        }
        // Handle relative markers and paths
        if (!finalUrl.startsWith('http')) {
            if (finalUrl.startsWith('__Show__')) {
                finalUrl = `https://aln.youtube-anime.com/images/${finalUrl}`;
            }
            else if (finalUrl.startsWith('mcovers') || finalUrl.startsWith('images2')) {
                finalUrl = `https://aln.youtube-anime.com/${finalUrl}`;
            }
            else if (finalUrl.startsWith('/')) {
                finalUrl = `${API_BASE_URL}${finalUrl}`;
            }
        }
        if (finalUrl.includes('wp.youtube-anime.com') || finalUrl.includes('allanime.day')) {
            // refererValue would be set here in the full context
        }
        // Final robust cleanup for aln host and path structure
        if (finalUrl.includes('aln.youtube-anime.com')) {
            // Ensure we use the correct host (remove allanime.day prefix if present)
            finalUrl = finalUrl.replace(/https?:\/\/allanime\.day\/aln\.youtube-anime\.com/, 'https://aln.youtube-anime.com');
            // Remove incorrect /images/ prefix for mcovers/images2
            if (finalUrl.includes('/images/mcovers')) {
                finalUrl = finalUrl.replace('/images/mcovers', '/mcovers');
            }
            if (finalUrl.includes('/images/images2')) {
                finalUrl = finalUrl.replace('/images/images2', '/images2');
            }
        }
        // Don't use the allanime.day proxy for s4.anilist.co URLs
        if (finalUrl.includes('allanime.day/s4.anilist.co')) {
            finalUrl = finalUrl.replace('https://allanime.day/s4.anilist.co', 'https://s4.anilist.co');
            finalUrl = finalUrl.replace('http://allanime.day/s4.anilist.co', 'https://s4.anilist.co');
        }
        // Strip any existing local proxy prefixes that might have been saved
        if (finalUrl.includes('/api/image-proxy?url=')) {
            const match = finalUrl.match(/url=([^&]+)/);
            if (match) {
                const unwrapped = decodeURIComponent(match[1]);
                finalUrl = unwrapped;
                // Recurse once to catch the anilist fix for the unwrapped URL
                return this.deobfuscateUrl(finalUrl);
            }
        }
        return finalUrl;
    }
    async _fetchShows(variables, extensions) {
        const body = { variables };
        const fullQuery = `
      query ($search: SearchInput, $limit: Int, $page: Int, $translationType: VaildTranslationTypeEnumType, $countryOrigin: VaildCountryOriginEnumType) {
        shows(search: $search, limit: $limit, page: $page, translationType: $translationType, countryOrigin: $countryOrigin) {
          edges { _id name nativeName englishName thumbnail description type availableEpisodesDetail isAdult rating }
        }
      }`;
        if (extensions) {
            body.extensions = extensions;
        }
        else {
            body.query = fullQuery;
        }
        try {
            const response = await axios_1.default.post(API_ENDPOINT, body, {
                headers: { 'User-Agent': USER_AGENT, Referer: REFERER },
                timeout: 15000,
            });
            const responseData = response.data;
            if (responseData?.data?.tobeparsed) {
                responseData.data = this.decryptTobeparsed(responseData.data.tobeparsed);
            }
            if (responseData.errors && responseData.errors[0]?.message === 'PersistedQueryNotFound') {
                throw new Error('PersistedQueryNotFound');
            }
            const shows = responseData?.data?.shows?.edges || [];
            return shows.map((show) => ({
                ...show,
                thumbnail: this.deobfuscateUrl(show.thumbnail || ''),
            }));
        }
        catch (error) {
            const err = error;
            if (err.message === 'PersistedQueryNotFound' && extensions) {
                logger_1.default.info('Search hash expired, falling back to full query');
                const response = await axios_1.default.post(API_ENDPOINT, { variables, query: fullQuery }, {
                    headers: { 'User-Agent': USER_AGENT, Referer: REFERER },
                    timeout: 15000,
                });
                const responseData = response.data;
                if (responseData?.data?.tobeparsed) {
                    responseData.data = this.decryptTobeparsed(responseData.data.tobeparsed);
                }
                const shows = responseData?.data?.shows?.edges || [];
                return shows.map((show) => ({
                    ...show,
                    thumbnail: this.deobfuscateUrl(show.thumbnail || ''),
                }));
            }
            throw error;
        }
    }
    async search(options) {
        const { query, season, year, sortBy, page, limit, type, country, translation, genres, excludeGenres, tags, excludeTags, studios, } = options;
        const searchObj = { allowAdult: false };
        if (query)
            searchObj.query = query;
        if (season && season !== 'ALL')
            searchObj.season = season;
        if (year && year !== 'ALL')
            searchObj.year = parseInt(year);
        if (sortBy)
            searchObj.sortBy = sortBy;
        if (type && type !== 'ALL')
            searchObj.types = [type];
        if (genres)
            searchObj.genres = genres.split(',');
        if (excludeGenres)
            searchObj.excludeGenres = excludeGenres.split(',');
        if (tags)
            searchObj.tags = tags.split(',');
        if (studios)
            searchObj.studios = studios.split(',');
        if (excludeTags)
            searchObj.excludeTags = excludeTags.split(',');
        const variables = {
            search: searchObj,
            limit: parseInt(limit) || 14,
            page: parseInt(page) || 1,
            translationType: translation && translation !== 'ALL' ? translation : 'sub',
            countryOrigin: country && country !== 'ALL' ? country : 'ALL',
        };
        return this._fetchShows(variables);
    }
    async getPopular(timeframe) {
        let dateRange = 0;
        switch (timeframe) {
            case 'daily':
                dateRange = 1;
                break;
            case 'weekly':
                dateRange = 7;
                break;
            case 'monthly':
                dateRange = 30;
                break;
        }
        const variables = {
            type: 'anime',
            size: 10,
            page: 1,
            allowAdult: false,
            allowUnknown: false,
            dateRange,
        };
        const extensions = {
            persistedQuery: {
                version: 1,
                sha256Hash: '60f50b84bb545fa25ee7f7c8c0adbf8f5cea40f7b1ef8501cbbff70e38589489',
            },
        };
        try {
            const response = await axios_1.default.post(API_ENDPOINT, { variables, extensions }, {
                headers: { 'User-Agent': USER_AGENT, Referer: REFERER },
                timeout: 15000,
            });
            const responseData = response.data;
            if (responseData?.data?.tobeparsed) {
                responseData.data = this.decryptTobeparsed(responseData.data.tobeparsed);
            }
            if (responseData.errors && responseData.errors[0]?.message === 'PersistedQueryNotFound') {
                throw new Error('PersistedQueryNotFound');
            }
            const recommendations = responseData?.data?.queryPopular?.recommendations || [];
            return recommendations.map((rec) => {
                const card = rec.anyCard;
                return { ...card, thumbnail: this.deobfuscateUrl(card.thumbnail || '') };
            });
        }
        catch (error) {
            const err = error;
            if (err.message === 'PersistedQueryNotFound') {
                logger_1.default.info('Popular hash expired, falling back to full query');
                const fullQuery = `
          query ($type: VaildPopularTypeEnumType!, $size: Int!, $dateRange: Int, $page: Int, $allowAdult: Boolean, $allowUnknown: Boolean) {
            queryPopular(type: $type, size: $size, dateRange: $dateRange, page: $page, allowAdult: $allowAdult, allowUnknown: $allowUnknown) {
              recommendations {
                anyCard { _id name nativeName englishName thumbnail type availableEpisodesDetail isAdult rating }
              }
            }
          }`;
                const response = await axios_1.default.post(API_ENDPOINT, { query: fullQuery, variables }, {
                    headers: { 'User-Agent': USER_AGENT, Referer: REFERER },
                    timeout: 15000,
                });
                const responseData = response.data;
                if (responseData?.data?.tobeparsed) {
                    responseData.data = this.decryptTobeparsed(responseData.data.tobeparsed);
                }
                const recommendations = responseData?.data?.queryPopular?.recommendations || [];
                return recommendations.map((rec) => {
                    const card = rec.anyCard;
                    return { ...card, thumbnail: this.deobfuscateUrl(card.thumbnail || '') };
                });
            }
            throw error;
        }
    }
    async getSchedule(date) {
        const startOfDay = new Date(date);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setUTCHours(23, 59, 59, 999);
        const variables = {
            search: {
                dateRangeStart: Math.floor(startOfDay.getTime() / 1000),
                dateRangeEnd: Math.floor(endOfDay.getTime() / 1000),
                sortBy: 'Latest_Update',
            },
            limit: 50,
            page: 1,
            translationType: 'sub',
            countryOrigin: 'ALL',
        };
        return this._fetchShows(variables);
    }
    async getSeasonal(page) {
        const month = new Date().getMonth();
        const season = month >= 0 && month <= 2
            ? 'Winter'
            : month >= 3 && month <= 5
                ? 'Spring'
                : month >= 6 && month <= 8
                    ? 'Summer'
                    : 'Fall';
        const year = new Date().getFullYear();
        const variables = {
            search: { year, season, sortBy: 'Latest_Update', allowAdult: false },
            limit: 14,
            page,
            translationType: 'sub',
            countryOrigin: 'JP',
        };
        return this._fetchShows(variables);
    }
    async getLatestReleases() {
        const variables = {
            search: { sortBy: 'Latest_Update', allowAdult: false },
            limit: 14,
            page: 1,
            translationType: 'sub',
            countryOrigin: 'JP',
        };
        return this._fetchShows(variables);
    }
    async getShowMeta(showId) {
        const response = await axios_1.default.post(API_ENDPOINT, {
            query: `query($showId: String!) { show(_id: $showId) { _id, name, thumbnail, banner, description, nativeName, englishName, type, availableEpisodesDetail, score, isAdult, genres, malId } }`,
            variables: { showId },
        }, {
            headers: { 'User-Agent': USER_AGENT, Referer: REFERER },
            timeout: 15000,
        });
        const responseData = response.data;
        if (responseData?.data?.tobeparsed) {
            responseData.data = this.decryptTobeparsed(responseData.data.tobeparsed);
        }
        const show = responseData.data.show;
        if (show) {
            return {
                _id: show._id,
                name: show.name,
                thumbnail: this.deobfuscateUrl(show.thumbnail),
                bannerImage: show.banner ? this.deobfuscateUrl(show.banner) : undefined,
                description: show.description,
                nativeName: show.nativeName,
                englishName: show.englishName,
                type: show.type,
                availableEpisodesDetail: show.availableEpisodesDetail,
                score: show.score,
                isAdult: show.isAdult,
                genres: Array.isArray(show.genres)
                    ? show.genres.map((genre) => ({ name: genre }))
                    : undefined,
                malId: show.malId ?? undefined,
            };
        }
        return null;
    }
    async getEpisodes(showId, mode) {
        const cacheKey = `episodes-${showId}-${mode}`;
        const cachedData = this.cache.get(cacheKey);
        if (cachedData)
            return cachedData;
        const response = await axios_1.default.post(API_ENDPOINT, {
            query: `query($showId: String!) { show(_id: $showId) { availableEpisodesDetail, description } }`,
            variables: { showId },
        }, {
            headers: { 'User-Agent': USER_AGENT, Referer: REFERER },
            timeout: 15000,
        });
        const responseData = response.data;
        if (responseData?.data?.tobeparsed) {
            responseData.data = this.decryptTobeparsed(responseData.data.tobeparsed);
        }
        const showData = responseData.data.show;
        if (showData) {
            const episodeDetails = {
                episodes: showData.availableEpisodesDetail[mode] || [],
                description: showData.description,
            };
            this.cache.set(cacheKey, episodeDetails);
            return episodeDetails;
        }
        return null;
    }
    async getMalId(showId) {
        try {
            const response = await axios_1.default.post(API_ENDPOINT, {
                query: `query($showId: String!) { show(_id: $showId) { malId } }`,
                variables: { showId },
            }, {
                headers: { 'User-Agent': USER_AGENT, Referer: REFERER },
                timeout: 10000,
            });
            const responseData = response.data;
            if (responseData?.data?.tobeparsed) {
                responseData.data = this.decryptTobeparsed(responseData.data.tobeparsed);
            }
            const malId = responseData?.data?.show?.malId;
            return typeof malId === 'number' ? malId : malId ? Number(malId) : null;
        }
        catch (error) {
            logger_1.default.warn({ err: error, showId }, 'Failed to resolve MAL id from AllAnime');
            return null;
        }
    }
    async getSkipTimes(showId, episodeNumber) {
        try {
            const malId = await this.getMalId(showId);
            if (!malId)
                return { found: false, results: [] };
            const response = await axios_1.default.get(`https://api.aniskip.com/v1/skip-times/${malId}/${episodeNumber}?types=op&types=ed`, {
                headers: { 'User-Agent': USER_AGENT },
                timeout: 5000,
            });
            return response.data;
        }
        catch {
            return { found: false, results: [] };
        }
    }
    async getStreamUrls(showId, episodeNumber, mode) {
        const { data: axiosResponse } = await axios_1.default.post(API_ENDPOINT, {
            variables: { showId, translationType: mode, episodeString: episodeNumber },
            extensions: {
                persistedQuery: {
                    version: 1,
                    sha256Hash: 'd405d0edd690624b66baba3068e0edc3ac90f1597d898a1ec8db4e5c43c00fec',
                },
            },
        }, {
            headers: { 'User-Agent': USER_AGENT, Referer: REFERER },
            timeout: 15000,
        });
        const responseData = axiosResponse;
        if (responseData?.data?.tobeparsed) {
            responseData.data = this.decryptTobeparsed(responseData.data.tobeparsed);
        }
        const sourceUrls = responseData.data?.episode?.sourceUrls;
        if (!Array.isArray(sourceUrls))
            return null;
        const supportedSources = [
            'Yt-mp4',
            'S-mp4',
            'wixmp',
            'Default',
            'Fm-Hls',
            'Vg',
            'Sw',
            'Mp4',
            'Ok',
            'Uni',
        ];
        const filteredSources = sourceUrls
            .filter((s) => supportedSources.includes(s.sourceName))
            .sort((a, b) => (b.priority || 0) - (a.priority || 0));
        const processedSources = await Promise.all(filteredSources.map(async (source) => {
            try {
                let videoLinks = [];
                let subtitles = [];
                if (['Yt-mp4', 'S-mp4', 'wixmp', 'Default'].includes(source.sourceName)) {
                    let decryptedUrl = this.deobfuscateStreamUrl(source.sourceUrl);
                    if (decryptedUrl.includes('/clock') && !decryptedUrl.includes('.json')) {
                        decryptedUrl = decryptedUrl.replace('/clock', '/clock.json');
                    }
                    if (decryptedUrl.includes('/clock.json')) {
                        const finalUrl = decryptedUrl.startsWith('http')
                            ? decryptedUrl
                            : new URL(decryptedUrl, API_BASE_URL).href;
                        const resp = await axios_1.default.get(finalUrl, {
                            headers: { Referer: REFERER, 'User-Agent': USER_AGENT },
                            timeout: 10000,
                        });
                        const clockData = resp.data;
                        if (clockData && Array.isArray(clockData.links) && clockData.links.length > 0) {
                            const linkData = clockData.links[0];
                            if (linkData.hls) {
                                const hlsResp = await axios_1.default.get(linkData.link, {
                                    headers: linkData.headers || { Referer: REFERER },
                                    responseType: 'text',
                                    timeout: 10000,
                                });
                                const lines = hlsResp.data.split('\n');
                                for (let i = 0; i < lines.length; i++) {
                                    if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
                                        const resMatch = lines[i].match(/RESOLUTION=\d+x(\d+)/);
                                        videoLinks.push({
                                            resolutionStr: resMatch ? `${resMatch[1]}p` : 'Auto',
                                            link: new URL(lines[i + 1], linkData.link).href,
                                            hls: true,
                                            headers: linkData.headers || { Referer: REFERER },
                                        });
                                    }
                                }
                            }
                            else {
                                videoLinks = clockData.links
                                    .map((l) => ({
                                    resolutionStr: l.resolutionStr || 'Default',
                                    link: l.link && l.link.startsWith('/')
                                        ? `${API_BASE_URL}${l.link}`
                                        : l.link || '',
                                    hls: !!l.hls,
                                    headers: l.headers || { Referer: REFERER },
                                }))
                                    .filter((l) => l.link !== '');
                            }
                            if (Array.isArray(linkData.subtitles)) {
                                subtitles = linkData.subtitles.map((s) => ({
                                    language: s.lang || s.language || 'en',
                                    label: s.label || 'Subtitle',
                                    url: s.src && s.src.startsWith('/')
                                        ? `${API_BASE_URL}${s.src}`
                                        : s.src || s.url || '',
                                }));
                            }
                        }
                    }
                    if (videoLinks.length === 0 && decryptedUrl && !decryptedUrl.includes('/clock')) {
                        videoLinks.push({
                            resolutionStr: 'Default',
                            link: decryptedUrl,
                            hls: decryptedUrl.includes('.m3u8'),
                            headers: { Referer: REFERER },
                        });
                    }
                    if (videoLinks.length > 0) {
                        return {
                            sourceName: source.sourceName,
                            links: videoLinks,
                            subtitles,
                            type: 'player',
                        };
                    }
                }
                else if (source.sourceName === 'Mp4') {
                    const decryptedUrl = this.deobfuscateStreamUrl(source.sourceUrl);
                    try {
                        const { data: embedHtml } = await axios_1.default.get(decryptedUrl, {
                            headers: {
                                'User-Agent': USER_AGENT,
                                Referer: 'https://allanime.day/',
                            },
                            timeout: 10000,
                        });
                        const match = embedHtml.match(/src:\s*"(https:\/\/.*?\.mp4)"/);
                        if (match) {
                            return {
                                sourceName: source.sourceName,
                                links: [
                                    {
                                        resolutionStr: 'Default',
                                        link: match[1],
                                        hls: false,
                                        headers: { Referer: 'https://www.mp4upload.com/' },
                                    },
                                ],
                                type: 'player',
                            };
                        }
                    }
                    catch (e) {
                        // Ignore scrape errors
                    }
                    return {
                        sourceName: source.sourceName,
                        links: [{ resolutionStr: 'iframe', link: decryptedUrl, hls: false }],
                        type: 'iframe',
                    };
                }
                else {
                    return {
                        sourceName: source.sourceName,
                        links: [{ resolutionStr: 'iframe', link: source.sourceUrl, hls: false }],
                        type: source.type === 'iframe' ||
                            source.sourceName === 'Fm-Hls' ||
                            ['Vg', 'Sw', 'Ok', 'Uni'].includes(source.sourceName)
                            ? 'iframe'
                            : 'player',
                    };
                }
            }
            catch (e) {
                return null;
            }
            return null;
        }));
        const result = processedSources.filter((s) => s !== null);
        return result.length > 0 ? result : null;
    }
    async getShowDetails(showId) {
        const response = await axios_1.default.post(API_ENDPOINT, {
            query: `query($showId: String!) { show(_id: $showId) { name } }`,
            variables: { showId },
        }, {
            headers: { 'User-Agent': USER_AGENT, Referer: REFERER },
            timeout: 10000,
        });
        const responseData = response.data;
        if (responseData?.data?.tobeparsed) {
            responseData.data = this.decryptTobeparsed(responseData.data.tobeparsed);
        }
        const showName = responseData?.data?.show?.name;
        if (!showName)
            throw new Error('Show not found');
        const scheduleSearchUrl = `https://animeschedule.net/api/v3/anime?q=${encodeURIComponent(showName)}`;
        const scheduleResponse = await axios_1.default.get(scheduleSearchUrl, { timeout: 10000 });
        const firstResult = scheduleResponse.data?.anime?.[0];
        if (firstResult) {
            if (firstResult.status === 'Ongoing') {
                try {
                    const pageResponse = await axios_1.default.get(`https://animeschedule.net/anime/${firstResult.route}`, { timeout: 10000 });
                    const countdownMatch = pageResponse.data.match(/countdown-time" datetime="([^"]*)"/);
                    if (countdownMatch) {
                        firstResult.nextEpisodeAirDate = countdownMatch[1];
                        const airingTime = new Date(countdownMatch[1]).getTime();
                        const now = Date.now();
                        firstResult.nextAiring = {
                            episode: firstResult.currentEpisode ? firstResult.currentEpisode + 1 : 1,
                            timeUntilAiring: Math.floor((airingTime - now) / 1000),
                        };
                    }
                }
                catch (e) {
                    logger_1.default.warn({ err: e }, 'Failed to fetch schedule page');
                }
            }
            return firstResult;
        }
        throw new Error('Not Found on Schedule');
    }
    async getAllmangaDetails(showId) {
        const url = `https://allmanga.to/bangumi/${showId}`;
        const response = await axios_1.default.get(url, {
            headers: { 'User-Agent': USER_AGENT, Referer: REFERER },
        });
        const $ = cheerio.load(response.data);
        const details = {
            Rating: 'N/A',
            Season: 'N/A',
            Episodes: 'N/A',
            Date: 'N/A',
            'Original Broadcast': 'N/A',
        };
        $('.info-season').each((_i, elem) => {
            const label = $(elem).find('h4').text().trim();
            const value = $(elem).find('li').text().trim();
            if (Object.prototype.hasOwnProperty.call(details, label)) {
                details[label] = value;
            }
        });
        return details;
    }
}
exports.AllAnimeProvider = AllAnimeProvider;
