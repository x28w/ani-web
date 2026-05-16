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
  loading: boolean
  maxProfilePictureBytes: number
  user: SiteUser | null
  login: (username: string, password: string) => Promise<void>
  browseAsGuest: () => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
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

async function parseError(response: Response): Promise<string> {
  try {
    const data = await response.json()
    return data.error || 'Request failed.'
  } catch {
    return 'Request failed.'
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authenticated, setAuthenticated] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<SiteUser | null>(null)
  const [maxProfilePictureBytes, setMaxProfilePictureBytes] = useState(
    DEFAULT_MAX_PROFILE_PICTURE_BYTES
  )

  const applyStatus = useCallback((status: StatusResponse) => {
    setAuthenticated(status.authenticated)
    setEnabled(status.enabled)
    setUser(status.user)
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
    refresh().finally(() => setLoading(false))
  }, [refresh])

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

  const logout = useCallback(async () => {
    await fetch('/api/site-auth/logout', { method: 'POST' })
    setAuthenticated(false)
    setUser(null)
  }, [])

  const uploadProfilePicture = useCallback(
    async (file: File) => {
      const formData = new FormData()
      formData.append('avatar', file)

      const response = await fetch('/api/site-auth/profile-picture', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error(await parseError(response))
      }

      await refresh()
    },
    [refresh]
  )

  const value = useMemo(
    () => ({
      authenticated,
      enabled,
      loading,
      maxProfilePictureBytes,
      user,
      login,
      browseAsGuest,
      logout,
      refresh,
      uploadProfilePicture,
    }),
    [
      authenticated,
      enabled,
      loading,
      maxProfilePictureBytes,
      user,
      login,
      browseAsGuest,
      logout,
      refresh,
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
