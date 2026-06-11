"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnimePaheProvider = void 0;
const ANILIST_API = 'https://graphql.anilist.co';
const VIDNEST_BASE = 'https://vidnest.fun';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SEARCH_QUERY = `
  query ($search: String, $page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      media(search: $search, type: ANIME) {
        id
        title { romaji english native }
        coverImage { large }
        format
        episodes
        description
        status
        genres
        averageScore
        startDate { year }
      }
    }
  }
`;
const MEDIA_QUERY = `
  query ($id: Int) {
    Media(id: $id) {
      id
      title { romaji english native }
      coverImage { large }
      format
      episodes
      description
      status
      genres
      averageScore
      startDate { year }
    }
  }
`;
function stripDiacritics(s) {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
class AnimePaheProvider {
    name = 'AnimePahe';
    cache;
    constructor(cache) {
        this.cache = cache;
    }
    async anilistFetch(query, variables, retries = 2) {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const response = await fetch(ANILIST_API, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': USER_AGENT,
                    },
                    body: JSON.stringify({ query, variables }),
                });
                if (response.status === 429) {
                    const retryAfter = response.headers.get('Retry-After');
                    const delay = retryAfter ? parseInt(retryAfter) * 1000 : 1000 * (attempt + 1);
                    if (attempt < retries) {
                        await new Promise((r) => setTimeout(r, delay));
                        continue;
                    }
                    return null;
                }
                if (!response.ok)
                    return null;
                return (await response.json());
            }
            catch {
                if (attempt < retries) {
                    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
                    continue;
                }
                return null;
            }
        }
        return null;
    }
    pickTitle(media) {
        return stripDiacritics(media.title?.english || media.title?.romaji || media.title?.native || '');
    }
    mediaToShow(media) {
        const name = this.pickTitle(media);
        return {
            _id: media.id.toString(),
            id: media.id.toString(),
            name,
            englishName: name,
            nativeName: media.title?.native,
            thumbnail: media.coverImage?.large,
            type: media.format,
            year: media.startDate?.year,
            episodeCount: media.episodes,
            description: media.description?.replace(/<[^>]*>/g, '') || '',
            status: media.status,
            genres: media.genres?.map((g) => ({ name: g })),
            score: media.averageScore ? media.averageScore / 10 : undefined,
        };
    }
    async search(options) {
        const query = options.query || '';
        if (!query)
            return [];
        const data = await this.anilistFetch(SEARCH_QUERY, {
            search: query,
            page: 1,
            perPage: 14,
        });
        const media = data?.data?.Page?.media;
        if (!media || media.length === 0)
            return [];
        return media.map((m) => this.mediaToShow(m));
    }
    async getEpisodes(showId, _mode) {
        const id = parseInt(showId);
        if (isNaN(id))
            return null;
        const cacheKey = `animepahe_eps_${showId}`;
        const cached = this.cache.get(cacheKey);
        if (cached)
            return cached;
        const data = await this.anilistFetch(MEDIA_QUERY, { id });
        const media = data?.data?.Media;
        if (!media)
            return null;
        const count = media.episodes || 12;
        const episodes = Array.from({ length: count }, (_, i) => (i + 1).toString());
        const result = {
            episodes,
            description: media.description?.replace(/<[^>]*>/g, '') || '',
        };
        this.cache.set(cacheKey, result, 86400);
        return result;
    }
    async getStreamUrls(showId, episodeNumber, mode) {
        const id = parseInt(showId);
        if (isNaN(id))
            return null;
        let targetEpisode = episodeNumber;
        if (episodeNumber === '0')
            targetEpisode = '1';
        const streamUrl = `${VIDNEST_BASE}/animepahe/${showId}/${targetEpisode}/${mode}`;
        return [
            {
                sourceName: `VidNest (${mode.toUpperCase()})`,
                links: [
                    {
                        resolutionStr: 'Auto',
                        link: streamUrl,
                        hls: false,
                    },
                ],
                type: 'iframe',
                actualEpisodeNumber: targetEpisode,
            },
        ];
    }
    async getShowMeta(showId) {
        const id = parseInt(showId);
        if (isNaN(id))
            return null;
        const data = await this.anilistFetch(MEDIA_QUERY, { id });
        const media = data?.data?.Media;
        if (!media)
            return null;
        return this.mediaToShow(media);
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
