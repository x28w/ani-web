import { useEffect, useCallback, useReducer, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import type {
  DetailedShowMeta,
  VideoSource,
  VideoLink,
  SkipInterval,
  PlayerState,
} from '../types/player'
import { playerReducer, createInitialState, type Action } from '../reducers/playerReducer'
import {
  getLocalEpisodeProgress,
  getLocalWatchedEpisodeNumbers,
  saveLocalProgress,
  type ProgressPayload,
} from '../lib/localProgress'

interface UsePlayerDataReturn {
  state: PlayerState
  dispatch: React.Dispatch<Action>
  toggleWatchlist: () => Promise<void>
  moveToCompleted: () => Promise<void>
  setPreferredSource: (sourceName: string) => Promise<void>
  handleToggleDetails: () => Promise<void>
  recordEpisodeProgress: (
    episodeNumber: string,
    currentTime: number,
    duration?: number
  ) => Promise<void>
  markEpisodeWatched: (episodeNumber: string, duration: number) => Promise<void>
  isMarkingWatched: boolean
  isUpdatingWatchlistStatus: boolean
}

interface RawSkipInterval {
  skip_id?: string
  skip_type?: string
  interval?: {
    start_time: number
    end_time: number
  }
  start_time?: number
  end_time?: number
}

type ProgressShowMeta = Partial<DetailedShowMeta> & {
  name?: string
  thumbnail?: string
  type?: string
  score?: number
}

const getShowTitle = (showMeta: ProgressShowMeta, fallbackId?: string) => {
  return (
    showMeta.name ||
    showMeta.names?.romaji ||
    showMeta.names?.english ||
    showMeta.names?.native ||
    showMeta.title ||
    fallbackId ||
    'Unknown anime'
  )
}

const buildProgressPayload = ({
  showId,
  episodeNumber,
  currentTime,
  duration,
  showMeta,
  episodes,
}: {
  showId?: string
  episodeNumber: string
  currentTime: number
  duration?: number
  showMeta: ProgressShowMeta
  episodes: string[]
}): ProgressPayload => {
  const effectiveDuration = Math.max(duration || 0, (showMeta.lengthMin || 0) * 60, currentTime, 1)

  return {
    showId,
    episodeNumber,
    currentTime,
    duration: effectiveDuration,
    showName: getShowTitle(showMeta, showId),
    showThumbnail: showMeta.thumbnail,
    nativeName: showMeta.names?.native,
    englishName: showMeta.names?.english,
    genres: showMeta.genres?.map((genre) => genre.name),
    popularityScore: showMeta.score ?? showMeta.stats?.averageScore,
    type: showMeta.type,
    status: showMeta.status,
    episodeCount: episodes.length || showMeta.episodes,
  }
}

const fetchApi = async (url: string) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch ${url}`)
  return response.json()
}

export const usePlayerData = (
  showId: string | undefined,
  episodeNumber: string | undefined,
  twoEmbedSeasonOverride?: number
): UsePlayerDataReturn => {
  const [uiState, dispatch] = useReducer(playerReducer, undefined, createInitialState)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (episodeNumber && episodeNumber !== uiState.currentEpisode) {
      dispatch({ type: 'SET_CURRENT_EPISODE', payload: episodeNumber })
      dispatch({
        type: 'SET_STATE',
        payload: { selectedSource: null, selectedLink: null, showResumeModal: true },
      })
    }
  }, [episodeNumber, uiState.currentEpisode])

  const {
    data: showData,
    isLoading: loadingShowData,
    error: showDataError,
  } = useQuery({
    queryKey: ['show-data', showId, uiState.currentMode],
    queryFn: async () => {
      if (!showId) throw new Error('No showId')
      const [meta, selectedModeEpisodeData, watchlistStatus, watchedEpisodes] = await Promise.all([
        fetchApi(`/api/show-meta/${showId}`),
        fetchApi(`/api/episodes?showId=${showId}&mode=${uiState.currentMode}`).catch(() => null),
        fetchApi(`/api/watchlist/check/${showId}`).catch(() => ({ inWatchlist: false })),
        fetchApi(`/api/watched-episodes/${showId}`).catch(() => []),
      ])

      // Dubs may release later than subs, so use the complete episode numbering
      // for navigation while video loading still requests the selected mode.
      const selectedModeEpisodes = Array.isArray(selectedModeEpisodeData?.episodes)
        ? selectedModeEpisodeData.episodes
        : []
      const subEpisodes =
        uiState.currentMode === 'dub' && Array.isArray(meta?.availableEpisodesDetail?.sub)
          ? meta.availableEpisodesDetail.sub
          : []
      const episodes = Array.from(new Set([...selectedModeEpisodes, ...subEpisodes])).sort(
        (a: string, b: string) => parseFloat(a) - parseFloat(b)
      )

      const localWatchedEpisodes = getLocalWatchedEpisodeNumbers(showId)

      return {
        showMeta: {
          ...meta,
          description: selectedModeEpisodeData?.description || meta?.description,
          names: meta?.names || {
            romaji: meta?.name,
            english: meta?.englishName,
            native: meta?.nativeName,
          },
        },
        episodes,
        inWatchlist: watchlistStatus.inWatchlist,
        watchlistStatus: watchlistStatus.status ?? null,
        watchedEpisodes: Array.from(new Set([...watchedEpisodes, ...localWatchedEpisodes])),
      }
    },
    enabled: !!showId,
  })

  useEffect(() => {
    if (
      !episodeNumber &&
      showData?.episodes &&
      showData.episodes.length > 0 &&
      !uiState.currentEpisode
    ) {
      dispatch({ type: 'SET_CURRENT_EPISODE', payload: showData.episodes[0] })
    }
  }, [showData, episodeNumber, uiState.currentEpisode])

  const {
    data: videoData,
    isLoading: loadingVideo,
    error: videoError,
  } = useQuery({
    queryKey: [
      'video-sources',
      showId,
      uiState.currentEpisode,
      uiState.selectedProvider,
      uiState.currentMode,
      showData?.showMeta?.name,
      twoEmbedSeasonOverride,
    ],
    queryFn: async () => {
      if (!showId || !uiState.currentEpisode) throw new Error('Missing params')

      let providerShowId = showId
      let providerMatchFound = true
      if (['animepahe', '123anime', 'animeya', '2embed'].includes(uiState.selectedProvider)) {
        const names = showData?.showMeta?.names
        // AlAnime's `name` field is often the native Japanese script (e.g. "ブリーチ"
        // for Bleach), which gets mapped to names.romaji. Sending katakana/kanji to
        // other providers causes them to search for the transliteration ("Burichi")
        // and return no results. Guard against this by only using romaji when it is
        // pure ASCII, otherwise fall back to the English name.
        const isAscii = (s: string) => {
          for (let i = 0; i < s.length; i++) {
            if (s.charCodeAt(i) > 127) return false
          }
          return true
        }
        const romajiName = names?.romaji && isAscii(names.romaji) ? names.romaji : null
        const englishName =
          names?.english || showData?.showMeta?.englishName || showData?.showMeta?.name
        const titleCandidates = Array.from(
          new Set(
            [englishName, romajiName, showData?.showMeta?.name]
              .filter(
                (title): title is string => typeof title === 'string' && title.trim().length > 0
              )
              .map((title) => title.trim())
          )
        )
        const searchQuery = titleCandidates[0]

        if (searchQuery) {
          interface SearchResult {
            id: string
            session?: string
            name?: string
            title?: string
          }

          const fetchSearchResults = async (query: string): Promise<SearchResult[]> => {
            const searchParams = new URLSearchParams({
              query,
              provider: uiState.selectedProvider,
            })

            if (uiState.selectedProvider === '2embed') {
              const aliases = titleCandidates.filter((title) => title !== query)
              if (aliases.length) searchParams.set('aliases', aliases.join('|'))
              if (twoEmbedSeasonOverride) {
                searchParams.set('season', String(twoEmbedSeasonOverride))
              }
            }

            return (await fetchApi(`/api/search?${searchParams.toString()}`)) as SearchResult[]
          }

          const resultSets =
            uiState.selectedProvider === '2embed'
              ? [await fetchSearchResults(searchQuery)]
              : await Promise.all(titleCandidates.slice(0, 2).map(fetchSearchResults))
          const uniqueResults = new Map<string, SearchResult>()
          resultSets.flat().forEach((result) => {
            uniqueResults.set(result.session || result.id, result)
          })

          const normalizeTitle = (title: string) =>
            title
              .toLowerCase()
              .replace(/\bdub\b/g, ' ')
              .replace(/\b(\d+)(?:st|nd|rd|th)\s+season\b/g, 'season $1')
              .replace(/[^a-z0-9]+/g, ' ')
              .trim()
          const comparableTitles = titleCandidates.map(normalizeTitle).filter(Boolean)
          let bestMatch: SearchResult | undefined
          let bestScore = -Infinity

          for (const result of uniqueResults.values()) {
            const resultLabel = `${result.name || result.title || ''} ${result.id || ''}`
            const isDubResult = /\bdub\b/i.test(resultLabel.replace(/-/g, ' '))
            if (
              uiState.selectedProvider === '123anime' &&
              isDubResult !== (uiState.currentMode === 'dub')
            ) {
              continue
            }

            const normalizedResultTitle = normalizeTitle(result.name || result.title || '')
            const score = Math.max(
              ...comparableTitles.map((candidate) => {
                if (normalizedResultTitle === candidate) return 100
                if (
                  normalizedResultTitle.startsWith(candidate) ||
                  candidate.startsWith(normalizedResultTitle)
                ) {
                  return 60
                }
                if (
                  normalizedResultTitle.includes(candidate) ||
                  candidate.includes(normalizedResultTitle)
                ) {
                  return 40
                }

                const candidateTerms = new Set(
                  candidate.split(' ').filter((term) => term.length > 2)
                )
                const overlap = normalizedResultTitle
                  .split(' ')
                  .filter((term) => candidateTerms.has(term)).length
                return overlap * 10
              })
            )

            if (score > bestScore) {
              bestMatch = result
              bestScore = score
            }
          }

          const minimumScore = uiState.selectedProvider === '2embed' ? 40 : 100
          if (bestMatch && bestScore >= minimumScore) {
            providerShowId = bestMatch.session || bestMatch.id
          } else {
            providerMatchFound = false
          }
        } else {
          providerMatchFound = false
        }
      }

      const [sources, serverProgress, preferredSourceData, skipTimesData] = await Promise.all([
        providerMatchFound
          ? fetchApi(
              `/api/video?showId=${providerShowId}&episodeNumber=${uiState.currentEpisode}&mode=${uiState.currentMode}&provider=${uiState.selectedProvider}`
            )
          : Promise.resolve([]),
        fetchApi(`/api/episode-progress/${showId}/${uiState.currentEpisode}`).catch(() => null),
        fetchApi(`/api/settings?key=preferredSource`).catch(() => null),
        fetchApi(`/api/skip-times/${showId}/${uiState.currentEpisode}`).catch(() => []),
      ])

      const preferredSourceName = preferredSourceData?.value

      const pool = sources as VideoSource[]
      let sourceToSelect: VideoSource | null = pool.length > 0 ? pool[0] : null

      if (preferredSourceName) {
        const found = pool.find((s: VideoSource) => s.sourceName === preferredSourceName)
        if (found) sourceToSelect = found
      }

      const selectedLink =
        sourceToSelect && sourceToSelect.links.length > 0
          ? sourceToSelect.links.sort(
              (a: VideoLink, b: VideoLink) =>
                (parseInt(b.resolutionStr) || 0) - (parseInt(a.resolutionStr) || 0)
            )[0]
          : null

      const localProgress = getLocalEpisodeProgress(showId, uiState.currentEpisode)
      const progress =
        localProgress && localProgress.currentTime > (serverProgress?.currentTime || 0)
          ? localProgress
          : serverProgress
      const resumeTime = progress?.currentTime || 0
      const resumeDuration = progress?.duration || 0
      const rawSkips = Array.isArray(skipTimesData) ? skipTimesData : skipTimesData.results || []

      const skipIntervals: SkipInterval[] = rawSkips
        .map((item: RawSkipInterval) => ({
          skip_id: item.skip_id || '',
          skip_type: item.skip_type || '',
          start_time: item.interval?.start_time ?? item.start_time ?? 0,
          end_time: item.interval?.end_time ?? item.end_time ?? 0,
        }))
        .filter((i: SkipInterval) => i.end_time > 0)

      if (sources.length === 0) {
        toast.error(`No video sources found for ${uiState.selectedProvider}`)
      }

      return {
        videoSources: sources as VideoSource[],
        selectedSource: sourceToSelect,
        selectedLink,
        resumeTime,
        resumeDuration,
        showResumeModal: resumeTime > 5 && sourceToSelect?.type !== 'iframe',
        skipIntervals,
        fetchedEpisodeNumber: uiState.currentEpisode,
      }
    },
    enabled: !!showId && !!uiState.currentEpisode && !!showData?.showMeta?.name,
  })

  // 3. Additional Details Query
  const { data: detailsData, isLoading: loadingDetails } = useQuery({
    queryKey: ['show-details', showId],
    queryFn: () => fetchApi(`/api/show-details/${showId}`),
    enabled: !!showId && !!showData?.showMeta?.name,
  })

  const { mutateAsync: toggleWatchlistMutation } = useMutation({
    mutationFn: async ({ wasIn, showMeta }: { wasIn: boolean; showMeta: DetailedShowMeta }) => {
      const endpoint = wasIn ? '/api/watchlist/remove' : '/api/watchlist/add'
      const payload = {
        id: showId,
        name: showMeta.name || showMeta.names?.romaji,
        thumbnail: showMeta.thumbnail,
        nativeName: showMeta.names?.native,
        englishName: showMeta.names?.english,
        type: showMeta.type,
      }
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      return !wasIn
    },
    onSuccess: (newInWatchlist) => {
      toast.success(newInWatchlist ? 'Added to watchlist' : 'Removed from watchlist')
      queryClient.invalidateQueries({ queryKey: ['show-data', showId] })
      queryClient.invalidateQueries({ queryKey: ['watchlist'] })
    },
    onError: () => toast.error('Failed to update watchlist'),
  })

  const toggleWatchlist = useCallback(async () => {
    if (!showId || !showData?.showMeta) return
    await toggleWatchlistMutation({ wasIn: !!showData.inWatchlist, showMeta: showData.showMeta })
  }, [showId, showData, toggleWatchlistMutation])

  const setPreferredSource = useCallback(async (sourceName: string) => {
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'preferredSource', value: sourceName }),
      })
    } catch (e) {
      console.error(e)
    }
  }, [])

  const { mutateAsync: updateWatchlistStatusMutation, isPending: isUpdatingWatchlistStatus } =
    useMutation({
      mutationFn: async ({ status }: { status: string }) => {
        if (!showId) throw new Error('Missing showId')

        const response = await fetch('/api/watchlist/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: showId, status }),
        })

        if (!response.ok) {
          throw new Error('Failed to update watchlist status')
        }

        return status
      },
      onSuccess: (status) => {
        dispatch({ type: 'SET_STATE', payload: { inWatchlist: true, watchlistStatus: status } })
        toast.success(`Moved to ${status}`)
        queryClient.invalidateQueries({ queryKey: ['show-data', showId] })
        queryClient.invalidateQueries({ queryKey: ['watchlist'] })
        queryClient.invalidateQueries({ queryKey: ['continueWatchingFast'] })
        queryClient.invalidateQueries({ queryKey: ['continueWatchingUpNext'] })
        queryClient.invalidateQueries({ queryKey: ['allContinueWatching'] })
      },
      onError: () => toast.error('Failed to update watchlist status'),
    })

  const moveToCompleted = useCallback(async () => {
    await updateWatchlistStatusMutation({ status: 'Completed' })
  }, [updateWatchlistStatusMutation])

  const recordEpisodeProgress = useCallback(
    async (episodeNumber: string, currentTime: number, duration?: number) => {
      if (!showId || !showData?.showMeta || !episodeNumber || currentTime <= 0) return

      const payload = buildProgressPayload({
        showId,
        episodeNumber,
        currentTime,
        duration,
        showMeta: showData.showMeta,
        episodes: showData.episodes,
      })

      saveLocalProgress(payload)
      queryClient.invalidateQueries({ queryKey: ['show-data', showId] })
      queryClient.invalidateQueries({ queryKey: ['continueWatchingFast'] })
      queryClient.invalidateQueries({ queryKey: ['continueWatchingUpNext'] })
      queryClient.invalidateQueries({ queryKey: ['continueWatching'] })
      queryClient.invalidateQueries({ queryKey: ['allContinueWatching'] })

      const response = await fetch('/api/update-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => null)

      if (response && !response.ok) {
        console.warn('Progress was saved locally but the server did not accept the update.')
      }
    },
    [showId, showData, queryClient]
  )

  const { mutateAsync: markEpisodeWatchedMutation } = useMutation({
    mutationFn: async ({
      episodeNumber,
      duration,
      showMeta,
      episodes,
    }: {
      episodeNumber: string
      duration: number
      showMeta: ProgressShowMeta
      episodes: string[]
    }) => {
      const payload = buildProgressPayload({
        showId,
        episodeNumber,
        currentTime: Math.max(duration, 1),
        duration,
        showMeta,
        episodes,
      })

      saveLocalProgress(payload)

      const response = await fetch('/api/update-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => null)

      if (response && !response.ok) {
        console.warn('Progress was saved locally but the server did not accept the update.')
      }
    },
    onSuccess: (data, variables) => {
      toast.success(`Episode ${variables.episodeNumber} marked as watched`)
      queryClient.invalidateQueries({ queryKey: ['show-data', showId] })
      queryClient.invalidateQueries({
        queryKey: ['video-sources', showId, variables.episodeNumber],
      })
      queryClient.invalidateQueries({ queryKey: ['continueWatchingFast'] })
      queryClient.invalidateQueries({ queryKey: ['continueWatchingUpNext'] })
    },
    onError: () => toast.error('Failed to mark episode as watched'),
  })

  const markEpisodeWatched = useCallback(
    async (episodeNumber: string, duration: number) => {
      if (!showId || !showData?.showMeta) return
      await markEpisodeWatchedMutation({
        episodeNumber,
        duration,
        showMeta: showData.showMeta,
        episodes: showData.episodes,
      })
    },
    [showId, showData, markEpisodeWatchedMutation]
  )

  const handleToggleDetails = useCallback(async () => {
    dispatch({ type: 'SET_STATE', payload: { showCombinedDetails: !uiState.showCombinedDetails } })
    if (uiState.showCombinedDetails || uiState.allMangaDetails) return

    try {
      const data = await fetchApi(`/api/allmanga-details/${showId}`)
      dispatch({ type: 'SET_STATE', payload: { allMangaDetails: data } })
    } catch (e) {
      console.warn(e)
    }
  }, [showId, uiState.showCombinedDetails, uiState.allMangaDetails])

  // DERIVED STATE
  const state = useMemo(() => {
    const error = showDataError || videoError
    return {
      ...uiState,
      showMeta: {
        ...(showData?.showMeta || {}),
        ...(detailsData || {}),
        name: showData?.showMeta?.name, // Preserve original name
      },
      episodes: showData?.episodes || [],
      watchedEpisodes: showData?.watchedEpisodes || [],
      inWatchlist: !!showData?.inWatchlist,
      watchlistStatus: showData?.watchlistStatus ?? uiState.watchlistStatus ?? null,
      videoSources: videoData?.videoSources || [],
      selectedSource: uiState.selectedSource || videoData?.selectedSource || null,
      selectedLink: uiState.selectedLink || videoData?.selectedLink || null,
      resumeTime: videoData?.resumeTime || 0,
      resumeDuration: videoData?.resumeDuration || 0,
      showResumeModal: uiState.showResumeModal && (videoData?.showResumeModal ?? false),
      skipIntervals: videoData?.skipIntervals || [],
      loadingShowData,
      loadingVideo,
      loadingDetails,
      error: error ? (error as Error).message : null,
      fetchedEpisodeNumber: videoData?.fetchedEpisodeNumber,
    }
  }, [
    uiState,
    showData,
    videoData,
    detailsData,
    loadingShowData,
    loadingVideo,
    loadingDetails,
    showDataError,
    videoError,
  ])

  return {
    state: state as PlayerState,
    dispatch,
    toggleWatchlist,
    moveToCompleted,
    setPreferredSource,
    handleToggleDetails,
    recordEpisodeProgress,
    markEpisodeWatched,
    isMarkingWatched: markEpisodeWatchedMutation.isPending,
    isUpdatingWatchlistStatus,
  }
}
