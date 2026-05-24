import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueries } from '@tanstack/react-query'
import { FaChevronLeft, FaChevronRight, FaInfoCircle, FaPlay, FaStar } from 'react-icons/fa'
import { fixThumbnailUrl } from '../../lib/utils'
import { useTitlePreference } from '../../contexts/TitlePreferenceContext'
import type { Anime } from '../../hooks/useAnimeData'
import styles from './AnimeHeroCarousel.module.css'

interface AnimeHeroCarouselProps {
  animeList: Anime[]
  loading?: boolean
  continueWatchingIds?: Set<string>
}

const stripHtml = (value?: string) => {
  if (!value) return ''
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const getEpisodeCount = (anime: Anime) => {
  const fromDetail = Math.max(
    anime.availableEpisodesDetail?.sub?.length || 0,
    anime.availableEpisodesDetail?.dub?.length || 0
  )
  return anime.episodeCount || fromDetail || undefined
}

const getFirstEpisode = (anime: Anime) => {
  return anime.availableEpisodesDetail?.sub?.[0] || anime.availableEpisodesDetail?.dub?.[0] || '1'
}

const fetchShowMeta = async (id: string): Promise<Partial<Anime>> => {
  const response = await fetch(`/api/show-meta/${encodeURIComponent(id)}`)
  if (!response.ok) return {}
  return response.json()
}

const AnimeHeroCarousel: React.FC<AnimeHeroCarouselProps> = ({
  animeList,
  loading = false,
  continueWatchingIds,
}) => {
  const { titlePreference } = useTitlePreference()
  const [activeIndex, setActiveIndex] = useState(0)
  const [autoplayResetKey, setAutoplayResetKey] = useState(0)

  const items = useMemo(
    () => animeList.filter((anime) => anime?._id || anime?.id).slice(0, 6),
    [animeList]
  )

  const metaQueries = useQueries({
    queries: items.map((anime) => {
      const animeId = anime._id || anime.id
      return {
        queryKey: ['hero-show-meta', animeId],
        queryFn: () => fetchShowMeta(animeId),
        enabled: Boolean(animeId),
        staleTime: 1000 * 60 * 15,
      }
    }),
  })

  useEffect(() => {
    setActiveIndex(0)
    setAutoplayResetKey((key) => key + 1)
  }, [items.length])

  useEffect(() => {
    if (items.length <= 1) return
    const timeout = window.setTimeout(() => {
      setActiveIndex((index) => (index + 1) % items.length)
    }, 8000)
    return () => window.clearTimeout(timeout)
  }, [activeIndex, autoplayResetKey, items.length])

  if (loading && items.length === 0) {
    return (
      <section className={`${styles.hero} ${styles.loading}`} aria-label="Featured anime">
        <div className={styles.loadingText}>Loading featured anime...</div>
      </section>
    )
  }

  if (items.length === 0) return null

  const selectedAnime = items[Math.min(activeIndex, items.length - 1)]
  const activeMeta = metaQueries[Math.min(activeIndex, items.length - 1)]?.data || {}
  const activeAnime = {
    ...selectedAnime,
    ...activeMeta,
    name: activeMeta.name || selectedAnime.name,
    thumbnail: activeMeta.thumbnail || selectedAnime.thumbnail,
  }
  const animeId = activeAnime._id || activeAnime.id
  const displayTitle = String(activeAnime[titlePreference] || activeAnime.name || 'Untitled anime')
  const synopsis = stripHtml(activeAnime.description) || 'No synopsis is available yet.'
  const episodeCount = getEpisodeCount(activeAnime)
  const genres = (activeAnime.genres || [])
    .map((genre) => (typeof genre === 'string' ? genre : genre.name))
    .filter(Boolean)
    .slice(0, 3)
  const metadata = [
    continueWatchingIds?.has(String(animeId)) ? 'Continue watching' : undefined,
    activeAnime.type || 'Anime',
    activeAnime.status,
    episodeCount ? `${episodeCount} episodes` : undefined,
    activeAnime.rating,
  ].filter((item): item is string => Boolean(item))
  const hasBanner = Boolean(activeAnime.bannerImage)
  const backdrop = activeAnime.bannerImage
    ? fixThumbnailUrl(activeAnime.bannerImage, 1920, 840)
    : activeAnime.thumbnail
      ? fixThumbnailUrl(activeAnime.thumbnail, 1000, 1400)
      : '/placeholder.svg'

  const resetAutoplay = () => setAutoplayResetKey((key) => key + 1)

  const move = (direction: 'previous' | 'next', manual = false) => {
    if (manual) resetAutoplay()
    setActiveIndex((index) => {
      if (direction === 'previous') return (index - 1 + items.length) % items.length
      return (index + 1) % items.length
    })
  }

  const selectSlide = (index: number) => {
    resetAutoplay()
    setActiveIndex(index)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      move('previous', true)
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault()
      move('next', true)
    }
  }

  return (
    <section
      className={styles.hero}
      aria-label="Featured anime"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <img
        key={backdrop}
        src={backdrop}
        alt=""
        className={`${styles.backdrop} ${!hasBanner ? styles.posterBackdrop : ''}`}
        aria-hidden="true"
      />
      <div className={styles.overlay} />
      {items.length > 1 && (
        <div className={styles.autoplayProgress} aria-hidden="true">
          <span key={`${activeIndex}-${autoplayResetKey}`} />
        </div>
      )}

      <div className={styles.content}>
        <span className={styles.featureLabel}>
          {continueWatchingIds?.has(String(animeId)) ? 'Resume' : 'Featured'}
        </span>
        <div className={styles.metaRow}>
          {metadata.map((item) => (
            <span key={item}>{item}</span>
          ))}
          {activeAnime.score && (
            <span>
              <FaStar /> {activeAnime.score}
            </span>
          )}
        </div>
        <h1>{displayTitle}</h1>
        {genres.length > 0 && (
          <div className={styles.genres}>
            {genres.map((genre) => (
              <span key={genre}>{genre}</span>
            ))}
          </div>
        )}
        <p>{synopsis}</p>

        <div className={styles.actions}>
          <Link
            to={`/watch/${animeId}/${getFirstEpisode(activeAnime)}`}
            className="btn btn-primary"
          >
            <FaPlay /> Watch now
          </Link>
          <Link to={`/anime/${animeId}`} className="btn btn-secondary">
            <FaInfoCircle /> Details
          </Link>
        </div>
      </div>

      {items.length > 1 && (
        <div className={styles.navigation}>
          <div className={styles.arrows}>
            <button
              type="button"
              className={styles.arrowButton}
              onClick={() => move('previous', true)}
              aria-label="Previous featured anime"
            >
              <FaChevronLeft />
            </button>
            <button
              type="button"
              className={styles.arrowButton}
              onClick={() => move('next', true)}
              aria-label="Next featured anime"
            >
              <FaChevronRight />
            </button>
          </div>
          <div className={styles.dots} aria-label="Featured anime slides">
            {items.map((anime, index) => (
              <button
                type="button"
                key={anime._id || anime.id}
                className={index === activeIndex ? styles.activeDot : ''}
                onClick={() => selectSlide(index)}
                aria-label={`Show featured anime ${index + 1}`}
                aria-current={index === activeIndex ? 'true' : undefined}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

export default AnimeHeroCarousel
