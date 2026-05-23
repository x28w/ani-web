import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { mergeLocalContinueWatching, removeLocalContinueWatching } from '../lib/localProgress'

export interface Anime {
  _id: string
  id: string
  name: string
  nativeName?: string
  englishName?: string
  thumbnail: string
  bannerImage?: string
  description?: string
  type?: string
  status?: string
  episodeNumber?: number | string
  currentTime?: number
  duration?: number
  watchedCount?: number
  nextEpisodeToWatch?: string
  availableEpisodesDetail?: {
    sub?: string[]
    dub?: string[]
  }
  episodeCount?: number
  isAdult?: boolean
  rating?: string
  genres?: { name: string }[] | string[]
  score?: number
}

const fetchApi = async (url: string) => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch from ${url}`)
  }
  return response.json()
}

export const useLatestReleases = () => {
  return useQuery<Anime[]>({
    queryKey: ['latestReleases'],
    queryFn: () => fetchApi('/api/latest-releases'),
  })
}

export const useCurrentSeason = () => {
  return useInfiniteQuery({
    queryKey: ['currentSeason'],
    queryFn: ({ pageParam = 1 }) => fetchApi(`/api/seasonal?page=${pageParam}`),
    initialPageParam: 1,
    getNextPageParam: (lastPage: Anime[], allPages) => {
      return lastPage.length > 0 ? allPages.length + 1 : undefined
    },
  })
}

export const usePaginatedCurrentSeason = (page: number) => {
  return useQuery<Anime[]>({
    queryKey: ['currentSeason', page],
    queryFn: () => fetchApi(`/api/seasonal?page=${page}`),
  })
}

export const usePaginatedSearchAnime = (
  searchQueryString: string,
  page: number,
  limit: number = 14
) => {
  return useQuery<Anime[]>({
    queryKey: ['searchAnime', searchQueryString, page, limit],
    queryFn: async () => {
      const params = new URLSearchParams(searchQueryString)
      params.set('page', page.toString())
      params.set('limit', limit.toString())
      return fetchApi(`/api/search?${params.toString()}`)
    },
    enabled: searchQueryString != null,
  })
}

export const useContinueWatchingFast = (limit?: number) => {
  const url = limit ? `/api/continue-watching/fast?limit=${limit}` : '/api/continue-watching/fast'
  return useQuery<Anime[]>({
    queryKey: ['continueWatchingFast', { limit }],
    queryFn: async () => {
      const remote = await fetchApi(url).catch(() => [])
      return mergeLocalContinueWatching(remote, limit) as Anime[]
    },
  })
}

export const useContinueWatchingUpNext = () => {
  const url = '/api/continue-watching/up-next'
  return useQuery<Anime[]>({
    queryKey: ['continueWatchingUpNext'],
    queryFn: async () => {
      const remote = await fetchApi(url).catch(() => [])
      return mergeLocalContinueWatching(remote) as Anime[]
    },
  })
}

export const useContinueWatching = (limit?: number) => {
  const url = limit ? `/api/continue-watching?limit=${limit}` : '/api/continue-watching'
  return useQuery<Anime[]>({
    queryKey: ['continueWatching', { limit }],
    queryFn: async () => {
      const remote = await fetchApi(url).catch(() => [])
      return mergeLocalContinueWatching(remote, limit) as Anime[]
    },
  })
}

interface PaginatedAnimeResponse {
  data: Anime[]
  total: number
  page: number
  limit: number
}

export const useInfiniteWatchlist = (status: string, filters: string = '') => {
  return useInfiniteQuery<PaginatedAnimeResponse, Error, { pages: Anime[]; pageParams: unknown[] }>(
    {
      queryKey: ['watchlist', status, filters],
      queryFn: async ({ pageParam = 1 }) => {
        const params = new URLSearchParams(filters)
        params.set('status', status)
        params.set('page', String(pageParam))
        params.set('limit', '14')
        const response = await fetchApi(`/api/watchlist?${params.toString()}`)
        return response
      },
      initialPageParam: 1,
      getNextPageParam: (lastPage) => {
        if (lastPage.data.length === 0 || lastPage.page * lastPage.limit >= lastPage.total) {
          return undefined
        }
        return lastPage.page + 1
      },
      select: (data) => ({
        ...data,
        pages: data.pages.flatMap((page) => page.data),
      }),
    }
  )
}

export const usePaginatedWatchlist = (
  status: string,
  filters: string = '',
  page: number,
  limit: number = 14
) => {
  return useQuery<PaginatedAnimeResponse>({
    queryKey: ['watchlist', status, filters, page, limit],
    queryFn: async () => {
      const params = new URLSearchParams(filters)
      params.set('status', status)
      params.set('page', String(page))
      params.set('limit', String(limit))
      return fetchApi(`/api/watchlist?${params.toString()}`)
    },
  })
}

export const useAllContinueWatching = (filters: string = '') => {
  return useInfiniteQuery<PaginatedAnimeResponse, Error, { pages: Anime[]; pageParams: unknown[] }>(
    {
      queryKey: ['allContinueWatching', filters],
      queryFn: async ({ pageParam = 1 }) => {
        const params = new URLSearchParams(filters)
        params.set('page', String(pageParam))
        params.set('limit', '14')
        const response = await fetchApi(`/api/continue-watching/all?${params.toString()}`).catch(
          () => ({ data: [], total: 0, page: Number(pageParam), limit: 14 })
        )
        const merged = mergeLocalContinueWatching(response.data) as Anime[]
        return {
          ...response,
          data: merged.slice(0, 14),
          total: Math.max(response.total || 0, merged.length),
        }
      },
      initialPageParam: 1,
      getNextPageParam: (lastPage) => {
        if (lastPage.data.length === 0 || lastPage.page * lastPage.limit >= lastPage.total) {
          return undefined
        }
        return lastPage.page + 1
      },
      select: (data) => ({
        ...data,
        pages: data.pages.flatMap((page) => page.data),
      }),
    }
  )
}

export const usePaginatedAllContinueWatching = (
  filters: string = '',
  page: number,
  limit: number = 14
) => {
  return useQuery<PaginatedAnimeResponse>({
    queryKey: ['allContinueWatching', filters, page, limit],
    queryFn: async () => {
      const params = new URLSearchParams(filters)
      params.set('page', String(page))
      params.set('limit', String(limit))
      const response = await fetchApi(`/api/continue-watching/all?${params.toString()}`).catch(
        () => ({ data: [], total: 0, page, limit })
      )
      const merged = mergeLocalContinueWatching(response.data) as Anime[]
      const offset = (page - 1) * limit
      return {
        ...response,
        data: merged.slice(offset, offset + limit),
        total: Math.max(response.total || 0, merged.length),
      }
    },
  })
}

export const useRemoveFromWatchlist = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (showId: string) => {
      removeLocalContinueWatching(showId)
      const response = await fetch(`/api/watchlist/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: showId }),
      })
      if (!response.ok) {
        throw new Error('Failed to remove from watchlist')
      }
    },
    onSuccess: () => {
      toast.success('Removed from watchlist')
      queryClient.invalidateQueries({ queryKey: ['watchlist'] })
    },
    onError: (error) => {
      toast.error(`Failed to remove: ${error.message}`)
    },
  })
}

export interface Notification {
  showId: string
  name: string
  nativeName?: string
  englishName?: string
  thumbnail: string
  episodeNumber: string
  id: string
}

export const useNotifications = (enabled: boolean = true) => {
  return useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: () => fetchApi('/api/notifications'),
    enabled,
    refetchInterval: 120000,
  })
}

export const useDismissNotification = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ showId, episodeNumber }: { showId: string; episodeNumber: string }) => {
      const response = await fetch(`/api/notifications/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showId, episodeNumber }),
      })
      if (!response.ok) {
        throw new Error('Failed to dismiss notification')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export const useClearAllNotifications = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (showId?: string) => {
      const response = await fetch(`/api/notifications/clear-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showId }),
      })
      if (!response.ok) {
        throw new Error('Failed to clear notifications')
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}
export const useGenresAndStudios = () => {
  return useQuery<{ genres: string[]; tags: string[]; studios: string[] }>({
    queryKey: ['genresAndStudios'],
    queryFn: () => fetchApi('/api/genres-and-tags'),
    staleTime: 1000 * 60 * 60, // 1 hour
  })
}
