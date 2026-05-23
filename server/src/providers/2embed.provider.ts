import NodeCache from 'node-cache'
import logger from '../logger'
import {
  AllmangaDetails,
  EpisodeDetails,
  Provider,
  SearchOptions,
  Show,
  ShowDetails,
  SkipIntervals,
  VideoSource,
} from './provider.interface'

interface ImdbSuggestion {
  id?: string
  l?: string
  qid?: string
  y?: number
  i?: { imageUrl?: string }
}

const EMBED_BASE_URL = 'https://hnembed.cc'
const VIDAPI_BASE_URL = 'https://vaplayer.ru'
const IMDB_SUGGEST_URL = 'https://v3.sg.media-imdb.com/suggestion/x'
const TV_TYPES = new Set(['tvSeries', 'tvMiniSeries'])

interface ParsedTitle {
  title: string
  season: number
  hasExplicitSeason: boolean
}

function toValidSeason(value: unknown): number | undefined {
  const season = Number(value)
  return Number.isInteger(season) && season >= 1 && season <= 99 ? season : undefined
}

function extractTitleAndSeason(title: string): ParsedTitle {
  const seasonMatch =
    title.match(/\bseason\s*(\d+)\b/i) ||
    title.match(/\b(\d+)(?:st|nd|rd|th)\s+season\b/i) ||
    title.match(/\bs(\d+)\b/i)
  const season = toValidSeason(seasonMatch?.[1]) || 1
  const cleanTitle = seasonMatch
    ? title
        .replace(seasonMatch[0], '')
        .replace(/\s*[-:]\s*$/, '')
        .trim()
    : title.trim()

  return {
    title: cleanTitle || title.trim(),
    season,
    hasExplicitSeason: !!seasonMatch,
  }
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function scoreTitleMatch(queryTitles: string[], title: string): number {
  const candidate = normalizeTitle(title)
  if (!candidate) return -1

  return Math.max(
    ...queryTitles.map((queryTitle) => {
      const query = normalizeTitle(queryTitle)
      if (!query) return -1
      if (candidate === query) return 100
      if (candidate.startsWith(query) || query.startsWith(candidate)) return 70

      const queryTerms = new Set(query.split(' ').filter((term) => term.length > 2))
      const candidateTerms = new Set(candidate.split(' ').filter((term) => term.length > 2))
      const overlap = [...queryTerms].filter((term) => candidateTerms.has(term)).length
      return overlap * 10 - Math.abs(queryTerms.size - candidateTerms.size)
    })
  )
}

function encodeProviderId(imdbId: string, season: number): string {
  return `${imdbId}::s${season}`
}

function decodeProviderId(providerId: string): { imdbId: string; season: number } | null {
  const match = providerId.match(/^(tt\d+)(?:::s(\d+))?$/i)
  if (!match) return null
  return {
    imdbId: match[1],
    season: Math.max(1, Number(match[2]) || 1),
  }
}

function createIframeSource(sourceName: string, link: string): VideoSource {
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
  }
}

export class TwoEmbedProvider implements Provider {
  name = '2Embed'

  constructor(private cache: NodeCache) {}

  async search(options: SearchOptions): Promise<Show[]> {
    const rawTitle = String(options.query || '').trim()
    if (!rawTitle) return []

    const rawTitles = [rawTitle, ...String(options.aliases || '').split('|')]
    const parsedTitleMap = new Map<string, ParsedTitle>()
    rawTitles
      .map((title) => extractTitleAndSeason(title.trim()))
      .filter(({ title }) => !!title)
      .forEach((parsed) => {
        const key = parsed.title.toLowerCase()
        const existing = parsedTitleMap.get(key)
        if (!existing || (!existing.hasExplicitSeason && parsed.hasExplicitSeason)) {
          parsedTitleMap.set(key, parsed)
        }
      })
    const parsedTitles = Array.from(parsedTitleMap.values())
    const queryTitles = parsedTitles.map(({ title }) => title).slice(0, 3)
    const season =
      toValidSeason(options.season) ||
      parsedTitles.find(({ hasExplicitSeason }) => hasExplicitSeason)?.season ||
      1
    const cacheKey = `2embed-search-${queryTitles.map((title) => title.toLowerCase()).join('|')}-${season}`
    const cached = this.cache.get<Show[]>(cacheKey)
    if (cached) return cached

    try {
      const suggestions = await Promise.all(
        queryTitles.map(async (title) => {
          const response = await fetch(`${IMDB_SUGGEST_URL}/${encodeURIComponent(title)}.json`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
          })
          if (!response.ok) return []
          const data = (await response.json()) as { d?: ImdbSuggestion[] }
          return data.d || []
        })
      )
      const matches = Array.from(
        new Map(
          suggestions
            .flat()
            .filter((entry) => !!entry.id && !!entry.l && TV_TYPES.has(String(entry.qid)))
            .map((entry) => [entry.id, entry])
        ).values()
      )
        .sort(
          (left, right) =>
            scoreTitleMatch(queryTitles, String(right.l)) -
            scoreTitleMatch(queryTitles, String(left.l))
        )
        .filter((entry) => !!entry.id && !!entry.l && TV_TYPES.has(String(entry.qid)))
        .slice(0, 5)
        .map((entry) => {
          const id = encodeProviderId(String(entry.id), season)
          return {
            _id: id,
            id,
            name: String(entry.l),
            englishName: String(entry.l),
            thumbnail: entry.i?.imageUrl || '',
            type: 'TV',
          }
        })

      this.cache.set(cacheKey, matches, 3600)
      return matches
    } catch (error) {
      logger.warn({ err: error, titles: queryTitles }, '2Embed IMDb title lookup failed')
      return []
    }
  }

  async getStreamUrls(showId: string, episodeNumber: string): Promise<VideoSource[] | null> {
    const id = decodeProviderId(showId)
    const episode = Number(episodeNumber)
    if (!id || !Number.isInteger(episode) || episode < 1) return null

    const hnEmbedLink = `${EMBED_BASE_URL}/embed/tv/${id.imdbId}/${id.season}/${episode}?autoplay=1`
    const vidApiLink = `${VIDAPI_BASE_URL}/embed/tv/${id.imdbId}/${id.season}/${episode}`
    const sources: VideoSource[] = []

    if (await this.hasHnEmbedEpisode(hnEmbedLink)) {
      sources.push(createIframeSource('2Embed', hnEmbedLink))
    }

    sources.push(createIframeSource('VidAPI Backup', vidApiLink))
    return sources
  }

  private async hasHnEmbedEpisode(url: string): Promise<boolean> {
    const cacheKey = `2embed-episode-${url}`
    const cached = this.cache.get<boolean>(cacheKey)
    if (cached !== undefined) return cached

    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      const html = await response.text()
      const available =
        response.ok &&
        !html.includes('<title>Error 404</title>') &&
        !html.includes('API call failed with HTTP code')
      this.cache.set(cacheKey, available, available ? 3600 : 300)
      return available
    } catch (error) {
      logger.warn({ err: error, url }, '2Embed episode availability check failed')
      return false
    }
  }

  async getShowMeta(showId: string): Promise<Partial<Show> | null> {
    const id = decodeProviderId(showId)
    if (!id) return null
    return { _id: showId, id: showId, name: id.imdbId }
  }

  async getEpisodes(): Promise<EpisodeDetails | null> {
    return null
  }

  async getPopular(): Promise<Show[]> {
    return []
  }

  async getSchedule(): Promise<Show[]> {
    return []
  }

  async getSeasonal(): Promise<Show[]> {
    return []
  }

  async getLatestReleases(): Promise<Show[]> {
    return []
  }

  async getSkipTimes(): Promise<SkipIntervals> {
    return { found: false, results: [] }
  }

  async getShowDetails(): Promise<ShowDetails> {
    return { status: 'Unknown' }
  }

  async getAllmangaDetails(): Promise<AllmangaDetails> {
    return {
      Rating: 'N/A',
      Season: 'N/A',
      Episodes: 'N/A',
      Date: 'N/A',
      'Original Broadcast': 'N/A',
    }
  }
}
