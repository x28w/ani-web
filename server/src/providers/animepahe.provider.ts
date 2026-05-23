import * as cheerio from 'cheerio'
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

interface AnimePaheSearchResult {
  session: string
  title: string
  name?: string
  poster?: string
  image?: string
  type?: string
  year?: number
}

interface AnimePaheEpisode {
  episode?: number
  number?: number
  session?: string
  release_session?: string
}

interface AnimePaheVideoSource {
  url: string
  quality: string | null
  fansub: string | null
  audio: string | null
}

function encodePackerToken(value: number, radix: number): string {
  if (value < radix) {
    return value > 35 ? String.fromCharCode(value + 29) : value.toString(36)
  }
  return `${encodePackerToken(Math.floor(value / radix), radix)}${encodePackerToken(value % radix, radix)}`
}

function unpackPackerScripts(html: string): string[] {
  const packedScriptPattern =
    /\}\('((?:\\.|[^'])*)',(\d+),(\d+),'((?:\\.|[^'])*)'\.split\('\|'\)/g
  const scripts: string[] = []
  let match: RegExpExecArray | null

  while ((match = packedScriptPattern.exec(html))) {
    const payload = match[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\')
    const radix = Number(match[2])
    const count = Number(match[3])
    const dictionary = match[4].split('|')
    const replacements = new Map<string, string>()

    for (let index = 0; index < count; index++) {
      const token = encodePackerToken(index, radix)
      replacements.set(token, dictionary[index] || token)
    }

    scripts.push(payload.replace(/\b\w+\b/g, (token) => replacements.get(token) || token))
  }

  return scripts
}

function extractHlsUrl(html: string): string | null {
  const directMatch = html.match(/https?:\/\/[^'"\s]+\.m3u8[^'"\s]*/i)
  if (directMatch) return directMatch[0]

  for (const script of unpackPackerScripts(html)) {
    const unpackedMatch = script.match(/https?:\/\/[^'"\s]+\.m3u8[^'"\s]*/i)
    if (unpackedMatch) return unpackedMatch[0]
  }

  return null
}

export class AnimePaheProvider implements Provider {
  name = 'AnimePahe'
  private base = 'https://animepahe.pw'
  private apiBase = 'https://animepahe.pw/api'

  private cache: NodeCache

  constructor(cache: NodeCache) {
    this.cache = cache
  }

  private getHeaders(isApi: boolean = false): Record<string, string> {
    const cookies = {
      __ddg1_: '5H0114JE1p0wQHdJiV2O',
      __ddg2_: 'FxnuwLkvPnXSQtPE',
      __ddg8_: 'j55RhixQcxVPfvqt',
      __ddg9_: '51.158.195.12',
      __ddg10_: '1769167572',
      __ddgid_: 'ExAWs3AJTzpAKb8m',
      __ddgmark_: 'slbgrX6Jj2jTxuo2',
    }

    const cookieString = Object.entries(cookies)
      .map(([key, val]) => `${key}=${val}`)
      .join('; ')

    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://animepahe.pw/',
      Origin: 'https://animepahe.pw',
      Cookie: cookieString,
    }

    if (isApi) {
      headers['X-Requested-With'] = 'XMLHttpRequest'
      headers['Accept'] = 'application/json, text/javascript, */*; q=0.01'
    }

    return headers
  }

  private async get(url: string, isApi: boolean = false): Promise<string> {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(isApi),
      })

      const text = await response.text()

      if (!response.ok) {
        if (response.status === 403 || text.includes('DDoS-Guard')) {
          logger.error(
            'DDoS-Guard blocked the request! Your ANIMEPAHE_COOKIES in .env are likely expired.'
          )
        }
        throw new Error(`HTTP ${response.status}`)
      }

      return text
    } catch (error) {
      const err = error as Error
      logger.error({ url, err: err.message }, 'AnimePahe Fetch failed')
      throw error
    }
  }

  private async getJson(url: string): Promise<Record<string, unknown> | unknown[]> {
    const data = await this.get(url, true)
    try {
      return JSON.parse(data)
    } catch {
      logger.error({ url }, 'Failed to parse JSON (likely blocked by bot protection)')
      return {}
    }
  }

  async search(options: SearchOptions): Promise<Show[]> {
    try {
      const query = options.query || ''
      const url = `${this.apiBase}?m=search&q=${encodeURIComponent(query)}`
      const data = (await this.getJson(url)) as Record<string, unknown>

      const animeRows = (data.data || data.results || data.items || []) as AnimePaheSearchResult[]
      return animeRows.map((a) => ({
        _id: a.session,
        id: a.session,
        name: a.title || a.name || '',
        englishName: a.title,
        thumbnail: a.poster || a.image,
        type: a.type,
        year: a.year,
        session: a.session,
      }))
    } catch {
      return []
    }
  }

  async getEpisodes(showId: string): Promise<EpisodeDetails | null> {
    try {
      const firstPageUrl = `${this.apiBase}?m=release&id=${showId}&sort=episode_asc&page=1`
      const firstPageData = (await this.getJson(firstPageUrl)) as Record<string, unknown>

      let episodes = (firstPageData.data || firstPageData.results || []) as AnimePaheEpisode[]
      const lastPage = Number(firstPageData.last_page || firstPageData.lastPage || 1)

      for (let p = 2; p <= lastPage; p++) {
        const pageUrl = `${this.apiBase}?m=release&id=${showId}&sort=episode_asc&page=${p}`
        const pageData = (await this.getJson(pageUrl)) as Record<string, unknown>
        episodes = episodes.concat((pageData.data || pageData.results || []) as AnimePaheEpisode[])
      }

      const episodeMap: Record<string, string> = {}
      const episodeNumbers: string[] = []

      episodes.forEach((ep) => {
        const epNum = (ep.episode ?? ep.number ?? '').toString()
        if (epNum) {
          episodeMap[epNum] = ep.session || ep.release_session || ''
          episodeNumbers.push(epNum)
        }
      })

      this.cache.set(`animepahe_epmap_${showId}`, episodeMap, 86400)

      return {
        episodes: episodeNumbers.sort((a, b) => Number(a) - Number(b)),
        description: '',
      }
    } catch {
      return null
    }
  }

  private async getEpisodeSession(showId: string, episodeNumber: string): Promise<string | null> {
    const cacheKey = `animepahe_epmap_${showId}`
    let cachedMap = this.cache.get<Record<string, string>>(cacheKey)

    if (!cachedMap) {
      await this.getEpisodes(showId)
      cachedMap = this.cache.get<Record<string, string>>(cacheKey)
    }

    if (!cachedMap) return null

    if (cachedMap[episodeNumber]) {
      return cachedMap[episodeNumber]
    }

    const requestedNum = parseFloat(episodeNumber)
    const keys = Object.keys(cachedMap)
    for (const key of keys) {
      if (parseFloat(key) === requestedNum) {
        return cachedMap[key]
      }
    }

    const sortedKeys = keys.sort((a, b) => Number(a) - Number(b))
    const minEp = Number(sortedKeys[0])

    if (requestedNum < minEp) {
      const index = Math.floor(requestedNum) - 1
      if (index >= 0 && index < sortedKeys.length) {
        const actualEpNum = sortedKeys[index]
        return cachedMap[actualEpNum]
      }
    }

    return null
  }

  async getStreamUrls(
    showId: string,
    episodeNumber: string,
    mode: 'sub' | 'dub'
  ): Promise<VideoSource[] | null> {
    try {
      const epSession = await this.getEpisodeSession(showId, episodeNumber)
      if (!epSession) return null

      const sources = await this.getSources(showId, epSession)
      const matchingSources = sources.filter((src) => {
        const audio = (src.audio || '').trim().toLowerCase()
        const sourceMode =
          audio.includes('eng') || audio.includes('dub')
            ? 'dub'
            : audio.includes('jpn') || audio.includes('jap') || audio.includes('sub')
              ? 'sub'
              : null

        return sourceMode === mode
      })

      const resolvedSources = await Promise.all(
        matchingSources.map(async (src): Promise<VideoSource | null> => {
          const resolved = await this.resolveKwik(src.url)
          if (!resolved.m3u8) return null

          const label = src.fansub
            ? `${src.quality || 'Auto'} - ${src.fansub} (${mode.toUpperCase()})`
            : `${src.quality || 'Auto'} (${mode.toUpperCase()})`

          return {
            sourceName: label,
            links: [
              {
                resolutionStr: src.quality || 'Auto',
                link: resolved.m3u8,
                hls: true,
                headers: { Referer: resolved.referer },
              },
            ],
            type: 'player',
            actualEpisodeNumber: episodeNumber,
          }
        })
      )

      const videoSources = resolvedSources.filter(
        (source): source is VideoSource => source !== null
      )
      return videoSources.length > 0 ? videoSources : null
    } catch {
      return null
    }
  }

  private async getSources(
    animeSession: string,
    episodeSession: string
  ): Promise<AnimePaheVideoSource[]> {
    try {
      const playUrl = `${this.base}/play/${animeSession}/${episodeSession}`
      const html = await this.get(playUrl)
      const $ = cheerio.load(html)

      const sources: AnimePaheVideoSource[] = []

      $('[data-src]').each((_, el) => {
        const src = $(el).attr('data-src')?.trim()
        if (!src || !/kwik/i.test(src)) return

        const resolution = $(el).attr('data-resolution') || $(el).attr('data-res')
        sources.push({
          url: src,
          quality: resolution ? (resolution.endsWith('p') ? resolution : `${resolution}p`) : null,
          fansub: $(el).attr('data-fansub') ?? null,
          audio: $(el).attr('data-audio') ?? null,
        })
      })

      const unique = Array.from(new Map(sources.map((s) => [s.url, s])).values())
      unique.sort((a, b) => {
        const qa = a.quality ? parseInt(a.quality) || 0 : 0
        const qb = b.quality ? parseInt(b.quality) || 0 : 0
        return qb - qa
      })

      return unique
    } catch {
      return []
    }
  }

  async resolveKwik(kwikUrl: string): Promise<{ m3u8: string; referer: string }> {
    const cacheKey = `animepahe_kwik_${kwikUrl}`
    const cached = this.cache.get<{ m3u8: string; referer: string }>(cacheKey)
    if (cached) return cached

    try {
      const response = await fetch(kwikUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Referer: 'https://animepahe.pw/',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const html = await response.text()

      if (html.includes('Just a moment')) {
        throw new Error('Kwik triggered a Cloudflare challenge.')
      }

      const m3u8 = extractHlsUrl(html)
      if (m3u8) {
        const result = { m3u8, referer: kwikUrl }
        this.cache.set(cacheKey, result, 900)
        return result
      }

      throw new Error('Could not find HLS source in Kwik HTML')
    } catch (err) {
      const error = err as Error
      logger.error({ err: error.message }, 'Kwik Resolve failed')
      return { m3u8: '', referer: kwikUrl }
    }
  }

  async getShowMeta(showId: string): Promise<Partial<Show> | null> {
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
