import { Request, Response } from 'express'
import axios from 'axios'
import axiosRetry from 'axios-retry'
import path from 'path'
import http from 'http'
import https from 'https'
import NodeCache from 'node-cache'
import { CONFIG } from '../config'
import fs from 'fs'

const proxyCache = new NodeCache({ stdTTL: 30, checkperiod: 60 })
const KWIK_EMBED_HOSTS = new Set(['kwik.cx', 'kwik.si'])
const ANIMEPAHE_REFERER = 'https://animepahe.pw/'

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 100 })
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100 })

httpAgent.setMaxListeners(100)
httpsAgent.setMaxListeners(100)

export const axiosInstance = axios.create({
  httpAgent,
  httpsAgent,
  timeout: 30000,
})

axiosRetry(axiosInstance, { retries: 3, retryDelay: axiosRetry.exponentialDelay })

export class ProxyController {
  private abortWhenClientLeaves(res: Response, abortController: AbortController) {
    res.on('close', () => {
      if (!res.writableEnded) {
        abortController.abort()
      }
    })
  }

  private getAllowedKwikEmbedUrl(value: unknown): URL | null {
    if (typeof value !== 'string') return null

    try {
      const url = new URL(value)
      if (
        url.protocol !== 'https:' ||
        !KWIK_EMBED_HOSTS.has(url.hostname.toLowerCase()) ||
        !/^\/e\/[A-Za-z0-9_-]+$/.test(url.pathname) ||
        Boolean(url.username || url.password || url.search || url.hash)
      ) {
        return null
      }

      return url
    } catch {
      return null
    }
  }

  handleProxy = async (req: Request, res: Response) => {
    const { url, referer } = req.query
    if (!url) return res.status(400).send('URL required')

    const urlStr = url as string
    const refererStr = (referer as string) || ''
    const cacheKey = `m3u8-${urlStr}-${refererStr}`

    const abortController = new AbortController()
    this.abortWhenClientLeaves(res, abortController)

    try {
      const headers: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
      if (referer) headers['Referer'] = refererStr
      if (req.headers.range) headers['Range'] = req.headers.range

      if (urlStr.includes('.m3u8')) {
        const cached = proxyCache.get<string>(cacheKey)
        if (cached) {
          return res
            .set('Content-Type', 'application/vnd.apple.mpegurl')
            .set('Access-Control-Allow-Origin', '*')
            .send(cached)
        }

        const resp = await axiosInstance.get(urlStr, {
          headers,
          responseType: 'text',
          signal: abortController.signal,
        })

        const baseUrl = new URL(urlStr)
        const proxiedMediaUrl = (targetUrl: string) =>
          `/api/proxy?url=${encodeURIComponent(targetUrl)}&referer=${encodeURIComponent(refererStr)}`
        const requiresProxyHeaders = Boolean(refererStr)
        const rewritten = resp.data
          .split('\n')
          .map((l: string) => {
            const line = l.trim()
            if (!line) return l

            if (line.startsWith('#')) {
              return line.replace(/URI="([^"]+)"/g, (_match, uri) => {
                const fullUri = new URL(uri, baseUrl).href
                if (requiresProxyHeaders || fullUri.includes('.m3u8')) {
                  return `URI="${proxiedMediaUrl(fullUri)}"`
                }
                return `URI="${fullUri}"`
              })
            }

            const fullUrl = new URL(line, baseUrl).href
            if (requiresProxyHeaders || fullUrl.includes('.m3u8')) {
              return proxiedMediaUrl(fullUrl)
            }
            return fullUrl
          })
          .join('\n')

        proxyCache.set(cacheKey, rewritten)

        res
          .set('Content-Type', 'application/vnd.apple.mpegurl')
          .set('Access-Control-Allow-Origin', '*')
          .send(rewritten)
      } else {
        const resp = await axiosInstance({
          method: 'get',
          url: urlStr,
          responseType: 'stream',
          headers,
          signal: abortController.signal,
        })
        res.status(resp.status)

        const forwardHeaders = [
          'content-type',
          'content-length',
          'content-range',
          'accept-ranges',
          'cache-control',
          'last-modified',
          'etag',
        ]

        Object.keys(resp.headers).forEach((k) => {
          if (forwardHeaders.includes(k.toLowerCase())) {
            res.set(k, resp.headers[k] as string)
          }
        })
        res.set('Access-Control-Allow-Origin', '*')

        resp.data.on('error', () => {
          abortController.abort()
          if (!res.headersSent) res.status(502).send('Upstream error')
          else res.destroy()
        })

        res.on('close', () => {
          if (!resp.data.destroyed) {
            resp.data.destroy()
          }
        })

        resp.data.pipe(res)
      }
    } catch (e) {
      if (axios.isCancel(e)) {
        return
      }
      if (!res.headersSent) res.status(500).send('Proxy error')
    }
  }

  handleEmbedProxy = async (req: Request, res: Response) => {
    const targetUrl = this.getAllowedKwikEmbedUrl(req.query.url)
    if (!targetUrl) return res.status(400).send('Unsupported embed URL')

    const abortController = new AbortController()
    this.abortWhenClientLeaves(res, abortController)

    try {
      const response = await axiosInstance.get<string>(targetUrl.href, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
          Referer: ANIMEPAHE_REFERER,
          Origin: 'https://animepahe.pw',
        },
        responseType: 'text',
        signal: abortController.signal,
      })

      const kwikReferer = JSON.stringify(targetUrl.href).replace(/</g, '\\u003c')
      const iconProxyUrl = `/api/proxy?url=${encodeURIComponent(`${targetUrl.origin}/app/js/vendor/plyr.svg`)}&referer=${encodeURIComponent(targetUrl.href)}`
      const iconProxyPatch = `<script>Plyr.defaults.iconUrl=${JSON.stringify(iconProxyUrl).replace(/</g, '\\u003c')};</script>`
      const playlistProxyPatch = `<script>(function(){var original=Hls.prototype.loadSource;Hls.prototype.loadSource=function(source){if(typeof source==='string'&&source.indexOf('.m3u8')!==-1){source=window.location.origin+'/api/proxy?url='+encodeURIComponent(source)+'&referer='+encodeURIComponent(${kwikReferer});}return original.call(this,source);};})();</script>`
      let html = response.data
        .replace(
          /\b(src|href)=(["'])(\/\/[^"']+|\/(?!\/)[^"']*)\2/gi,
          (_match, attribute, quote, resourcePath) => {
            const assetUrl = resourcePath.startsWith('//')
              ? `https:${resourcePath}`
              : `${targetUrl.origin}${resourcePath}`
            return `${attribute}=${quote}${assetUrl}${quote}`
          }
        )
        .replace(
          /url\((["']?)(\/\/[^"')]+|\/(?!\/)[^"')]+)\1\)/gi,
          (_match, quote, resourcePath) => {
            const assetUrl = resourcePath.startsWith('//')
              ? `https:${resourcePath}`
              : `${targetUrl.origin}${resourcePath}`
            return `url(${quote}${assetUrl}${quote})`
          }
        )

      const iconPatchedHtml = html.replace(
        /(<script[^>]+\/app\/js\/vendor\/plyr\.min\.js[^>]*><\/script>)/i,
        `$1${iconProxyPatch}`
      )
      const patchedHtml = iconPatchedHtml.replace(
        /(<script[^>]+hls(?:\.min)?\.js[^>]*><\/script>)/i,
        `$1${playlistProxyPatch}`
      )

      if (iconPatchedHtml === html || patchedHtml === iconPatchedHtml) {
        return res.status(502).send('Embed player scripts not found')
      }
      html = patchedHtml

      return res
        .status(200)
        .set('Content-Type', 'text/html; charset=utf-8')
        .set('Cache-Control', 'private, max-age=120')
        .send(html)
    } catch (e) {
      if (axios.isCancel(e)) return
      if (!res.headersSent) res.status(502).send('Embed proxy error')
    }
  }

  handleSubtitleProxy = async (req: Request, res: Response) => {
    const { url, referer } = req.query
    if (!url) return res.status(400).send('URL required')

    const abortController = new AbortController()
    this.abortWhenClientLeaves(res, abortController)

    try {
      const headers: Record<string, string> = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
      if (referer) headers['Referer'] = referer as string

      const response = await axiosInstance.get(url as string, {
        headers,
        responseType: 'text',
        signal: abortController.signal,
      })
      res.set('Content-Type', 'text/vtt; charset=utf-8').send(response.data)
    } catch (e) {
      if (axios.isCancel(e)) return
      res.status(500).send('Proxy error')
    }
  }

  handleImageProxy = async (req: Request, res: Response) => {
    const { url } = req.query
    if (!url) return res.status(400).send('URL required')

    const abortController = new AbortController()
    this.abortWhenClientLeaves(res, abortController)

    try {
      const targetUrl = url as string
      let refererValue = 'https://allanime.day'

      if (targetUrl.includes('anilist.co')) {
        refererValue = 'https://anilist.co/'
      } else if (targetUrl.includes('gogocdn.net')) {
        refererValue = 'https://gogoanime.lu/'
      } else if (targetUrl.includes('youtube-anime.com') || targetUrl.includes('allanime.day')) {
        refererValue = 'https://allanime.day/'
      } else if (targetUrl.includes('animeya.cc')) {
        refererValue = 'https://animeya.cc/'
      }

      const imageResponse = await axiosInstance({
        method: 'get',
        url: targetUrl,
        responseType: 'stream',
        headers: {
          Referer: refererValue,
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        timeout: 30000,
        signal: abortController.signal,
      })

      if (imageResponse.status === 200) {
        res.set('Cache-Control', 'public, max-age=604800, immutable')
      }
      res.set('Content-Type', String(imageResponse.headers['content-type'] ?? ''))

      imageResponse.data.on('error', () => {
        if (!res.headersSent) {
          this.sendPlaceholder(res)
        }
      })

      res.on('close', () => {
        if (!imageResponse.data.destroyed) {
          imageResponse.data.destroy()
        }
      })

      imageResponse.data.pipe(res)
    } catch (e) {
      if (axios.isCancel(e)) {
        return
      }
      if (!res.headersSent) {
        this.sendPlaceholder(res)
      }
    }
  }

  handleMegaPlayEmbed = (req: Request, res: Response) => {
    const malId = String(req.query.malId || req.query.showId || '')
    const episode = String(req.query.episode || req.query.episodeNumber || '')
    const mode = req.query.mode === 'dub' ? 'dub' : 'sub'

    if (!/^\d+$/.test(malId) || !/^\d+$/.test(episode)) {
      return res.status(400).send('Invalid MegaPlay embed parameters')
    }

    const targetUrl = `https://megaplay.buzz/stream/mal/${malId}/${episode}/${mode}`
    const safeTarget = targetUrl.replace(/"/g, '&quot;')

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="referrer" content="origin" />
  <title>MegaPlay</title>
  <style>
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #000; }
    iframe { border: 0; width: 100%; height: 100%; display: block; }
  </style>
</head>
<body>
  <iframe
    src="${safeTarget}"
    allow="autoplay; fullscreen; picture-in-picture"
    allowfullscreen
    referrerpolicy="origin"
  ></iframe>
</body>
</html>`

    return res
      .status(200)
      .set('Content-Type', 'text/html; charset=utf-8')
      .set('Cache-Control', 'private, max-age=300')
      .send(html)
  }

  private sendPlaceholder(res: Response) {
    const possiblePaths = [
      path.join(CONFIG.PACKAGE_ROOT, 'client/public/placeholder.svg'),
      path.join(CONFIG.PACKAGE_ROOT, 'client/dist/placeholder.svg'),
      path.join(CONFIG.SERVER_ROOT, '..', 'client/public/placeholder.svg'),
    ]

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return res.status(200).sendFile(p)
      }
    }

    res.status(404).send('Not Found')
  }
}
