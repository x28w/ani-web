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

interface AnikotoListAnime {
  id: number
  title: string
  alternative?: string
  titles?: string
  mal_id?: string | number
  poster?: string
  type?: string
  year?: number
  episodes?: string | number
  description?: string
  status?: string
  score?: string | number
}

interface AnikotoRecentResponse {
  ok: boolean
  data: AnikotoListAnime[]
  pagination?: {
    page: number
    per_page: number
    total_pages: number
  }
}

interface AnikotoEpisode {
  number: number
  episode_embed_id?: string
  embed_url?: {
    sub?: string
    dub?: string
  }
}

interface AnikotoSeriesData {
  anime: AnikotoListAnime
  episodes: AnikotoEpisode[]
}

interface AnikotoSeriesResponse {
  ok: boolean
  data: AnikotoSeriesData
}

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; ani-web/1.0)',
  Accept: 'application/json',
}

export class MegaPlayProvider implements Provider {
  name = 'MegaPlay'
  private jikanBase = 'https://api.jikan.moe/v4'
  private anikotoBase = 'https://anikotoapi.site'
  private megaPlayStreamBase = 'https://megaplay.buzz/stream'
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

  private titleMatchesAnikoto(anime: AnikotoListAnime, query: string): boolean {
    const q = this.normalizeTitle(query)
    if (!q) return false
    const candidates = [anime.title, anime.alternative, anime.titles]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .map((value) => this.normalizeTitle(value))

    return candidates.some(
      (title) => title === q || title.startsWith(q) || title.includes(q) || q.includes(title)
    )
  }

  private async fetchAnikotoRecent(page: number, perPage = 100): Promise<AnikotoRecentResponse | null> {
    try {
      const url = `${this.anikotoBase}/recent-anime?page=${page}&per_page=${perPage}`
      const response = await fetch(url, { headers: FETCH_HEADERS })
      if (!response.ok) return null
      return (await response.json()) as AnikotoRecentResponse
    } catch (error) {
      logger.warn({ error, page }, 'Anikoto recent-anime fetch failed')
      return null
    }
  }

  private async resolveAnikotoSeriesByMalId(malId: string): Promise<number | null> {
    const cacheKey = `megaplay_anikoto_mal_${malId}`
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get<number>(cacheKey)
      return cached && cached > 0 ? cached : null
    }

    const maxPages = 25
    for (let page = 1; page <= maxPages; page++) {
      const recent = await this.fetchAnikotoRecent(page)
      if (!recent?.data?.length) break

      const hit = recent.data.find((anime) => String(anime.mal_id || '') === malId)
      if (hit) {
        this.cache.set(cacheKey, hit.id, 86400)
        return hit.id
      }

      if (!recent.pagination || page >= recent.pagination.total_pages) break
    }

    this.cache.set(cacheKey, 0, 3600)
    return null
  }

  private async findAnikotoByTitle(query: string): Promise<AnikotoListAnime | null> {
    const cacheKey = `megaplay_anikoto_title_${this.normalizeTitle(query)}`
    const cached = this.cache.get<AnikotoListAnime | null>(cacheKey)
    if (cached !== undefined) return cached

    for (let page = 1; page <= 12; page++) {
      const recent = await this.fetchAnikotoRecent(page)
      if (!recent?.data?.length) break

      const hit = recent.data.find((anime) => this.titleMatchesAnikoto(anime, query))
      if (hit) {
        this.cache.set(cacheKey, hit, 86400)
        return hit
      }

      if (!recent.pagination || page >= recent.pagination.total_pages) break
    }

    this.cache.set(cacheKey, null, 1800)
    return null
  }

  private async fetchAnikotoSeries(seriesId: string): Promise<AnikotoSeriesData | null> {
    if (!/^\d+$/.test(seriesId)) return null

    const cacheKey = `megaplay_anikoto_series_${seriesId}`
    const cached = this.cache.get<AnikotoSeriesData>(cacheKey)
    if (cached) return cached

    try {
      const response = await fetch(`${this.anikotoBase}/series/${seriesId}`, {
        headers: FETCH_HEADERS,
      })
      if (!response.ok) return null

      const payload = (await response.json()) as AnikotoSeriesResponse
      if (!payload.ok || !payload.data?.episodes?.length) return null

      this.cache.set(cacheKey, payload.data, 3600)
      if (payload.data.anime?.mal_id) {
        this.cache.set(`megaplay_anikoto_mal_${payload.data.anime.mal_id}`, payload.data.anime.id, 86400)
      }
      return payload.data
    } catch (error) {
      logger.warn({ error, seriesId }, 'Anikoto series fetch failed')
      return null
    }
  }

  private async resolveSeriesData(showId: string): Promise<AnikotoSeriesData | null> {
    const direct = await this.fetchAnikotoSeries(showId)
    if (direct) return direct

    if (!/^\d+$/.test(showId)) return null

    const anikotoId = await this.resolveAnikotoSeriesByMalId(showId)
    if (!anikotoId) return null

    return this.fetchAnikotoSeries(String(anikotoId))
  }

  private mapAnikotoToShow(anime: AnikotoListAnime): Show {
    return {
      _id: String(anime.id),
      id: String(anime.id),
      name: anime.title,
      englishName: anime.alternative || anime.title,
      thumbnail: anime.poster,
      type: anime.type,
      year: anime.year,
      episodeCount:
        typeof anime.episodes === 'number'
          ? anime.episodes
          : anime.episodes
            ? parseInt(String(anime.episodes), 10) || undefined
            : undefined,
      description: anime.description,
      status: anime.status,
      score: anime.score ? Number(anime.score) : undefined,
    }
  }

  async search(options: SearchOptions): Promise<Show[]> {
    try {
      const rawQuery = options.query || ''
      const query = rawQuery.replace(/[""]/g, '').replace(/[']/g, '').replace(/\s+/g, ' ').trim()
      if (!query) return []

      const anikotoHit = await this.findAnikotoByTitle(query)
      if (anikotoHit) {
        return [this.mapAnikotoToShow(anikotoHit)]
      }

      const url = `${this.jikanBase}/anime?q=${encodeURIComponent(query)}`
      const response = await fetch(url, { headers: FETCH_HEADERS })
      const data = (await response.json()) as JikanResponse

      if (!data.data || data.data.length === 0) return []

      const results = await Promise.all(
        data.data.slice(0, 8).map(async (anime) => {
          const malId = anime.mal_id.toString()
          const anikotoId = await this.resolveAnikotoSeriesByMalId(malId)
          return {
            _id: anikotoId ? String(anikotoId) : malId,
            id: anikotoId ? String(anikotoId) : malId,
            name: anime.title,
            englishName: anime.title_english || anime.title,
            thumbnail: anime.images?.jpg?.image_url,
            type: anime.type,
            year: anime.year,
            episodeCount: anime.episodes,
          } satisfies Show
        })
      )

      if (query && results.length > 0) {
        const best = this.bestMatch(data.data, query)
        const bestMalId = best.mal_id.toString()
        const bestIndex = results.findIndex(
          (item) => item._id === bestMalId || item.name === best.title
        )
        if (bestIndex > 0) {
          const [bestItem] = results.splice(bestIndex, 1)
          results.unshift(bestItem)
        }
      }

      return results
    } catch (error) {
      logger.error({ error }, 'MegaPlay search failed')
      return []
    }
  }

  async getEpisodes(showId: string, _mode: 'sub' | 'dub'): Promise<EpisodeDetails | null> {
    try {
      const series = await this.resolveSeriesData(showId)
      if (series?.episodes?.length) {
        return {
          episodes: series.episodes.map((episode) => String(episode.number)),
          description: series.anime?.description || '',
        }
      }

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
    const targetEpisode = episodeNumber === '0' ? '1' : episodeNumber
    const series = await this.resolveSeriesData(showId)

    if (series?.episodes?.length) {
      const episode =
        series.episodes.find((item) => String(item.number) === targetEpisode) ||
        series.episodes[parseInt(targetEpisode, 10) - 1]

      if (episode) {
        const embedUrl = episode.embed_url?.[mode]
        const streamUrl =
          embedUrl ||
          (episode.episode_embed_id
            ? `${this.megaPlayStreamBase}/s-2/${episode.episode_embed_id}/${mode}`
            : null)

        if (streamUrl) {
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
              actualEpisodeNumber: String(episode.number),
            },
          ]
        }
      }
    }

    const malId = series?.anime?.mal_id ? String(series.anime.mal_id) : showId
    if (!/^\d+$/.test(malId)) return null

    const streamUrl = `${this.megaPlayStreamBase}/mal/${malId}/${targetEpisode}/${mode}`
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
      const series = await this.resolveSeriesData(showId)
      if (series?.anime) return this.mapAnikotoToShow(series.anime)

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
      const recent = await this.fetchAnikotoRecent(page || 1, size || 10)
      if (recent?.data?.length) {
        return recent.data.map((anime) => this.mapAnikotoToShow(anime))
      }

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
      const recent = await this.fetchAnikotoRecent(page || 1, size || 10)
      if (recent?.data?.length) {
        return recent.data.map((anime) => this.mapAnikotoToShow(anime))
      }

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

      const series = await this.resolveSeriesData(showId)
      if (series?.anime?.status) return { status: series.anime.status }

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
