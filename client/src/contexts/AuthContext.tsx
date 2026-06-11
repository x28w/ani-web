import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

export interface SiteUser {
  username: string
  displayName: string
  role: 'admin' | 'user' | 'guest'
  profilePictureUrl?: string
}

interface AuthContextValue {
  authenticated: boolean
  enabled: boolean
  guestSignInDismissed: boolean
  loading: boolean
  maxProfilePictureBytes: number
  user: SiteUser | null
  login: (username: string, password: string) => Promise<void>
  browseAsGuest: () => Promise<void>
  dismissGuestSignIn: () => void
  logout: () => Promise<void>
  refresh: () => Promise<void>
  updateDisplayName: (displayName: string) => Promise<void>
  uploadProfilePicture: (file: File) => Promise<void>
}

interface StatusResponse {
  authenticated: boolean
  enabled: boolean
  maxProfilePictureBytes?: number
  user: SiteUser | null
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)
const DEFAULT_MAX_PROFILE_PICTURE_BYTES = 1024 * 1024
const PROFILE_PICTURE_KEY_PREFIX = 'ani-web:profile-picture:'
const DISPLAY_NAME_KEY_PREFIX = 'ani-web:display-name:'
const GUEST_SIGN_IN_DISMISSED_KEY = 'ani-web:guest-sign-in-dismissed'
const MAX_DISPLAY_NAME_LENGTH = 40
const DEFAULT_GUEST_AVATAR_URL = '/guest-avatar.svg'

async function parseError(response: Response): Promise<string> {
  try {
    const data = await response.json()
    return data.error || 'Request failed.'
  } catch {
    return 'Request failed.'
  }
}

function getStoredProfilePicture(username: string): string | undefined {
  try {
    return localStorage.getItem(`${PROFILE_PICTURE_KEY_PREFIX}${username}`) || undefined
  } catch {
    return undefined
  }
}

function getStoredDisplayName(username: string): string | undefined {
  try {
    return localStorage.getItem(`${DISPLAY_NAME_KEY_PREFIX}${username}`)?.trim() || undefined
  } catch {
    return undefined
  }
}

function hasDismissedGuestSignIn(): boolean {
  try {
    return localStorage.getItem(GUEST_SIGN_IN_DISMISSED_KEY) === 'true'
  } catch {
    return false
  }
}

function withStoredProfile(user: SiteUser | null): SiteUser | null {
  if (!user) return null
  const profilePictureUrl =
    getStoredProfilePicture(user.username) ||
    user.profilePictureUrl ||
    (user.role === 'guest' ? DEFAULT_GUEST_AVATAR_URL : undefined)
  const displayName = getStoredDisplayName(user.username) || user.displayName
  return { ...user, displayName, profilePictureUrl }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Unable to read the selected image.'))
    reader.readAsDataURL(file)
  })
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authenticated, setAuthenticated] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const [guestSignInDismissed, setGuestSignInDismissed] = useState(hasDismissedGuestSignIn)
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<SiteUser | null>(null)
  const [maxProfilePictureBytes, setMaxProfilePictureBytes] = useState(
    DEFAULT_MAX_PROFILE_PICTURE_BYTES
  )

  const applyStatus = useCallback((status: StatusResponse) => {
    setAuthenticated(status.authenticated)
    setEnabled(status.enabled)
    setUser(withStoredProfile(status.user))
    setMaxProfilePictureBytes(status.maxProfilePictureBytes || DEFAULT_MAX_PROFILE_PICTURE_BYTES)
  }, [])

  const refresh = useCallback(async () => {
    const response = await fetch('/api/site-auth/status')
    if (!response.ok) {
      setAuthenticated(false)
      setUser(null)
      return
    }

    applyStatus(await response.json())
  }, [applyStatus])

  useEffect(() => {
    let cancelled = false

    const initializeSession = async () => {
      const response = await fetch('/api/site-auth/status')
      if (!response.ok) {
        if (!cancelled) {
          setAuthenticated(false)
          setUser(null)
        }
        return
      }

      const status: StatusResponse = await response.json()
      if (status.enabled && !status.authenticated) {
        const guestResponse = await fetch('/api/site-auth/guest', { method: 'POST' })
        if (guestResponse.ok) {
          if (!cancelled) await refresh()
          return
        }
      }

      if (!cancelled) applyStatus(status)
    }

    initializeSession().finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [applyStatus, refresh])

  const login = useCallback(
    async (username: string, password: string) => {
      const response = await fetch('/api/site-auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      if (!response.ok) {
        throw new Error(await parseError(response))
      }

      await refresh()
    },
    [refresh]
  )

  const browseAsGuest = useCallback(async () => {
    const response = await fetch('/api/site-auth/guest', { method: 'POST' })

    if (!response.ok) {
      throw new Error(await parseError(response))
    }

    await refresh()
  }, [refresh])

  const dismissGuestSignIn = useCallback(() => {
    try {
      localStorage.setItem(GUEST_SIGN_IN_DISMISSED_KEY, 'true')
    } finally {
      setGuestSignInDismissed(true)
    }
  }, [])

  const logout = useCallback(async () => {
    await fetch('/api/site-auth/logout', { method: 'POST' })
    setAuthenticated(false)
    setUser(null)
  }, [])

  const updateDisplayName = useCallback(
    async (displayName: string) => {
      if (!user) {
        throw new Error('Sign in before setting a display name.')
      }

      const trimmedName = displayName.trim()
      if (trimmedName.length > MAX_DISPLAY_NAME_LENGTH) {
        throw new Error(`Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or shorter.`)
      }

      try {
        if (trimmedName) {
          localStorage.setItem(`${DISPLAY_NAME_KEY_PREFIX}${user.username}`, trimmedName)
          setUser({ ...user, displayName: trimmedName })
          return
        }

        localStorage.removeItem(`${DISPLAY_NAME_KEY_PREFIX}${user.username}`)
      } catch {
        throw new Error('Your browser could not store this display name.')
      }

      await refresh()
    },
    [refresh, user]
  )

  const uploadProfilePicture = useCallback(
    async (file: File) => {
      if (!user) {
        throw new Error('Sign in before setting a profile picture.')
      }

      const dataUrl = await readFileAsDataUrl(file)
      try {
        localStorage.setItem(`${PROFILE_PICTURE_KEY_PREFIX}${user.username}`, dataUrl)
      } catch {
        throw new Error('Your browser could not store this image. Try a smaller picture.')
      }

      setUser({ ...user, profilePictureUrl: dataUrl })
    },
    [user]
  )

  const value = useMemo(
    () => ({
      authenticated,
      enabled,
      guestSignInDismissed,
      loading,
      maxProfilePictureBytes,
      user,
      login,
      browseAsGuest,
      dismissGuestSignIn,
      logout,
      refresh,
      updateDisplayName,
      uploadProfilePicture,
    }),
    [
      authenticated,
      enabled,
      guestSignInDismissed,
      loading,
      maxProfilePictureBytes,
      user,
      login,
      browseAsGuest,
      dismissGuestSignIn,
      logout,
      refresh,
      updateDisplayName,
      uploadProfilePicture,
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within an AuthProvider')
  return value
}
