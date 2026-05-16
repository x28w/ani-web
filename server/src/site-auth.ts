import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { NextFunction, Request, RequestHandler, Response, Router } from 'express'
import multer from 'multer'
import { CONFIG } from './config'
import logger from './logger'

type SiteRole = 'admin' | 'user'

interface SiteUserRecord {
  username: string
  password: string
  displayName: string
  role: SiteRole
}

export interface SiteUser {
  username: string
  displayName: string
  role: SiteRole
  profilePictureUrl?: string
}

interface SessionPayload {
  username: string
  exp: number
}

interface ProfilePictureMeta {
  filename: string
  updatedAt: number
}

declare module 'express-serve-static-core' {
  interface Request {
    siteUser?: SiteUser
  }
}

const COOKIE_NAME = 'ani_web_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
const MAX_PROFILE_PICTURE_BYTES = 1024 * 1024
const PROFILE_DIR = path.join(CONFIG.ROOT, 'profile-pictures')
const PROFILE_META_PATH = path.join(PROFILE_DIR, 'profile-pictures.json')
const allowedImageTypes: Record<string, string> = {
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

function normalizeRole(role: unknown, index: number): SiteRole {
  return role === 'admin' || index === 0 ? 'admin' : 'user'
}

function getConfiguredUsers(): SiteUserRecord[] {
  if (process.env.SITE_USERS) {
    try {
      const parsed = JSON.parse(process.env.SITE_USERS)
      if (!Array.isArray(parsed)) return []

      return parsed
        .map((entry, index) => ({
          username: String(entry.username || '').trim(),
          password: String(entry.password || ''),
          displayName: String(entry.displayName || entry.username || '').trim(),
          role: normalizeRole(entry.role, index),
        }))
        .filter((entry) => entry.username && entry.password)
    } catch (error) {
      logger.error({ err: error }, 'Invalid SITE_USERS JSON')
      return []
    }
  }

  const username = process.env.SITE_LOGIN_USER?.trim()
  const password = process.env.SITE_LOGIN_PASSWORD || ''
  if (!username || !password) return []

  return [
    {
      username,
      password,
      displayName: process.env.SITE_LOGIN_DISPLAY_NAME?.trim() || username,
      role: 'admin',
    },
  ]
}

export function isSiteAuthEnabled(): boolean {
  return getConfiguredUsers().length > 0
}

function getSessionSecret(): string {
  return process.env.SESSION_SECRET || process.env.SITE_LOGIN_PASSWORD || 'ani-web-local-session'
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function signPayload(encodedPayload: string): string {
  return crypto.createHmac('sha256', getSessionSecret()).update(encodedPayload).digest('base64url')
}

function createSessionToken(username: string): string {
  const payload: SessionPayload = {
    username,
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  }
  const encodedPayload = encodeJson(payload)
  return `${encodedPayload}.${signPayload(encodedPayload)}`
}

function safeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {}

  return cookieHeader.split(';').reduce<Record<string, string>>((cookies, item) => {
    const separatorIndex = item.indexOf('=')
    if (separatorIndex === -1) return cookies

    const key = item.slice(0, separatorIndex).trim()
    const value = item.slice(separatorIndex + 1).trim()
    cookies[key] = decodeURIComponent(value)
    return cookies
  }, {})
}

function getProfileMeta(): Record<string, ProfilePictureMeta> {
  try {
    if (!fs.existsSync(PROFILE_META_PATH)) return {}
    return JSON.parse(fs.readFileSync(PROFILE_META_PATH, 'utf8'))
  } catch (error) {
    logger.warn({ err: error }, 'Failed to read profile picture metadata')
    return {}
  }
}

function writeProfileMeta(meta: Record<string, ProfilePictureMeta>) {
  fs.mkdirSync(PROFILE_DIR, { recursive: true })
  fs.writeFileSync(PROFILE_META_PATH, JSON.stringify(meta, null, 2))
}

function getSafeProfileStem(username: string): string {
  return Buffer.from(username, 'utf8').toString('base64url')
}

function getProfilePictureUrl(username: string): string | undefined {
  const meta = getProfileMeta()[username]
  if (!meta) return undefined

  const profilePath = path.join(PROFILE_DIR, meta.filename)
  if (!fs.existsSync(profilePath)) return undefined

  return `/api/site-auth/profile-picture/${encodeURIComponent(username)}?v=${meta.updatedAt}`
}

function toPublicUser(user: SiteUserRecord): SiteUser {
  return {
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    profilePictureUrl: getProfilePictureUrl(user.username),
  }
}

function getLocalUser(): SiteUser {
  return {
    username: 'local',
    displayName: 'Local User',
    role: 'admin',
    profilePictureUrl: getProfilePictureUrl('local'),
  }
}

function getUserFromSession(req: Request): SiteUser | null {
  const users = getConfiguredUsers()
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME]
  if (!token) return null

  const [encodedPayload, signature] = token.split('.')
  if (!encodedPayload || !signature || !safeCompare(signature, signPayload(encodedPayload))) {
    return null
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
    if (typeof payload.username !== 'string' || typeof payload.exp !== 'number') return null
    if (payload.exp < Date.now()) return null

    const user = users.find((entry) => entry.username === payload.username)
    return user ? toPublicUser(user) : null
  } catch {
    return null
  }
}

function setSessionCookie(res: Response, username: string) {
  const secure = !CONFIG.IS_DEV && process.env.RENDER === 'true'
  const token = createSessionToken(username)
  const cookieParts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ]

  if (secure) cookieParts.push('Secure')
  res.setHeader('Set-Cookie', cookieParts.join('; '))
}

function clearSessionCookie(res: Response) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`)
}

function attachSiteUser(req: Request): SiteUser | null {
  if (!isSiteAuthEnabled()) {
    req.siteUser = getLocalUser()
    return req.siteUser
  }

  const user = getUserFromSession(req)
  if (user) req.siteUser = user
  return user
}

export const requireSiteAuth: RequestHandler = (req, res, next) => {
  const user = attachSiteUser(req)
  if (!user) {
    return res.status(401).json({ error: 'Login required' })
  }
  next()
}

export const requireSiteAdmin: RequestHandler = (req, res, next) => {
  const user = attachSiteUser(req)
  if (!user) {
    return res.status(401).json({ error: 'Login required' })
  }

  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' })
  }

  next()
}

function removeOldProfilePictures(username: string) {
  const stem = getSafeProfileStem(username)
  if (!fs.existsSync(PROFILE_DIR)) return

  for (const file of fs.readdirSync(PROFILE_DIR)) {
    if (file.startsWith(`${stem}.`)) {
      fs.rmSync(path.join(PROFILE_DIR, file), { force: true })
    }
  }
}

const profileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PROFILE_PICTURE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (allowedImageTypes[file.mimetype]) {
      cb(null, true)
      return
    }
    cb(new Error('Only PNG, JPEG, WebP, and GIF images are supported.'))
  },
})

function handleUploadError(error: unknown, res: Response): boolean {
  if (!error) return false

  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({ error: 'Profile picture must be 1 MB or smaller.' })
    return true
  }

  const message = error instanceof Error ? error.message : 'Profile picture upload failed.'
  res.status(400).json({ error: message })
  return true
}

async function saveProfilePicture(req: Request, res: Response) {
  if (!req.siteUser) return res.status(401).json({ error: 'Login required' })
  if (!req.file) return res.status(400).json({ error: 'No profile picture uploaded.' })

  const ext = allowedImageTypes[req.file.mimetype]
  if (!ext) return res.status(400).json({ error: 'Unsupported profile picture type.' })

  try {
    fs.mkdirSync(PROFILE_DIR, { recursive: true })
    removeOldProfilePictures(req.siteUser.username)

    const filename = `${getSafeProfileStem(req.siteUser.username)}.${ext}`
    fs.writeFileSync(path.join(PROFILE_DIR, filename), req.file.buffer)

    const meta = getProfileMeta()
    meta[req.siteUser.username] = { filename, updatedAt: Date.now() }
    writeProfileMeta(meta)

    const users = getConfiguredUsers()
    const configuredUser = users.find((entry) => entry.username === req.siteUser?.username)
    res.json({ user: configuredUser ? toPublicUser(configuredUser) : getLocalUser() })
  } catch (error) {
    logger.error({ err: error }, 'Failed to save profile picture')
    res.status(500).json({ error: 'Failed to save profile picture.' })
  }
}

function serveProfilePicture(req: Request, res: Response) {
  const username = String(req.params.username || '')
  const meta = getProfileMeta()[username]
  if (!meta) return res.status(404).send('Not found')

  const profilePath = path.resolve(PROFILE_DIR, meta.filename)
  if (!profilePath.startsWith(path.resolve(PROFILE_DIR)) || !fs.existsSync(profilePath)) {
    return res.status(404).send('Not found')
  }

  res.sendFile(profilePath)
}

export function createSiteAuthRouter(): Router {
  const router = Router()

  router.get('/status', (req, res) => {
    const user = attachSiteUser(req)
    res.json({
      enabled: isSiteAuthEnabled(),
      authenticated: !!user,
      user,
      maxProfilePictureBytes: MAX_PROFILE_PICTURE_BYTES,
    })
  })

  router.post('/login', (req, res) => {
    if (!isSiteAuthEnabled()) {
      return res.json({ user: getLocalUser() })
    }

    const username = String(req.body?.username || '').trim()
    const password = String(req.body?.password || '')
    const user = getConfiguredUsers().find((entry) => entry.username === username)

    if (!user || !safeCompare(user.password, password)) {
      return res.status(401).json({ error: 'Invalid username or password.' })
    }

    setSessionCookie(res, user.username)
    res.json({ user: toPublicUser(user) })
  })

  router.post('/logout', (_req, res) => {
    clearSessionCookie(res)
    res.json({ success: true })
  })

  router.get('/profile-picture/:username', requireSiteAuth, serveProfilePicture)
  router.post('/profile-picture', requireSiteAuth, (req: Request, res: Response, next: NextFunction) => {
    profileUpload.single('avatar')(req, res, (error) => {
      if (handleUploadError(error, res)) return
      saveProfilePicture(req, res).catch(next)
    })
  })

  return router
}
