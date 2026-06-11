import React, { useEffect, useState, useCallback, Suspense, lazy } from 'react'
import styles from './PlayerControls.module.css'
import {
  PlayIcon,
  PauseIcon,
  Rewind10Icon,
  Forward10Icon,
  VolumeIcon,
  VolumeMutedIcon,
  SkipNextIcon,
  CastIcon,
  SubtitlesIcon,
  SpeedIcon,
  FullscreenIcon,
  BackArrowIcon,
  FlagIcon,
} from './PlayerIcons'
import type { VideoSource, VideoLink, SkipInterval } from '../../types/player'
import type useVideoPlayer from '../../hooks/useVideoPlayer'

const PlayerSettings = lazy(() => import('./PlayerSettings'))

interface PlayerControlsProps {
  player: ReturnType<typeof useVideoPlayer>
  showNextEpisodeButton: boolean
  onNextEpisode: () => void
  onPrevEpisode: () => void
  hasPrevEpisode: boolean
  hasNextEpisode: boolean
  videoSources: VideoSource[]
  selectedSource: VideoSource | null
  selectedLink: VideoLink | null
  onSourceChange: (source: VideoSource, link: VideoLink) => void
  skipIntervals: SkipInterval[]
  showTitle: string
  episodeLabel: string
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

const PlayerControls = ({
  player,
  showNextEpisodeButton,
  onNextEpisode,
  hasPrevEpisode,
  hasNextEpisode,
  videoSources,
  selectedSource,
  selectedLink,
  onSourceChange,
  skipIntervals,
  showTitle,
  episodeLabel,
}: PlayerControlsProps) => {
  const { state, refs, actions } = player
  const [showSettings, setShowSettings] = useState(false)
  const settingsRef = React.useRef<HTMLDivElement>(null)
  const settingsBtnRef = React.useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        settingsRef.current &&
        !settingsRef.current.contains(event.target as Node) &&
        settingsBtnRef.current &&
        !settingsBtnRef.current.contains(event.target as Node) &&
        showSettings
      ) {
        setShowSettings(false)
      }
    }
    if (showSettings) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showSettings])

  const watchedBarRef = React.useRef<HTMLDivElement>(null)
  const thumbRef = React.useRef<HTMLDivElement>(null)
  const bufferedBarRef = React.useRef<HTMLDivElement>(null)
  const timeDisplayRef = React.useRef<HTMLSpanElement>(null)
  const currentTimeRef = React.useRef(0)

  useEffect(() => {
    const video = refs.videoRef.current
    if (!video) return

    const handleTimeUpdate = () => {
      if (!state.isScrubbing) {
        const time = video.currentTime
        currentTimeRef.current = time
        const percent = (time / state.duration) * 100 || 0
        if (watchedBarRef.current) watchedBarRef.current.style.width = `${percent}%`
        if (thumbRef.current) thumbRef.current.style.left = `${percent}%`
        if (timeDisplayRef.current) {
          timeDisplayRef.current.innerText = actions.formatTime(time)
        }
      }
    }

    const handleProgress = () => {
      if (video.buffered.length > 0) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1)
        const percent = (bufferedEnd / state.duration) * 100 || 0
        if (bufferedBarRef.current) bufferedBarRef.current.style.width = `${percent}%`
      }
    }

    handleTimeUpdate()
    handleProgress()
    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('progress', handleProgress)
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('progress', handleProgress)
    }
  }, [refs.videoRef, state.isScrubbing, state.duration, actions])

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!refs.videoRef.current) return
    const newVolume = parseFloat(e.target.value)
    refs.videoRef.current.volume = newVolume
    refs.videoRef.current.muted = newVolume === 0
    localStorage.setItem('playerVolume', newVolume.toString())
  }

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!refs.videoRef.current || !refs.progressBarRef.current || isNaN(state.duration) || state.duration === 0) return
    const rect = refs.progressBarRef.current.getBoundingClientRect()
    const percent = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    refs.videoRef.current.currentTime = percent * state.duration
  }

  const handleProgressBarMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!refs.progressBarRef.current || !state.duration) return
    const rect = refs.progressBarRef.current.getBoundingClientRect()
    const percent = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const time = percent * state.duration
    actions.setHoverTime({ time, position: e.clientX - rect.left })
  }

  const handleThumbMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (!refs.videoRef.current) return
    actions.setIsScrubbing(true)
    actions.wasPlayingBeforeScrub.current = !refs.videoRef.current.paused
    refs.videoRef.current.pause()
  }

  useEffect(() => {
    const handleDocumentMouseMove = (e: MouseEvent) => {
      if (!state.isScrubbing || !refs.videoRef.current || !refs.progressBarRef.current || !state.duration) return
      const rect = refs.progressBarRef.current.getBoundingClientRect()
      const percent = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
      const scrubTime = percent * state.duration
      refs.videoRef.current.currentTime = scrubTime
      const percent100 = (scrubTime / state.duration) * 100 || 0
      if (watchedBarRef.current) watchedBarRef.current.style.width = `${percent100}%`
      if (thumbRef.current) thumbRef.current.style.left = `${percent100}%`
      if (timeDisplayRef.current) {
        timeDisplayRef.current.innerText = actions.formatTime(scrubTime)
      }
      actions.setHoverTime({ time: scrubTime, position: e.clientX - rect.left })
    }
    const handleDocumentMouseUp = () => {
      if (state.isScrubbing) {
        actions.setIsScrubbing(false)
        actions.setHoverTime({ time: 0, position: null })
        if (actions.wasPlayingBeforeScrub.current) {
          refs.videoRef.current?.play()
        }
      }
    }
    document.addEventListener('mousemove', handleDocumentMouseMove)
    document.addEventListener('mouseup', handleDocumentMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleDocumentMouseMove)
      document.removeEventListener('mouseup', handleDocumentMouseUp)
    }
  }, [state.isScrubbing, state.duration, refs.videoRef, refs.progressBarRef, actions])

  const handleSubtitleSelection = (trackId: string | null) => {
    if (!refs.videoRef.current) return
    actions.setActiveSubtitleTrack(trackId)
    Array.from(refs.videoRef.current.textTracks).forEach((track) => {
      track.mode =
        trackId !== null && trackId !== 'off' && (track.language === trackId || track.label === trackId)
          ? 'showing'
          : 'hidden'
    })
  }

  const cycleSpeed = useCallback(() => {
    if (!refs.videoRef.current) return
    const currentSpeed = refs.videoRef.current.playbackRate
    const idx = SPEEDS.indexOf(currentSpeed)
    const nextIdx = (idx + 1) % SPEEDS.length
    const newSpeed = SPEEDS[nextIdx]
    refs.videoRef.current.playbackRate = newSpeed
    if (newSpeed >= 1.5 && !state.isSpeedBoostActive) {
      actions.setIsSpeedBoostActive(true)
    } else if (newSpeed < 1.5 && state.isSpeedBoostActive) {
      actions.setIsSpeedBoostActive(false)
    }
    localStorage.setItem('playbackSpeed', newSpeed.toString())
  }, [refs.videoRef, state.isSpeedBoostActive, actions])

  const handleCast = useCallback(() => {
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('seekforward', null)
      } catch {}
    }
  }, [])

  return (
    <div
      className={`${styles.controlsOverlay} ${!state.showControls && !showSettings ? styles.hidden : ''}`}
      onDoubleClick={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          actions.setShowControls(true)
        }
      }}
    >
      <div className={styles.topControls}>
        <button className={styles.topCornerBtn} onClick={() => window.history.back()} aria-label="Back">
          <BackArrowIcon size={22} />
        </button>
        <button className={styles.topCornerBtn} aria-label="Report">
          <FlagIcon size={22} />
        </button>
      </div>

      <button
        className={styles.centerPlayPause}
        data-speed-boost-ignore="true"
        onClick={(e) => {
          e.stopPropagation()
          actions.togglePlay()
        }}
        aria-label={state.isPlaying ? 'Pause' : 'Play'}
      >
        {state.isPlaying ? <PauseIcon size={28} /> : <PlayIcon size={28} />}
      </button>

      <div className={styles.bottomControls} data-speed-boost-ignore="true">
        <div
          className={`${styles.progressBarContainer} ${state.isScrubbing ? styles.scrubbing : ''}`}
          ref={refs.progressBarRef}
          onClick={handleProgressBarClick}
          onMouseMove={handleProgressBarMouseMove}
          onMouseLeave={() => actions.setHoverTime({ time: 0, position: null })}
        >
          {state.hoverTime.position !== null && (
            <div className={styles.timeBubble} style={{ left: state.hoverTime.position }}>
              {actions.formatTime(state.hoverTime.time)}
            </div>
          )}
          <div className={styles.progressBar}>
            <div className={styles.bufferedBar} ref={bufferedBarRef} />
            <div className={styles.watchedBar} ref={watchedBarRef} />
            <div className={styles.thumb} ref={thumbRef} onMouseDown={handleThumbMouseDown} />

            {state.duration > 0 && player.state.currentSkipInterval && (
              <div
                className={`${styles.skipSegment} ${styles[player.state.currentSkipInterval.skip_type]}`}
                style={{
                  left: `${(player.state.currentSkipInterval.start_time / state.duration) * 100}%`,
                  width: `${((player.state.currentSkipInterval.end_time - player.state.currentSkipInterval.start_time) / state.duration) * 100}%`,
                }}
              />
            )}
            {skipIntervals.map((interval) => {
              const startPercent = (interval.start_time / state.duration) * 100
              const widthPercent = ((interval.end_time - interval.start_time) / state.duration) * 100
              return (
                <div
                  key={interval.skip_id}
                  className={`${styles.skipSegment} ${styles[interval.skip_type]}`}
                  style={{ left: `${startPercent}%`, width: `${widthPercent}%` }}
                  title={interval.skip_type.toUpperCase()}
                />
              )
            })}
          </div>
        </div>

        <div className={styles.controlBar}>
          <div className={styles.controlLeft}>
            <button className={styles.iconBtn} onClick={actions.togglePlay} aria-label={state.isPlaying ? 'Pause' : 'Play'}>
              {state.isPlaying ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
            </button>
            <button className={styles.iconBtn} onClick={() => actions.seek(-10)} aria-label="Rewind 10s">
              <Rewind10Icon size={22} />
            </button>
            <button className={styles.iconBtn} onClick={() => actions.seek(10)} aria-label="Forward 10s">
              <Forward10Icon size={22} />
            </button>
            <div className={styles.volumeArea}>
              <button className={styles.iconBtn} onClick={actions.toggleMute} aria-label={state.isMuted ? 'Unmute' : 'Mute'}>
                {state.isMuted || state.volume === 0 ? <VolumeMutedIcon size={22} /> : <VolumeIcon size={22} />}
              </button>
              <div className={styles.volumeSliderTrack}>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={state.isMuted ? 0 : state.volume}
                  onChange={handleVolumeChange}
                  className={styles.volumeSlider}
                />
              </div>
            </div>
          </div>

          <div className={styles.controlCenter}>
            <span className={styles.showTitleText}>{showTitle}</span>
            <span className={styles.episodeText}>{episodeLabel}</span>
          </div>

          <div className={styles.controlRight}>
            {(hasNextEpisode || showNextEpisodeButton) && (
              <button className={styles.iconBtn} onClick={onNextEpisode} aria-label="Next episode">
                <SkipNextIcon size={22} />
              </button>
            )}
            <button className={styles.iconBtn} onClick={handleCast} aria-label="Cast">
              <CastIcon size={22} />
            </button>
            <button className={styles.iconBtn} onClick={() => setShowSettings(!showSettings)} aria-label="Subtitles">
              <SubtitlesIcon size={22} />
            </button>
            <div className={styles.speedContainer}>
              <button className={styles.iconBtn} onClick={cycleSpeed} aria-label="Playback speed">
                <SpeedIcon size={22} />
              </button>
              {refs.videoRef.current && refs.videoRef.current.playbackRate !== 1 && (
                <span className={styles.speedLabel}>{refs.videoRef.current.playbackRate}x</span>
              )}
            </div>
            <button className={styles.iconBtn} onClick={actions.toggleFullscreen} aria-label={state.isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
              <FullscreenIcon size={22} />
            </button>
          </div>
        </div>
      </div>

      <Suspense fallback={null}>
        <PlayerSettings
          ref={settingsRef}
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          videoSources={videoSources}
          currentSource={selectedSource}
          currentLink={selectedLink}
          onSourceChange={onSourceChange}
          subtitles={state.availableSubtitles}
          activeSubtitleTrack={state.activeSubtitleTrack}
          onSubtitleChange={handleSubtitleSelection}
          subtitleSettings={{
            fontSize: state.subtitleFontSize,
            position: state.subtitlePosition,
          }}
          onSubtitleSettingsChange={(key, value) => {
            if (key === 'fontSize') {
              actions.setSubtitleFontSize(value)
              localStorage.setItem('subtitleFontSize', value.toString())
            } else {
              actions.setSubtitlePosition(value)
              localStorage.setItem('subtitlePosition', value.toString())
            }
          }}
        />
      </Suspense>
    </div>
  )
}

export default PlayerControls
