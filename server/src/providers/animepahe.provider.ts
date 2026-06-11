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

interface AniListMedia {
  id: number
  title?: {
    romaji?: string
    english?: string
    native?: string
  }
  coverImage?: {
    large?: string
  }
  format?: string
  episodes?: number
  description?: string
  status?: string
  genres?: string[]
  averageScore?: number
  startDate?: { year?: number }
}

interface AniListPageResponse {
  data?: {
    Page?: {
      media?: AniListMedia[]
    }
  }
}

interface AniListMediaResponse {
  data?: {
    Media?: AniListMedia
  }
}

const ANILIST_API = 'https://graphql.anilist.co'
const VIDNEST_BASE = 'https://vidnest.fun'

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

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
`

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
`

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export class AnimePaheProvider implements Provider {
  name = 'AnimePahe'
  private cache: NodeCache

  constructor(cache: NodeCache) {
    this.cache = cache
  }

  private async anilistFetch<T>(
    query: string,
    variables: Record<string, unknown>,
    retries = 2
  ): Promise<T | null> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(ANILIST_API, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': USER_AGENT,
          },
          body: JSON.stringify({ query, variables }),
        })

        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After')
          const delay = retryAfter ? parseInt(retryAfter) * 1000 : 1000 * (attempt + 1)
          if (attempt < retries) {
            await new Promise((r) => setTimeout(r, delay))
            continue
          }
          return null
        }

        if (!response.ok) return null
        return (await response.json()) as T
      } catch {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
          continue
        }
        return null
      }
    }
    return null
  }

  private pickTitle(media: AniListMedia): string {
    return stripDiacritics(
      media.title?.english || media.title?.romaji || media.title?.native || ''
    )
  }

  private mediaToShow(media: AniListMedia): Show {
    const name = this.pickTitle(media)
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
    }
  }

  async search(options: SearchOptions): Promise<Show[]> {
    const query = options.query || ''
    if (!query) return []

    const data = await this.anilistFetch<AniListPageResponse>(SEARCH_QUERY, {
      search: query,
      page: 1,
      perPage: 14,
    })

    const media = data?.data?.Page?.media
    if (!media || media.length === 0) return []

    return media.map((m) => this.mediaToShow(m))
  }

  async getEpisodes(showId: string, _mode: 'sub' | 'dub'): Promise<EpisodeDetails | null> {
    const id = parseInt(showId)
    if (isNaN(id)) return null

    const cacheKey = `animepahe_eps_${showId}`
    const cached = this.cache.get<EpisodeDetails>(cacheKey)
    if (cached) return cached

    const data = await this.anilistFetch<AniListMediaResponse>(MEDIA_QUERY, { id })
    const media = data?.data?.Media
    if (!media) return null

    const count = media.episodes || 12
    const episodes = Array.from({ length: count }, (_, i) => (i + 1).toString())

    const result: EpisodeDetails = {
      episodes,
      description: media.description?.replace(/<[^>]*>/g, '') || '',
    }

    this.cache.set(cacheKey, result, 86400)
    return result
  }

  async getStreamUrls(
    showId: string,
    episodeNumber: string,
    mode: 'sub' | 'dub'
  ): Promise<VideoSource[] | null> {
    const id = parseInt(showId)
    if (isNaN(id)) return null

    let targetEpisode = episodeNumber
    if (episodeNumber === '0') targetEpisode = '1'

    const streamUrl = `${VIDNEST_BASE}/animepahe/${showId}/${targetEpisode}/${mode}`

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
    ]
  }

  async getShowMeta(showId: string): Promise<Partial<Show> | null> {
    const id = parseInt(showId)
    if (isNaN(id)) return null

    const data = await this.anilistFetch<AniListMediaResponse>(MEDIA_QUERY, { id })
    const media = data?.data?.Media
    if (!media) return null

    return this.mediaToShow(media)
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
