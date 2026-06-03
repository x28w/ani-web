import React, { useRef, useEffect, useMemo, useCallback, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import styles from './Player.module.css'
import layoutStyles from './PlayerPageLayout.module.css'
import {
  FaCheck,
  FaPlus,
  FaChevronDown,
  FaChevronUp,
  FaBackward,
  FaForward,
  FaExpand,
  FaCompress,
  FaListUl,
  FaStepBackward,
  FaStepForward,
} from 'react-icons/fa'
import PlayerRelatedShows from '../components/player/PlayerRelatedShows'
import { useWatchQueue } from '../contexts/WatchQueueContext'
import { resolveShowId } from '../lib/showId'
import { fixThumbnailUrl } from '../lib/utils'
import ResumeModal from '../components/common/ResumeModal'
import useIsMobile from '../hooks/useIsMobile'
import type Hls from 'hls.js'
import { useTitlePreference } from '../contexts/TitlePreferenceContext'
import PlayerControls from '../components/player/PlayerControls'
import EpisodeList from '../components/player/EpisodeList'
import SourceSelector from '../components/player/SourceSelector'
import { ProviderSelector } from '../components/player/SourceSelector'
import useVideoPlayer from '../hooks/useVideoPlayer'
import { usePlayerData } from '../hooks/usePlayerData'
import type { VideoLink, SubtitleTrack } from '../types/player'

const ensureHttpProtocol = (url: string): string => {
  if (!url) return url
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }
  return `https://${url}`
}

const TWO_EMBED_SEASON_KEY_PREFIX = 'ani-web:2embed-season:'
const IFRAME_WATCH_INTERVAL_MS = 15000

const readTwoEmbedSeasonOverride = (showId: string | undefined): number | undefined => {
  if (!showId) return undefined
  const season = Number(localStorage.getItem(`${TWO_EMBED_SEASON_KEY_PREFIX}${showId}`))
  return Number.isInteger(season) && season >= 1 && season <= 99 ? season : undefined
}

const Player: React.FC = () => {
  const { id: showId, episodeNumber } = useParams<{ id: string; episodeNumber?: string }>()
  const navigate = useNavigate()
  const [twoEmbedSeasonOverride, setTwoEmbedSeasonOverride] = useState<number | undefined>(() =>
    readTwoEmbedSeasonOverride(showId)
  )

  useEffect(() => {
    setTwoEmbedSeasonOverride(readTwoEmbedSeasonOverride(showId))
  }, [showId])

  const {
    state,
    dispatch,
    toggleWatchlist,
    moveToCompleted,
    setPreferredSource,
    handleToggleDetails,
    recordEpisodeProgress,
    markEpisodeWatched,
    isMarkingWatched,
    isUpdatingWatchlistStatus,
  } = usePlayerData(showId, episodeNumber, twoEmbedSeasonOverride)

  const handleTwoEmbedSeasonChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    if (!showId) return
    const key = `${TWO_EMBED_SEASON_KEY_PREFIX}${showId}`
    if (event.target.value === 'auto') {
      localStorage.removeItem(key)
      setTwoEmbedSeasonOverride(undefined)
    } else {
      const season = Number(event.target.value)
      localStorage.setItem(key, String(season))
      setTwoEmbedSeasonOverride(season)
    }
    dispatch({
      type: 'SET_STATE',
      payload: {
        videoSources: [],
        selectedSource: null,
        selectedLink: null,
        loadingVideo: true,
      },
    })
  }

  const memoizedShowMeta = useMemo(() => {
    if (!state.showMeta.name) return undefined
    return {
      name: state.showMeta.name,
      thumbnail: state.showMeta.thumbnail,
      names: state.showMeta.names,
      genres: state.showMeta.genres,
      score: state.showMeta.score,
      type: state.showMeta.type,
      status: state.showMeta.status,
      episodeCount: state.episodes.length || state.showMeta.episodes,
      lengthMin: state.showMeta.lengthMin,
    }
  }, [
    state.showMeta.name,
    state.showMeta.thumbnail,
    state.showMeta.names,
    state.showMeta.genres,
    state.showMeta.score,
    state.showMeta.type,
    state.showMeta.status,
    state.showMeta.episodes,
    state.showMeta.lengthMin,
    state.episodes.length,
  ])

  const player = useVideoPlayer({
    skipIntervals: state.skipIntervals,
    showId,
    episodeNumber: state.currentEpisode?.toString(),
    showMeta: memoizedShowMeta,
  })
  const { refs, actions } = player

  const hlsInstance = useRef<Hls | null>(null)
  const isMobile = useIsMobile()
  const { add: addToQueue, isQueued, remove: removeFromQueue } = useWatchQueue()
  const showIdResolved = resolveShowId({ id: showId, _id: showId })
  const inQueue = showIdResolved ? isQueued(showIdResolved) : false
  const [theaterMode, setTheaterMode] = useState(() => {
    try {
      return localStorage.getItem('ani-web:theater-mode') === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    localStorage.setItem('ani-web:theater-mode', String(theaterMode))
  }, [theaterMode])
  const rafIdRef = useRef<number | null>(null)
  const seekToTimeRef = useRef<number>(0)
  const resumeTimeRef = useRef(state.resumeTime)
  const showResumeModalRef = useRef(state.showResumeModal)
  const recordedStartRef = useRef<string | null>(null)

  useEffect(() => {
    resumeTimeRef.current = state.resumeTime
    showResumeModalRef.current = state.showResumeModal
  }, [state.resumeTime, state.showResumeModal])

  useEffect(() => {
    if (
      !showId ||
      !state.currentEpisode ||
      !state.selectedSource ||
      state.loadingShowData ||
      state.loadingVideo ||
      !state.showMeta.name
    ) {
      return
    }

    const selectedLinkKey = state.selectedLink?.link || state.selectedSource.sourceName
    const recordKey = `${showId}:${state.currentEpisode}:${state.selectedProvider}:${selectedLinkKey}`
    if (recordedStartRef.current === recordKey) return
    recordedStartRef.current = recordKey

    const fallbackDuration = Math.max(
      state.resumeDuration || 0,
      (state.showMeta.lengthMin || 0) * 60,
      1
    )
    const startTime = Math.max(state.resumeTime || 1, 1)
    recordEpisodeProgress(state.currentEpisode, startTime, fallbackDuration)
  }, [
    showId,
    state.currentEpisode,
    state.selectedSource,
    state.selectedLink,
    state.selectedProvider,
    state.loadingShowData,
    state.loadingVideo,
    state.showMeta.name,
    state.showMeta.lengthMin,
    state.resumeTime,
    state.resumeDuration,
    recordEpisodeProgress,
  ])

  useEffect(() => {
    if (
      !showId ||
      !state.currentEpisode ||
      state.loadingVideo ||
      state.selectedSource?.type !== 'iframe'
    ) {
      return
    }

    let lastTick = Date.now()
    const recordVisibleWatchTime = () => {
      const now = Date.now()
      const elapsedSeconds = Math.min(30, Math.round((now - lastTick) / 1000))
      lastTick = now

      if (document.visibilityState !== 'visible' || elapsedSeconds <= 0) return

      fetch('/api/record-watch-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          showId,
          episodeNumber: state.currentEpisode,
          seconds: elapsedSeconds,
        }),
        keepalive: true,
      }).catch(() => {})
    }

    const intervalId = window.setInterval(recordVisibleWatchTime, IFRAME_WATCH_INTERVAL_MS)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        recordVisibleWatchTime()
      } else {
        lastTick = Date.now()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      recordVisibleWatchTime()
    }
  }, [showId, state.currentEpisode, state.loadingVideo, state.selectedSource?.type])

  const [skipIndicator, setSkipIndicator] = useState<{
    side: 'left' | 'right'
    visible: boolean
  } | null>(null)
  const [showNextEpisodePrompt, setShowNextEpisodePrompt] = useState(false)
  const [hasReachedEpisodeEnd, setHasReachedEpisodeEnd] = useState(false)
  const clickCountRef = useRef(0)
  const clickTimerRef = useRef<NodeJS.Timeout | null>(null)

  const handlePlayerClick = useCallback(
    (e: React.MouseEvent) => {
      actions.setShowControls(true)

      const container = refs.playerContainerRef.current
      if (!container) return

      const { clientX } = e
      const { left, width } = container.getBoundingClientRect()
      const relativeX = clientX - left

      clickCountRef.current += 1

      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current)
      }

      clickTimerRef.current = setTimeout(() => {
        if (clickCountRef.current === 2) {
          if (relativeX < width * 0.3) {
            actions.seek(-15)
            setSkipIndicator({ side: 'left', visible: true })
            setTimeout(() => setSkipIndicator(null), 600)
          } else if (relativeX > width * 0.7) {
            actions.seek(15)
            setSkipIndicator({ side: 'right', visible: true })
            setTimeout(() => setSkipIndicator(null), 600)
          } else {
            actions.toggleFullscreen()
          }
        }
        clickCountRef.current = 0
      }, 300)
    },
    [actions, refs.playerContainerRef]
  )

  useEffect(() => {
    const videoElement = refs.videoRef.current
    if (!videoElement) return

    if (hlsInstance.current) {
      hlsInstance.current.destroy()
    }

    if (state.loadingVideo || state.selectedSource) {
      videoElement.pause()
      videoElement.removeAttribute('src')
      videoElement.load()
    }

    while (videoElement.firstChild) {
      videoElement.removeChild(videoElement.firstChild)
    }

    if (!state.selectedSource || !state.selectedLink) return

    if (state.selectedSource.type === 'iframe') {
      seekToTimeRef.current = 0
      return
    }

    if (resumeTimeRef.current > 5 && !showResumeModalRef.current) {
      seekToTimeRef.current = resumeTimeRef.current
    } else if (showResumeModalRef.current) {
      seekToTimeRef.current = 0
    }

    let proxiedUrl = `/api/proxy?url=${encodeURIComponent(state.selectedLink.link)}`
    if (state.selectedLink.headers?.Referer) {
      proxiedUrl += `&referer=${encodeURIComponent(state.selectedLink.headers.Referer)}`
    }

    if (state.selectedSource.subtitles) {
      state.selectedSource.subtitles.forEach((sub) => {
        const track = document.createElement('track')
        track.kind = 'subtitles'
        track.label = sub.label
        track.srclang = sub.lang

        const subSrc = sub.src ?? sub.url
        if (subSrc) {
          let subUrl = `/api/subtitle-proxy?url=${encodeURIComponent(subSrc)}`
          if (state.selectedLink?.headers?.Referer) {
            subUrl += `&referer=${encodeURIComponent(state.selectedLink.headers.Referer)}`
          }
          track.src = subUrl
        }

        if (sub.lang === 'en' || sub.label === 'English') {
          track.default = true
        }
        videoElement.appendChild(track)
      })
      actions.setAvailableSubtitles(state.selectedSource.subtitles)
    }

    const targetTime = seekToTimeRef.current
    seekToTimeRef.current = 0

    const handleLoaded = () => {
      if (targetTime > 0) {
        videoElement.currentTime = targetTime
      }
    }
    videoElement.addEventListener('loadedmetadata', handleLoaded, { once: true })

    if (state.selectedLink.hls) {
      const canPlayNativeHls =
        videoElement.canPlayType('application/vnd.apple.mpegurl') ||
        videoElement.canPlayType('application/x-mpegURL')

      if (canPlayNativeHls) {
        videoElement.src = proxiedUrl
      } else {
        import('hls.js/dist/hls.light.mjs').then((module) => {
          const Hls = module.default
          if (Hls.isSupported()) {
            const isLowEnd = document.body.classList.contains('low-end')
            const hls = new Hls({
              maxBufferLength: isLowEnd ? 15 : 30,
              maxMaxBufferLength: isLowEnd ? 30 : 60,
              maxBufferSize: isLowEnd ? 25 * 1000 * 1000 : 60 * 1000 * 1000,
              startLevel: -1,
              enableWorker: true,
            })
            hlsInstance.current = hls
            hls.loadSource(proxiedUrl)
            hls.attachMedia(videoElement)
          } else {
            videoElement.src = proxiedUrl
          }
        })
      }
    } else {
      videoElement.src = proxiedUrl
    }

    const savedVolume = localStorage.getItem('playerVolume')
    const savedMuted = localStorage.getItem('playerMuted')

    if (savedVolume !== null) {
      videoElement.volume = parseFloat(savedVolume)
    }
    if (savedMuted !== null) {
      videoElement.muted = savedMuted === 'true'
    }

    const shouldAutoPlay = !(showResumeModalRef.current && resumeTimeRef.current > 5)
    if (shouldAutoPlay) {
      videoElement.play().catch((error) => {
        console.warn('Autoplay was prevented:', error)
        actions.setShowControls(true)
      })
    }

    return () => {
      videoElement.removeEventListener('loadedmetadata', handleLoaded)
      if (hlsInstance.current) {
        hlsInstance.current.destroy()
      }
    }
  }, [state.selectedSource, state.selectedLink, refs.videoRef, actions, state.loadingVideo])

  // Sync URL if provider reports a different actual episode number (e.g. 0 -> 1 fallback)
  useEffect(() => {
    if (state.loadingVideo) return
    const actualEp = state.selectedSource?.actualEpisodeNumber
    const fetchedEp = state.fetchedEpisodeNumber

    // Only sync if the data we are looking at actually belongs to the episode in the URL
    if (actualEp && episodeNumber && fetchedEp === episodeNumber && actualEp !== episodeNumber) {
      console.log(`[Sync] Redirecting from episode ${episodeNumber} to ${actualEp}`)
      navigate(`/watch/${showId}/${actualEp}`, { replace: true })
      dispatch({ type: 'SET_CURRENT_EPISODE', payload: actualEp })
    }
  }, [
    state.selectedSource?.actualEpisodeNumber,
    state.fetchedEpisodeNumber,
    episodeNumber,
    showId,
    navigate,
    dispatch,
    state.loadingVideo,
  ])

  useEffect(() => {
    const videoElement = refs.videoRef.current
    if (!videoElement) return
    const handleVideoEnd = () => {
      actions.onEnded()
      if (state.isAutoplayEnabled) {
        const currentIndex = state.episodes.findIndex((ep) => ep === state.currentEpisode)
        if (currentIndex > -1 && currentIndex < state.episodes.length - 1) {
          const nextEpisode = state.episodes[currentIndex + 1]
          navigate(`/watch/${showId}/${nextEpisode}`)
        }
      }
    }
    videoElement.addEventListener('ended', handleVideoEnd)
    return () => {
      if (videoElement) {
        videoElement.removeEventListener('ended', handleVideoEnd)
      }
    }
  }, [
    state.isAutoplayEnabled,
    state.episodes,
    state.currentEpisode,
    showId,
    navigate,
    refs.videoRef,
    actions,
    player.state.isFullscreen,
  ])

  useEffect(() => {
    if (state.showResumeModal && player.state.isFullscreen) {
      player.actions.toggleFullscreen()
    }
  }, [state.showResumeModal, player.state.isFullscreen, player.actions])

  useEffect(() => {
    if (state.showResumeModal && refs.videoRef.current) {
      refs.videoRef.current.pause()
    }
  }, [state.showResumeModal, refs.videoRef])

  const { titlePreference } = useTitlePreference()
  const displayTitle = useMemo(() => {
    if (!state.showMeta || state.loadingShowData) return 'Loading...'
    const { name, names } = state.showMeta
    if (titlePreference === 'name' && name) return name
    if (titlePreference === 'nativeName' && names?.native) return names.native
    if (titlePreference === 'englishName' && names?.english) return names.english
    return name || 'Loading...'
  }, [state.showMeta, titlePreference, state.loadingShowData])

  useEffect(() => {
    if (displayTitle && displayTitle !== 'Loading...' && state.currentEpisode) {
      document.title = `► ${displayTitle} #${state.currentEpisode} - ani-web`
    }
  }, [displayTitle, state.currentEpisode])

  const handleMouseMove = useCallback(() => {
    const container = refs.playerContainerRef.current
    if (!container) return

    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(() => {
        actions.setShowControls(true)
        container.style.cursor = 'default'

        if (player.actions.inactivityTimer.current) {
          clearTimeout(player.actions.inactivityTimer.current)
        }

        if (player.state.isPlaying) {
          player.actions.inactivityTimer.current = window.setTimeout(() => {
            actions.setShowControls(false)
            if (player.state.isFullscreen) {
              container.style.cursor = 'none'
            }
          }, 1000)
        }
        rafIdRef.current = null
      })
    }
  }, [
    player.state.isPlaying,
    player.state.isFullscreen,
    actions,
    player.actions,
    refs.playerContainerRef,
  ])

  useEffect(() => {
    const container = refs.playerContainerRef.current
    if (container) {
      container.addEventListener('mousemove', handleMouseMove)
      return () => container.removeEventListener('mousemove', handleMouseMove)
    }
  }, [handleMouseMove, refs.playerContainerRef])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) {
        actions.setShowControls(true)
        if (player.actions.inactivityTimer.current) {
          clearTimeout(player.actions.inactivityTimer.current)
        }
        player.actions.inactivityTimer.current = window.setTimeout(() => {
          actions.setShowControls(false)
        }, 1000)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [actions, player.actions.inactivityTimer])

  const { setIsFullscreen, setAvailableSubtitles, setActiveSubtitleTrack } = actions

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [setIsFullscreen])

  useEffect(() => {
    const videoElement = refs.videoRef.current
    if (!videoElement) return
    const handleTracksChange = () => {
      const tracks: SubtitleTrack[] = Array.from(videoElement.textTracks).map((t) => ({
        label: t.label,
        lang: t.language,
        src: undefined,
        mode: t.mode as 'showing' | 'hidden' | 'disabled',
      }))
      setAvailableSubtitles(tracks)
    }
    videoElement.textTracks.addEventListener('addtrack', handleTracksChange)
    videoElement.textTracks.addEventListener('removetrack', handleTracksChange)
    handleTracksChange()
    return () => {
      if (videoElement) {
        videoElement.textTracks.removeEventListener('addtrack', handleTracksChange)
        videoElement.textTracks.removeEventListener('removetrack', handleTracksChange)
      }
    }
  }, [refs.videoRef, setAvailableSubtitles])

  useEffect(() => {
    if (player.state.activeSubtitleTrack === null && player.state.availableSubtitles.length > 0) {
      const englishTrack = player.state.availableSubtitles.find(
        (t) => t.lang === 'en' || t.label === 'English'
      )
      const trackToActivate = englishTrack || player.state.availableSubtitles[0]
      setActiveSubtitleTrack(trackToActivate.lang || trackToActivate.label)

      const video = refs.videoRef.current
      if (video) {
        Array.from(video.textTracks).forEach((t) => {
          t.mode =
            t.language === trackToActivate.lang || t.label === trackToActivate.label
              ? 'showing'
              : 'hidden'
        })
      }
    }
  }, [
    player.state.activeSubtitleTrack,
    player.state.availableSubtitles,
    setActiveSubtitleTrack,
    refs.videoRef,
  ])

  useEffect(() => {
    const styleId = 'dynamic-subtitle-styles'
    let styleTag = document.getElementById(styleId)
    if (!styleTag) {
      styleTag = document.createElement('style')
      styleTag.id = styleId
      document.head.appendChild(styleTag)
    }

    const fontSize = `${player.state.subtitleFontSize}rem`

    styleTag.textContent = `
  video::cue {
    font-size: ${fontSize} !important;
    background-color: rgba(0, 0, 0, 0.5) !important;
    color: white !important;
    text-shadow: 0 0 4px black;
  }
  `

    const video = refs.videoRef.current
    if (!video) return

    const updateCuePosition = () => {
      const activeTrack = Array.from(video.textTracks).find((t) => t.mode === 'showing')
      if (activeTrack && activeTrack.cues) {
        Array.from(activeTrack.cues).forEach((cue: unknown) => {
          try {
            const vttCue = cue as { snapToLines?: boolean; line?: number }
            vttCue.snapToLines = false
            const pos = Math.max(0, Math.min(100, 100 - player.state.subtitlePosition))
            vttCue.line = pos
          } catch (e) {
            // Ignore error
          }
        })
      }
    }

    updateCuePosition()

    const handleCueChange = () => {
      updateCuePosition()
    }

    const activeTrack = Array.from(video.textTracks).find((t) => t.mode === 'showing')
    if (activeTrack) {
      activeTrack.addEventListener('cuechange', handleCueChange)
    }

    return () => {
      if (activeTrack) {
        activeTrack.removeEventListener('cuechange', handleCueChange)
      }
      const tag = document.getElementById(styleId)
      if (tag) {
        tag.remove()
      }
    }
  }, [
    player.state.subtitleFontSize,
    player.state.subtitlePosition,
    player.state.activeSubtitleTrack,
    refs.videoRef,
  ])

  const handleResume = () => {
    if (refs.videoRef.current) {
      refs.videoRef.current.currentTime = state.resumeTime
      refs.videoRef.current.play()
    }
    dispatch({ type: 'SET_STATE', payload: { showResumeModal: false } })
  }

  const handleStartOver = () => {
    if (refs.videoRef.current) {
      refs.videoRef.current.currentTime = 0
      refs.videoRef.current.play()
    }
    dispatch({ type: 'SET_STATE', payload: { showResumeModal: false } })
  }

  const handleNextEpisode = () => {
    const currentIndex = state.episodes.findIndex((ep) => ep === state.currentEpisode)
    if (currentIndex > -1 && currentIndex < state.episodes.length - 1) {
      const nextEpisode = state.episodes[currentIndex + 1]
      navigate(`/watch/${showId}/${nextEpisode}`)
    }
    dispatch({ type: 'SET_STATE', payload: { showResumeModal: false } })
  }

  const hasNextEpisode = (() => {
    const currentIndex = state.episodes.findIndex((ep) => ep === state.currentEpisode)
    return currentIndex > -1 && currentIndex < state.episodes.length - 1
  })()

  const isLastEpisode =
    state.episodes.length > 0 &&
    !!state.currentEpisode &&
    state.episodes[state.episodes.length - 1] === state.currentEpisode
  const normalizedShowStatus = (state.showMeta.status || '').trim().toLowerCase()
  const isFinishedShow = ['finished', 'completed', 'complete', 'ended'].some((status) =>
    normalizedShowStatus.includes(status)
  )
  const canMoveToCompleted =
    state.inWatchlist &&
    state.watchlistStatus === 'Watching' &&
    isLastEpisode &&
    isFinishedShow &&
    hasReachedEpisodeEnd

  const isCompleted =
    state.resumeTime > 0 &&
    state.resumeDuration > 0 &&
    state.resumeTime >= state.resumeDuration * 0.8

  const handleAutoplayChange = (checked: boolean) => {
    dispatch({ type: 'SET_STATE', payload: { isAutoplayEnabled: checked } })
    localStorage.setItem('autoplayEnabled', checked.toString())
  }

  const isCurrentEpisodeWatched = !!(
    state.currentEpisode && state.watchedEpisodes.includes(state.currentEpisode)
  )
  const showManualWatchedButton =
    state.selectedProvider !== 'allanime' || state.selectedSource?.type === 'iframe'

  useEffect(() => {
    const videoElement = refs.videoRef.current

    setShowNextEpisodePrompt(false)
    setHasReachedEpisodeEnd(false)

    if (!videoElement || state.selectedSource?.type === 'iframe') return

    const handleThresholds = () => {
      const duration = videoElement.duration
      const currentTime = videoElement.currentTime

      if (!duration || Number.isNaN(duration)) {
        setShowNextEpisodePrompt(false)
        setHasReachedEpisodeEnd(false)
        return
      }

      const progress = currentTime / duration
      setShowNextEpisodePrompt(hasNextEpisode && progress >= 0.8)
      setHasReachedEpisodeEnd(currentTime >= Math.max(duration * 0.98, duration - 10))
    }

    handleThresholds()
    videoElement.addEventListener('timeupdate', handleThresholds)
    videoElement.addEventListener('loadedmetadata', handleThresholds)

    return () => {
      videoElement.removeEventListener('timeupdate', handleThresholds)
      videoElement.removeEventListener('loadedmetadata', handleThresholds)
    }
  }, [refs.videoRef, hasNextEpisode, state.currentEpisode, state.selectedSource])

  const handleMarkEpisodeWatched = useCallback(async () => {
    if (!showId || !state.currentEpisode || !state.showMeta.name || isMarkingWatched) return

    const videoDuration = refs.videoRef.current?.duration
    const fallbackDuration = Math.max(
      videoDuration || 0,
      state.resumeDuration || 0,
      (state.showMeta.lengthMin || 0) * 60,
      1
    )

    await markEpisodeWatched(state.currentEpisode, fallbackDuration)
  }, [
    showId,
    state.currentEpisode,
    state.showMeta,
    state.resumeDuration,
    markEpisodeWatched,
    isMarkingWatched,
    refs.videoRef,
  ])

  if (state.error) return <p className="error-message">Error: {state.error}</p>
  if (!state.loadingShowData && !state.showMeta.name) return <p>Show not found.</p>

  const isVideoLoading = state.loadingShowData || state.loadingVideo
  const showNativePlayer = state.forceNativePlayer || isMobile
  const totalEpisodes = state.episodes.length
  const watchedCount = state.watchedEpisodes.length
  const watchPercent =
    totalEpisodes > 0 ? Math.min(100, Math.round((watchedCount / totalEpisodes) * 100)) : 0

  const ambientBackdrop = state.showMeta.thumbnail
    ? fixThumbnailUrl(state.showMeta.thumbnail, 400, 600)
    : undefined

  return (
    <div
      className={`${layoutStyles.playerPageLayout} ${theaterMode ? layoutStyles.theaterMode : ''}`}
      style={
        ambientBackdrop
          ? ({ '--player-ambient': `url(${ambientBackdrop})` } as React.CSSProperties)
          : undefined
      }
    >
      <ResumeModal
        show={state.showResumeModal}
        resumeTime={player.actions.formatTime(state.resumeTime)}
        onResume={handleResume}
        onStartOver={handleStartOver}
        onNextEpisode={handleNextEpisode}
        hasNextEpisode={hasNextEpisode}
        isCompleted={isCompleted}
      />

      <aside className={layoutStyles.episodeSidebar}>
        {!state.loadingShowData && totalEpisodes > 0 && (
          <div className={layoutStyles.episodeSidebarHead}>
            <h2>Episodes</h2>
            <div className={layoutStyles.watchProgressLabel}>
              <span>Series progress</span>
              <strong>
                {watchedCount}/{totalEpisodes}
              </strong>
            </div>
            <div className={layoutStyles.progressTrack} aria-hidden>
              <div
                className={layoutStyles.progressFill}
                style={{ width: `${watchPercent}%` }}
              />
            </div>
          </div>
        )}
        {state.loadingShowData ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading Episodes...
          </div>
        ) : (
          <EpisodeList
            compact
            episodes={state.episodes}
            currentEpisode={state.currentEpisode}
            watchedEpisodes={state.watchedEpisodes}
            onEpisodeClick={(ep) => navigate(`/watch/${showId}/${ep}`)}
          />
        )}
      </aside>

      <div className={layoutStyles.playerMain}>
        <div
          ref={refs.playerContainerRef}
          className={`${styles.videoContainer} ${!player.state.isFullscreen ? layoutStyles.videoPlayerWrapper : ''} ${player.state.isFullscreen ? styles.fullscreenActive : ''}`}
          onClick={handlePlayerClick}
          style={{
            ...(state.showResumeModal ? { visibility: 'hidden' } : {}),
          }}
        >
          {skipIndicator && (
            <div
              className={`${styles.skipIndicatorContainer} ${skipIndicator.side === 'left' ? styles.leftSkip : styles.rightSkip} `}
            >
              <div className={styles.skipBubble}>
                <div className={styles.skipIcon}>
                  {skipIndicator.side === 'left' ? <FaBackward /> : <FaForward />}
                </div>
                <div className={styles.skipText}>15s</div>
              </div>
            </div>
          )}

          {player.state.isSpeedBoostActive && (
            <div className={styles.speedBoostBadge} aria-hidden="true">
              <span>2x</span>
              <FaForward size={12} />
            </div>
          )}

          {isVideoLoading && (
            <div className={styles.loadingOverlay}>
              <div className={styles.loadingDots}>
                <div className={styles.dot}></div>
                <div className={styles.dot}></div>
                <div className={styles.dot}></div>
              </div>
            </div>
          )}

          {player.state.isBuffering && !isVideoLoading && (
            <div className={styles.bufferingOverlay}>
              <div className={styles.bufferingSpinner}></div>
            </div>
          )}

          {state.selectedSource?.type === 'iframe' ? (
            !isVideoLoading && (
              <iframe
                src={state.selectedLink?.link}
                className={styles.videoIframe}
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
                sandbox={
                  state.selectedSource.sandbox
                    ? `${state.selectedSource.sandbox} allow-fullscreen allow-popups allow-popups-to-escape-sandbox`
                    : undefined
                }
              ></iframe>
            )
          ) : (
            <>
              {!isVideoLoading && state.videoSources.length === 0 && (
                <div className={styles.errorOverlay}>
                  <p>No sources found for this episode with {state.selectedProvider}.</p>
                  <p className={styles.errorSubtext}>
                    Please try selecting a different provider below.
                  </p>
                  <button
                    className={styles.retryButton}
                    onClick={() => window.location.reload()}
                    data-speed-boost-ignore="true"
                  >
                    Retry
                  </button>
                </div>
              )}
              {!isVideoLoading && state.videoSources.length > 0 && !showNativePlayer && (
                <PlayerControls
                  player={player}
                  isAutoplayEnabled={state.isAutoplayEnabled}
                  onAutoplayChange={handleAutoplayChange}
                  showNextEpisodeButton={!state.showResumeModal && showNextEpisodePrompt}
                  onNextEpisode={handleNextEpisode}
                  onPrevEpisode={() => {
                    const currentIndex = state.episodes.findIndex((ep) => ep === state.currentEpisode)
                    if (currentIndex > 0) {
                      navigate(`/watch/${showId}/${state.episodes[currentIndex - 1]}`)
                    }
                  }}
                  hasPrevEpisode={(() => {
                    const currentIndex = state.episodes.findIndex((ep) => ep === state.currentEpisode)
                    return currentIndex > 0
                  })()}
                  hasNextEpisode={hasNextEpisode}
                  videoSources={state.videoSources}
                  selectedSource={state.selectedSource}
                  selectedLink={state.selectedLink}
                  onSourceChange={(source, link) => {
                    if (refs.videoRef.current && !isNaN(refs.videoRef.current.currentTime)) {
                      seekToTimeRef.current = refs.videoRef.current.currentTime
                    }
                    setPreferredSource(source.sourceName)
                    dispatch({
                      type: 'SET_STATE',
                      payload: {
                        selectedSource: source,
                        selectedLink: link,
                        showResumeModal: state.showResumeModal && source.type !== 'iframe',
                      },
                    })
                  }}
                  loadingVideo={state.loadingVideo}
                  skipIntervals={state.skipIntervals}
                />
              )}

              {!isVideoLoading && state.videoSources.length > 0 && (
                <video
                  ref={refs.videoRef}
                  controls={showNativePlayer}
                  onPlay={actions.onPlay}
                  onPause={actions.onPause}
                  onLoadedMetadata={actions.onLoadedMetadata}
                  onTimeUpdate={actions.onTimeUpdate}
                  onProgress={actions.onProgress}
                  onVolumeChange={actions.onVolumeChange}
                  onWaiting={actions.onWaiting}
                  onPlaying={actions.onPlaying}
                />
              )}
            </>
          )}
        </div>

        {!isMobile && state.selectedSource?.type !== 'iframe' && (
          <div className={layoutStyles.playerShortcuts}>
            <span>
              <kbd>Space</kbd> play/pause
            </span>
            <span>
              <kbd>←</kbd>
              <kbd>→</kbd> ±15s
            </span>
            <span>
              <kbd>F</kbd> fullscreen
            </span>
            {hasNextEpisode && (
              <span>
                <kbd>N</kbd> next ep
              </span>
            )}
          </div>
        )}

        <ProviderSelector
          selectedProvider={state.selectedProvider}
          onProviderChange={(newProvider) => {
            dispatch({
              type: 'SET_STATE',
              payload: {
                selectedProvider: newProvider,
                videoSources: [],
                selectedSource: null,
                selectedLink: null,
                loadingVideo: true,
              },
            })
            localStorage.setItem('preferredProvider', newProvider)
          }}
        />

        {state.selectedProvider === '2embed' && (
          <div className={styles.providerSelectContainer}>
            <h4>Season Match</h4>
            <select
              aria-label="2Embed season match"
              className={styles.providerSelect}
              value={twoEmbedSeasonOverride ? String(twoEmbedSeasonOverride) : 'auto'}
              onChange={handleTwoEmbedSeasonChange}
            >
              <option value="auto">Auto detect</option>
              {Array.from({ length: 20 }, (_, index) => {
                const season = String(index + 1)
                return (
                  <option key={season} value={season}>
                    Season {season}
                  </option>
                )
              })}
            </select>
          </div>
        )}

        {isVideoLoading ? (
          <div className={styles.sourceLoader}>
            <div className={styles.spinner}></div>
          </div>
        ) : (
          <>
            <SourceSelector
              videoSources={state.videoSources}
              selectedSource={state.selectedSource}
              onSourceChange={(source) => {
                if (refs.videoRef.current && !isNaN(refs.videoRef.current.currentTime)) {
                  seekToTimeRef.current = refs.videoRef.current.currentTime
                }

                const links = source.links || []
                const bestLink =
                  links.sort(
                    (a: VideoLink, b: VideoLink) =>
                      (parseInt(b.resolutionStr) || 0) - (parseInt(a.resolutionStr) || 0)
                  )[0] || null

                setPreferredSource(source.sourceName)
                dispatch({
                  type: 'SET_STATE',
                  payload: {
                    selectedSource: source,
                    selectedLink: bestLink,
                    showResumeModal: state.showResumeModal && source.type !== 'iframe',
                  },
                })
              }}
            />
            {showNativePlayer && state.selectedSource && state.selectedSource.links.length > 1 && (
              <div className={styles.sourceSelectionContainer} style={{ marginTop: '1rem' }}>
                <h4>Resolution</h4>
                <div className={styles.sourceButtons}>
                  {state.selectedSource.links
                    .sort(
                      (a: VideoLink, b: VideoLink) =>
                        (parseInt(b.resolutionStr) || 0) - (parseInt(a.resolutionStr) || 0)
                    )
                    .map((link) => (
                      <button
                        key={link.resolutionStr}
                        className={`${styles.sourceButton} ${state.selectedLink?.resolutionStr === link.resolutionStr ? styles.active : ''}`}
                        onClick={() =>
                          dispatch({ type: 'SET_STATE', payload: { selectedLink: link } })
                        }
                      >
                        {link.resolutionStr}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className={layoutStyles.playerInfoContainer}>
          <div className={layoutStyles.playerInfoHeader}>
            <div className={layoutStyles.playerAnimeCard}>
              <img
                src={fixThumbnailUrl(state.showMeta.thumbnail || '')}
                alt={displayTitle}
                onError={(e) => {
                  ;(e.target as HTMLImageElement).src = '/placeholder.svg'
                }}
              />
            </div>
            <div className={layoutStyles.videoTitleSection}>
              <div className={styles.titleContainer}>
                <h1>{displayTitle}</h1>
                <div className={styles.scheduleInfo}>
                  {state.showMeta.status && (
                    <span className={styles.status}>{state.showMeta.status}</span>
                  )}
                  {state.showMeta.nextEpisodeAirDate && (
                    <span className={styles.nextEpisode}>
                      Next episode: {state.showMeta.nextEpisodeAirDate}
                    </span>
                  )}
                </div>
              </div>
              <div className={styles.controls}>
                <button
                  className={`${styles.watchlistBtn} ${state.inWatchlist ? styles.inList : ''}`}
                  onClick={toggleWatchlist}
                >
                  {state.inWatchlist ? <FaCheck size={14} /> : <FaPlus size={14} />}
                  {state.inWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
                </button>
                {showIdResolved && state.showMeta.name && (
                  <button
                    type="button"
                    className={`${styles.watchlistBtn} ${inQueue ? styles.inList : ''}`}
                    onClick={() => {
                      if (inQueue) removeFromQueue(showIdResolved)
                      else
                        addToQueue({
                          id: showIdResolved,
                          name: state.showMeta.name,
                          thumbnail: state.showMeta.thumbnail || '',
                          nativeName: state.showMeta.names?.native,
                          englishName: state.showMeta.names?.english,
                          type: state.showMeta.type,
                        })
                    }}
                  >
                    <FaListUl size={14} />
                    {inQueue ? 'In queue' : 'Add to queue'}
                  </button>
                )}
                {hasPrevEpisode && (
                  <button
                    type="button"
                    className={styles.episodeNavBtn}
                    onClick={() => {
                      const currentIndex = state.episodes.findIndex((ep) => ep === state.currentEpisode)
                      if (currentIndex > 0) {
                        navigate(`/watch/${showId}/${state.episodes[currentIndex - 1]}`)
                      }
                    }}
                  >
                    <FaStepBackward size={14} />
                    Prev EP
                  </button>
                )}
                {hasNextEpisode && (
                  <button
                    type="button"
                    className={styles.nextEpBtn}
                    onClick={handleNextEpisode}
                  >
                    <FaStepForward size={14} />
                    Next EP
                  </button>
                )}
                {showManualWatchedButton && (
                  <button
                    className={`${styles.watchlistBtn} ${styles.markWatchedBtn} ${isCurrentEpisodeWatched ? styles.markWatchedDone : ''}`}
                    onClick={handleMarkEpisodeWatched}
                    disabled={isMarkingWatched || !state.currentEpisode}
                  >
                    <FaCheck size={14} />
                    {isMarkingWatched
                      ? 'Saving...'
                      : isCurrentEpisodeWatched
                        ? 'Watched'
                        : 'Mark Watched'}
                  </button>
                )}
                {canMoveToCompleted && (
                  <button
                    className={`${styles.watchlistBtn} ${styles.completeSeriesBtn}`}
                    onClick={moveToCompleted}
                    disabled={isUpdatingWatchlistStatus}
                  >
                    <FaCheck size={14} />
                    {isUpdatingWatchlistStatus ? 'Saving...' : 'Move to Completed'}
                  </button>
                )}
                <div className={styles.modeToggleGroup}>
                  <button
                    type="button"
                    className={`${styles.modeBtn} ${state.currentMode === 'sub' ? styles.modeActive : ''}`}
                    onClick={() => {
                      dispatch({ type: 'SET_MODE', payload: 'sub' })
                      localStorage.setItem('preferredMode', 'sub')
                    }}
                    aria-pressed={state.currentMode === 'sub'}
                  >
                    SUB
                  </button>
                  <button
                    type="button"
                    className={`${styles.modeBtn} ${state.currentMode === 'dub' ? styles.modeActive : ''}`}
                    onClick={() => {
                      dispatch({ type: 'SET_MODE', payload: 'dub' })
                      localStorage.setItem('preferredMode', 'dub')
                    }}
                    aria-pressed={state.currentMode === 'dub'}
                  >
                    DUB
                  </button>
                </div>
                {window.innerWidth >= 768 && (
                  <button
                    type="button"
                    className={`${styles.watchlistBtn} ${styles.nativeToggleBtn} ${state.forceNativePlayer ? styles.nativeToggleActive : ''}`}
                    onClick={() => {
                      const checked = !state.forceNativePlayer
                      dispatch({
                        type: 'SET_STATE',
                        payload: { forceNativePlayer: checked },
                      })
                      localStorage.setItem('forceNativePlayer', checked.toString())
                    }}
                    aria-pressed={state.forceNativePlayer}
                  >
                    {state.forceNativePlayer ? 'Native On' : 'Native Off'}
                  </button>
                )}
                <button
                  type="button"
                  className={layoutStyles.theaterToggle}
                  onClick={() => setTheaterMode((v) => !v)}
                  aria-pressed={theaterMode}
                >
                  {theaterMode ? <FaCompress aria-hidden /> : <FaExpand aria-hidden />}
                  {theaterMode ? 'Exit theater' : 'Theater'}
                </button>
              </div>
            </div>
          </div>

          <div className={styles.descriptionSection}>
            <h3>Synopsis</h3>
            <p className={styles.description}>
              {state.showMeta.description
                ? state.showMeta.description.replace(/<[^>]*>?/gm, '')
                : 'No description available.'}
            </p>
          </div>

          <button className={styles.detailsToggleBtn} onClick={handleToggleDetails}>
            {state.showCombinedDetails ? <FaChevronUp /> : <FaChevronDown />}
            {state.showCombinedDetails ? 'Hide Details' : 'Show Details'}
          </button>

          {state.showCombinedDetails && (
            <>
              {state.loadingDetails ? (
                <p className={styles.loadingDetails}>Loading details...</p>
              ) : (
                <>
                  <div className={styles.detailsGridContainer}>
                    {state.showMeta.mediaTypes?.[0] && (
                      <div className={styles.detailItem}>
                        <strong>Type</strong>
                        <span>{state.showMeta.mediaTypes[0].name}</span>
                      </div>
                    )}
                    {state.showMeta.status && (
                      <div className={styles.detailItem}>
                        <strong>Status</strong>
                        <span className={styles.animeStatus}>{state.showMeta.status}</span>
                      </div>
                    )}
                    {state.showMeta.stats?.averageScore && (
                      <div className={styles.detailItem}>
                        <strong>Score</strong>
                        <span>{state.showMeta.stats.averageScore}</span>
                      </div>
                    )}
                    {state.showMeta.studios && state.showMeta.studios.length > 0 && (
                      <div className={styles.detailItem}>
                        <strong>Studios</strong>
                        <span>{state.showMeta.studios.map((s) => s.name).join(', ')}</span>
                      </div>
                    )}
                    {state.showMeta.sources?.[0] && (
                      <div className={styles.detailItem}>
                        <strong>Source</strong>
                        <span>{state.showMeta.sources[0].name}</span>
                      </div>
                    )}
                    {state.showMeta.lengthMin && (
                      <div className={styles.detailItem}>
                        <strong>Episode Length</strong>
                        <span>{state.showMeta.lengthMin} min</span>
                      </div>
                    )}
                    {state.showMeta.names?.english && (
                      <div className={styles.detailItem}>
                        <strong>English Title</strong>
                        <span>{state.showMeta.names.english}</span>
                      </div>
                    )}
                    {state.showMeta.names?.native && (
                      <div className={styles.detailItem}>
                        <strong>Native Title</strong>
                        <span>{state.showMeta.names.native}</span>
                      </div>
                    )}
                    {state.showMeta.genres && (
                      <div className={styles.detailItem}>
                        <strong>Genres</strong>
                        <div className={styles.genresList}>
                          {state.showMeta.genres.map((g) => (
                            <span key={g.name} className={styles.genreTag}>
                              {g.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {state.allMangaDetails?.Rating && (
                      <div className={styles.detailItem}>
                        <strong>Rating</strong>
                        <span>{state.allMangaDetails.Rating}</span>
                      </div>
                    )}
                    {state.allMangaDetails?.Season && (
                      <div className={styles.detailItem}>
                        <strong>Season</strong>
                        <span>{state.allMangaDetails.Season}</span>
                      </div>
                    )}
                    {state.allMangaDetails?.Episodes && (
                      <div className={styles.detailItem}>
                        <strong>Episodes</strong>
                        <span>{state.allMangaDetails.Episodes}</span>
                      </div>
                    )}
                    {state.allMangaDetails?.Date && (
                      <div className={styles.detailItem}>
                        <strong>Date</strong>
                        <span>{state.allMangaDetails.Date}</span>
                      </div>
                    )}
                    {state.allMangaDetails?.['Original Broadcast'] && (
                      <div className={styles.detailItem}>
                        <strong>Original Broadcast</strong>
                        <span>{state.allMangaDetails['Original Broadcast']}</span>
                      </div>
                    )}
                  </div>

                  {state.showMeta.websites && (
                    <div className={styles.externalLinksSection}>
                      <strong>External Links</strong>
                      <div className={styles.externalLinksGrid}>
                        {state.showMeta.websites.official && (
                          <a
                            href={ensureHttpProtocol(state.showMeta.websites.official)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.websiteLink}
                          >
                            Official
                          </a>
                        )}
                        {state.showMeta.websites.mal && (
                          <a
                            href={ensureHttpProtocol(state.showMeta.websites.mal)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.websiteLink}
                          >
                            MAL
                          </a>
                        )}
                        {state.showMeta.websites.aniList && (
                          <a
                            href={ensureHttpProtocol(state.showMeta.websites.aniList)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.websiteLink}
                          >
                            AniList
                          </a>
                        )}
                        {state.showMeta.websites.kitsu && (
                          <a
                            href={ensureHttpProtocol(state.showMeta.websites.kitsu)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.websiteLink}
                          >
                            Kitsu
                          </a>
                        )}
                        {state.showMeta.websites.animePlanet && (
                          <a
                            href={ensureHttpProtocol(state.showMeta.websites.animePlanet)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.websiteLink}
                          >
                            Anime-Planet
                          </a>
                        )}
                        {state.showMeta.websites.anidb && (
                          <a
                            href={ensureHttpProtocol(state.showMeta.websites.anidb)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.websiteLink}
                          >
                            AniDB
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          <PlayerRelatedShows showId={showId} genres={state.showMeta.genres} />
        </div>
      </div>
    </div>
  )
}

export default Player
