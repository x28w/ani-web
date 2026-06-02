import NodeCache from 'node-cache'
import {
  Provider,
  Show,
  VideoSource,
  EpisodeDetails,
  SkipIntervals,
  SearchOptions,
  ShowDetails,
  AllmangaDetails,
} from './provider.interface'
import logger from '../logger'

interface JikanAnime {
  mal_id: number
  title: string
  title_english?: string
  images?: {
    jpg?: {
      image_url?: string
    }
  }
  type?: string
  year?: number
  episodes?: number
  synopsis?: string
  status?: string
  genres?: { name: string }[]
  score?: number
}

interface JikanResponse {
  data: JikanAnime[]
}

interface JikanSingleResponse {
  data: JikanAnime
}

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
}

export class MegaPlayProvider implements Provider {
  name = 'MegaPlay'
  private jikanBase = 'https://api.jikan.moe/v4'
  private megaPlayBase = 'https://megaplay.buzz/stream/mal'
  private cache: NodeCache

  constructor(cache: NodeCache) {
    this.cache = cache
  }

  private normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private bestMatch(results: JikanAnime[], query: string): JikanAnime {
    const q = this.normalizeTitle(query)
    let best = results[0]
    let bestScore = -1

    for (const anime of results) {
      const title = this.normalizeTitle(anime.title)
      const englishTitle = anime.title_english ? this.normalizeTitle(anime.title_english) : ''
      let score = -1

      if (title === q || englishTitle === q) {
        score = 3
      } else if (title.startsWith(q) || englishTitle.startsWith(q)) {
        score = 2
      } else if (title.includes(q) || englishTitle.includes(q)) {
        score = 1
      }

      if (score > bestScore) {
        bestScore = score
        best = anime
        if (score === 3) break
      }
    }

    return best
  }

  async search(options: SearchOptions): Promise<Show[]> {
    try {
      const rawQuery = options.query || ''
      const query = rawQuery.replace(/[""]/g, '').replace(/[']/g, '').replace(/\s+/g, ' ').trim()
      const url = `${this.jikanBase}/anime?q=${encodeURIComponent(query)}`

      const response = await fetch(url, { headers: FETCH_HEADERS })
      const data = (await response.json()) as JikanResponse

      if (!data.data || data.data.length === 0) return []

      const results = data.data.map((anime) => ({
        _id: anime.mal_id.toString(),
        id: anime.mal_id.toString(),
        name: anime.title,
        englishName: anime.title_english || anime.title,
        thumbnail: anime.images?.jpg?.image_url,
        type: anime.type,
        year: anime.year,
        episodeCount: anime.episodes,
      }))

      if (query && results.length > 0) {
        const best = this.bestMatch(data.data, query)
        const bestIndex = data.data.findIndex((a) => a.mal_id === best.mal_id)
        if (bestIndex > 0) {
          const [bestItem] = results.splice(bestIndex, 1)
          results.unshift(bestItem)
        }
      }

      return results
    } catch (error) {
      logger.error({ error }, 'MegaPlay (Jikan) search failed')
      return []
    }
  }

  async getEpisodes(showId: string, _mode: 'sub' | 'dub'): Promise<EpisodeDetails | null> {
    try {
      if (!/^\d+$/.test(showId)) return null

      const cacheKey = `megaplay_eps_${showId}`
      const cached = this.cache.get<EpisodeDetails>(cacheKey)
      if (cached) return cached

      const url = `${this.jikanBase}/anime/${showId}`
      const response = await fetch(url, { headers: FETCH_HEADERS })

      if (!response.ok) return null

      const data = (await response.json()) as JikanSingleResponse

      if (!data.data) return null

      const episodeCount = data.data.episodes || 0
      let count = episodeCount
      if (count === 0) {
        if (data.data.status === 'Currently Airing' || data.data.status === 'Finished Airing') {
          count = 12
        }
      }

      const episodes = Array.from({ length: count }, (_, i) => (i + 1).toString())

      const result: EpisodeDetails = {
        episodes,
        description: data.data.synopsis || '',
      }

      this.cache.set(cacheKey, result, 86400)
      return result
    } catch (error) {
      logger.error({ error, showId }, 'MegaPlay getEpisodes failed')
      return null
    }
  }

  async getStreamUrls(
    showId: string,
    episodeNumber: string,
    mode: 'sub' | 'dub'
  ): Promise<VideoSource[] | null> {
    if (!/^\d+$/.test(showId)) return null

    let targetEpisode = episodeNumber
    if (episodeNumber === '0') {
      targetEpisode = '1'
    }

    const streamUrl = `/api/megaplay-embed?malId=${showId}&episode=${targetEpisode}&mode=${mode}`

    return [
      {
        sourceName: `MegaPlay (${mode.toUpperCase()})`,
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
    ]
  }

  async getShowMeta(showId: string): Promise<Partial<Show> | null> {
    try {
      if (!/^\d+$/.test(showId)) return null

      const url = `${this.jikanBase}/anime/${showId}`
      const response = await fetch(url, { headers: FETCH_HEADERS })
      const data = (await response.json()) as JikanSingleResponse

      if (!data.data) return null

      const anime = data.data
      return {
        _id: anime.mal_id.toString(),
        name: anime.title,
        englishName: anime.title_english,
        thumbnail: anime.images?.jpg?.image_url,
        description: anime.synopsis,
        type: anime.type,
        year: anime.year,
        episodeCount: anime.episodes,
        status: anime.status,
        genres: anime.genres?.map((g) => ({ name: g.name })),
        score: anime.score,
      }
    } catch (error) {
      logger.error({ error, showId }, 'MegaPlay getShowMeta failed')
      return null
    }
  }

  async getPopular(
    _timeframe: 'daily' | 'weekly' | 'monthly' | 'all',
    page?: number,
    size?: number
  ): Promise<Show[]> {
    try {
      const url = `${this.jikanBase}/top/anime?page=${page || 1}&limit=${size || 10}`
      const response = await fetch(url, { headers: FETCH_HEADERS })
      const data = (await response.json()) as JikanResponse

      if (!data.data) return []

      return data.data.map((anime) => ({
        _id: anime.mal_id.toString(),
        id: anime.mal_id.toString(),
        name: anime.title,
        englishName: anime.title_english || anime.title,
        thumbnail: anime.images?.jpg?.image_url,
        type: anime.type,
        year: anime.year,
        episodeCount: anime.episodes,
      }))
    } catch {
      return []
    }
  }

  async getSchedule(date: Date): Promise<Show[]> {
    try {
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
      const day = days[date.getDay()]
      const url = `${this.jikanBase}/schedules?filter=${day}`
      const response = await fetch(url, { headers: FETCH_HEADERS })
      const data = (await response.json()) as JikanResponse

      if (!data.data) return []

      return data.data.map((anime) => ({
        _id: anime.mal_id.toString(),
        id: anime.mal_id.toString(),
        name: anime.title,
        englishName: anime.title_english || anime.title,
        thumbnail: anime.images?.jpg?.image_url,
        type: anime.type,
        year: anime.year,
        episodeCount: anime.episodes,
      }))
    } catch {
      return []
    }
  }

  async getSeasonal(page: number): Promise<Show[]> {
    try {
      const url = `${this.jikanBase}/seasons/now?page=${page}`
      const response = await fetch(url, { headers: FETCH_HEADERS })
      const data = (await response.json()) as JikanResponse

      if (!data.data) return []

      return data.data.map((anime) => ({
        _id: anime.mal_id.toString(),
        id: anime.mal_id.toString(),
        name: anime.title,
        englishName: anime.title_english || anime.title,
        thumbnail: anime.images?.jpg?.image_url,
        type: anime.type,
        year: anime.year,
        episodeCount: anime.episodes,
      }))
    } catch {
      return []
    }
  }

  async getLatestReleases(page?: number, size?: number): Promise<Show[]> {
    try {
      const url = `${this.jikanBase}/top/anime?filter=airing&page=${page || 1}&limit=${size || 10}`
      const response = await fetch(url, { headers: FETCH_HEADERS })
      const data = (await response.json()) as JikanResponse

      if (!data.data) return []

      return data.data.map((anime) => ({
        _id: anime.mal_id.toString(),
        id: anime.mal_id.toString(),
        name: anime.title,
        englishName: anime.title_english || anime.title,
        thumbnail: anime.images?.jpg?.image_url,
        type: anime.type,
        year: anime.year,
        episodeCount: anime.episodes,
      }))
    } catch {
      return []
    }
  }

  async getSkipTimes(_showId: string, _episodeNumber: string): Promise<SkipIntervals> {
    return { found: false, results: [] }
  }

  async getShowDetails(showId: string): Promise<ShowDetails> {
    try {
      if (!/^\d+$/.test(showId)) return { status: '' }

      const response = await fetch(`${this.jikanBase}/anime/${showId}`, { headers: FETCH_HEADERS })
      const data = (await response.json()) as JikanSingleResponse
      return { status: data.data?.status || '' }
    } catch {
      return { status: '' }
    }
  }

  async getAllmangaDetails(_showId: string): Promise<AllmangaDetails> {
    return {
      Rating: '',
      Season: '',
      Episodes: '',
      Date: '',
      'Original Broadcast': '',
    }
  }
}
