import React, { useRef } from 'react'
import { Link } from 'react-router-dom'
import { FaChevronLeft, FaChevronRight, FaLayerGroup } from 'react-icons/fa'
import { fixThumbnailUrl } from '../../lib/utils'
import { useSimilarAnime } from '../../hooks/useAnimeData'
import { useTitlePreference } from '../../contexts/TitlePreferenceContext'
import { useLowEndMode } from '../../contexts/LowEndModeContext'
import styles from './PlayerRelatedShows.module.css'

interface PlayerRelatedShowsProps {
  showId?: string
  genres?: { name: string }[]
}

const PlayerRelatedShows: React.FC<PlayerRelatedShowsProps> = ({ showId, genres }) => {
  const genreNames = genres?.map((g) => g.name).filter(Boolean)
  const { data, isLoading } = useSimilarAnime(genreNames, showId, 10)
  const { titlePreference } = useTitlePreference()
  const { lowEndMode } = useLowEndMode()
  const railRef = useRef<HTMLDivElement>(null)

  if (!isLoading && (!data || data.length === 0)) return null

  const scroll = (dir: 'left' | 'right') => {
    railRef.current?.scrollBy({
      left: dir === 'left' ? -280 : 280,
      behavior: lowEndMode ? 'auto' : 'smooth',
    })
  }

  const primaryGenre = genreNames?.[0]

  return (
    <section className={styles.section} aria-label="You might also like">
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>
            <FaLayerGroup aria-hidden /> Because you watched
          </span>
          <h3>More like this{primaryGenre ? ` · ${primaryGenre}` : ''}</h3>
        </div>
        <div className={styles.nav}>
          <button type="button" onClick={() => scroll('left')} aria-label="Scroll left">
            <FaChevronLeft />
          </button>
          <button type="button" onClick={() => scroll('right')} aria-label="Scroll right">
            <FaChevronRight />
          </button>
        </div>
      </div>
      <div className={styles.rail} ref={railRef}>
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={`${styles.card} ${styles.skeleton}`} />
            ))
          : data?.map((anime) => {
              const id = anime._id || anime.id
              const title = String(anime[titlePreference as keyof typeof anime] || anime.name)
              return (
                <Link key={id} to={`/anime/${id}`} className={styles.card}>
                  <img src={fixThumbnailUrl(anime.thumbnail, 120, 170)} alt="" loading="lazy" />
                  <span className={styles.cardTitle}>{title}</span>
                </Link>
              )
            })}
      </div>
    </section>
  )
}

export default PlayerRelatedShows
