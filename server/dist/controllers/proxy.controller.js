"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProxyController = exports.axiosInstance = void 0;
const axios_1 = __importDefault(require("axios"));
const axios_retry_1 = __importDefault(require("axios-retry"));
const path_1 = __importDefault(require("path"));
const http_1 = __importDefault(require("http"));
const https_1 = __importDefault(require("https"));
const node_cache_1 = __importDefault(require("node-cache"));
const config_1 = require("../config");
const fs_1 = __importDefault(require("fs"));
const proxyCache = new node_cache_1.default({ stdTTL: 30, checkperiod: 60 });
const KWIK_EMBED_HOSTS = new Set(['kwik.cx', 'kwik.si']);
const ANIMEPAHE_REFERER = 'https://animepahe.pw/';
const httpAgent = new http_1.default.Agent({ keepAlive: true, maxSockets: 100 });
const httpsAgent = new https_1.default.Agent({ keepAlive: true, maxSockets: 100 });
httpAgent.setMaxListeners(100);
httpsAgent.setMaxListeners(100);
exports.axiosInstance = axios_1.default.create({
    httpAgent,
    httpsAgent,
    timeout: 30000,
});
(0, axios_retry_1.default)(exports.axiosInstance, { retries: 3, retryDelay: axios_retry_1.default.exponentialDelay });
class ProxyController {
    abortWhenClientLeaves(res, abortController) {
        res.on('close', () => {
            if (!res.writableEnded) {
                abortController.abort();
            }
        });
    }
    getAllowedKwikEmbedUrl(value) {
        if (typeof value !== 'string')
            return null;
        try {
            const url = new URL(value);
            if (url.protocol !== 'https:' ||
                !KWIK_EMBED_HOSTS.has(url.hostname.toLowerCase()) ||
                !/^\/e\/[A-Za-z0-9_-]+$/.test(url.pathname) ||
                Boolean(url.username || url.password || url.search || url.hash)) {
                return null;
            }
            return url;
        }
        catch {
            return null;
        }
    }
    handleProxy = async (req, res) => {
        const { url, referer } = req.query;
        if (!url)
            return res.status(400).send('URL required');
        const urlStr = url;
        const refererStr = referer || '';
        const cacheKey = `m3u8-${urlStr}-${refererStr}`;
        const abortController = new AbortController();
        this.abortWhenClientLeaves(res, abortController);
        try {
            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            };
            if (referer)
                headers['Referer'] = refererStr;
            if (req.headers.range)
                headers['Range'] = req.headers.range;
            if (urlStr.includes('.m3u8')) {
                const cached = proxyCache.get(cacheKey);
                if (cached) {
                    return res
                        .set('Content-Type', 'application/vnd.apple.mpegurl')
                        .set('Access-Control-Allow-Origin', '*')
                        .send(cached);
                }
                const resp = await exports.axiosInstance.get(urlStr, {
                    headers,
                    responseType: 'text',
                    signal: abortController.signal,
                });
                const baseUrl = new URL(urlStr);
                const proxiedMediaUrl = (targetUrl) => `/api/proxy?url=${encodeURIComponent(targetUrl)}&referer=${encodeURIComponent(refererStr)}`;
                const requiresProxyHeaders = Boolean(refererStr);
                const rewritten = resp.data
                    .split('\n')
                    .map((l) => {
                    const line = l.trim();
                    if (!line)
                        return l;
                    if (line.startsWith('#')) {
                        return line.replace(/URI="([^"]+)"/g, (_match, uri) => {
                            const fullUri = new URL(uri, baseUrl).href;
                            if (requiresProxyHeaders || fullUri.includes('.m3u8')) {
                                return `URI="${proxiedMediaUrl(fullUri)}"`;
                            }
                            return `URI="${fullUri}"`;
                        });
                    }
                    const fullUrl = new URL(line, baseUrl).href;
                    if (requiresProxyHeaders || fullUrl.includes('.m3u8')) {
                        return proxiedMediaUrl(fullUrl);
                    }
                    return fullUrl;
                })
                    .join('\n');
                proxyCache.set(cacheKey, rewritten);
                res
                    .set('Content-Type', 'application/vnd.apple.mpegurl')
                    .set('Access-Control-Allow-Origin', '*')
                    .send(rewritten);
            }
            else {
                const resp = await (0, exports.axiosInstance)({
                    method: 'get',
                    url: urlStr,
                    responseType: 'stream',
                    headers,
                    signal: abortController.signal,
                });
                res.status(resp.status);
                const forwardHeaders = [
                    'content-type',
                    'content-length',
                    'content-range',
                    'accept-ranges',
                    'cache-control',
                    'last-modified',
                    'etag',
                ];
                Object.keys(resp.headers).forEach((k) => {
                    if (forwardHeaders.includes(k.toLowerCase())) {
                        res.set(k, resp.headers[k]);
                    }
                });
                res.set('Access-Control-Allow-Origin', '*');
                resp.data.on('error', () => {
                    abortController.abort();
                    if (!res.headersSent)
                        res.status(502).send('Upstream error');
                    else
                        res.destroy();
                });
                res.on('close', () => {
                    if (!resp.data.destroyed) {
                        resp.data.destroy();
                    }
                });
                resp.data.pipe(res);
            }
        }
        catch (e) {
            if (axios_1.default.isCancel(e)) {
                return;
            }
            if (!res.headersSent)
                res.status(500).send('Proxy error');
        }
    };
    handleEmbedProxy = async (req, res) => {
        const targetUrl = this.getAllowedKwikEmbedUrl(req.query.url);
        if (!targetUrl)
            return res.status(400).send('Unsupported embed URL');
        const abortController = new AbortController();
        this.abortWhenClientLeaves(res, abortController);
        try {
            const response = await exports.axiosInstance.get(targetUrl.href, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
                    Referer: ANIMEPAHE_REFERER,
                    Origin: 'https://animepahe.pw',
                },
                responseType: 'text',
                signal: abortController.signal,
            });
            const baseTag = `<base href="${targetUrl.origin}/">`;
            const kwikReferer = JSON.stringify(targetUrl.href).replace(/</g, '\\u003c');
            const playlistProxyPatch = `<script>(function(){var original=Hls.prototype.loadSource;Hls.prototype.loadSource=function(source){if(typeof source==='string'&&source.indexOf('.m3u8')!==-1){source=window.location.origin+'/api/proxy?url='+encodeURIComponent(source)+'&referer='+encodeURIComponent(${kwikReferer});}return original.call(this,source);};})();</script>`;
            let html = response.data.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
            const patchedHtml = html.replace(/(<script[^>]+hls(?:\.min)?\.js[^>]*><\/script>)/i, `$1${playlistProxyPatch}`);
            if (patchedHtml === html) {
                return res.status(502).send('Embed player script not found');
            }
            html = patchedHtml;
            return res
                .status(200)
                .set('Content-Type', 'text/html; charset=utf-8')
                .set('Cache-Control', 'private, max-age=120')
                .send(html);
        }
        catch (e) {
            if (axios_1.default.isCancel(e))
                return;
            if (!res.headersSent)
                res.status(502).send('Embed proxy error');
        }
    };
    handleSubtitleProxy = async (req, res) => {
        const { url, referer } = req.query;
        if (!url)
            return res.status(400).send('URL required');
        const abortController = new AbortController();
        this.abortWhenClientLeaves(res, abortController);
        try {
            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            };
            if (referer)
                headers['Referer'] = referer;
            const response = await exports.axiosInstance.get(url, {
                headers,
                responseType: 'text',
                signal: abortController.signal,
            });
            res.set('Content-Type', 'text/vtt; charset=utf-8').send(response.data);
        }
        catch (e) {
            if (axios_1.default.isCancel(e))
                return;
            res.status(500).send('Proxy error');
        }
    };
    handleImageProxy = async (req, res) => {
        const { url } = req.query;
        if (!url)
            return res.status(400).send('URL required');
        const abortController = new AbortController();
        this.abortWhenClientLeaves(res, abortController);
        try {
            const targetUrl = url;
            let refererValue = 'https://allanime.day';
            if (targetUrl.includes('anilist.co')) {
                refererValue = 'https://anilist.co/';
            }
            else if (targetUrl.includes('gogocdn.net')) {
                refererValue = 'https://gogoanime.lu/';
            }
            else if (targetUrl.includes('youtube-anime.com') || targetUrl.includes('allanime.day')) {
                refererValue = 'https://allanime.day/';
            }
            else if (targetUrl.includes('animeya.cc')) {
                refererValue = 'https://animeya.cc/';
            }
            const imageResponse = await (0, exports.axiosInstance)({
                method: 'get',
                url: targetUrl,
                responseType: 'stream',
                headers: {
                    Referer: refererValue,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                },
                timeout: 30000,
                signal: abortController.signal,
            });
            if (imageResponse.status === 200) {
                res.set('Cache-Control', 'public, max-age=604800, immutable');
            }
            res.set('Content-Type', String(imageResponse.headers['content-type'] ?? ''));
            imageResponse.data.on('error', () => {
                if (!res.headersSent) {
                    this.sendPlaceholder(res);
                }
            });
            res.on('close', () => {
                if (!imageResponse.data.destroyed) {
                    imageResponse.data.destroy();
                }
            });
            imageResponse.data.pipe(res);
        }
        catch (e) {
            if (axios_1.default.isCancel(e)) {
                return;
            }
            if (!res.headersSent) {
                this.sendPlaceholder(res);
            }
        }
    };
    sendPlaceholder(res) {
        const possiblePaths = [
            path_1.default.join(config_1.CONFIG.PACKAGE_ROOT, 'client/public/placeholder.svg'),
            path_1.default.join(config_1.CONFIG.PACKAGE_ROOT, 'client/dist/placeholder.svg'),
            path_1.default.join(config_1.CONFIG.SERVER_ROOT, '..', 'client/public/placeholder.svg'),
        ];
        for (const p of possiblePaths) {
            if (fs_1.default.existsSync(p)) {
                return res.status(200).sendFile(p);
            }
        }
        res.status(404).send('Not Found');
    }
}
exports.ProxyController = ProxyController;
