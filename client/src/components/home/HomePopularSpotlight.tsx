import React, { useRef } from 'react'
import { Link } from 'react-router-dom'
import { FaChevronLeft, FaChevronRight, FaFire, FaPlay } from 'react-icons/fa'
import { fixThumbnailUrl } from '../../lib/utils'
import { usePopularAnime } from '../../hooks/useAnimeData'
import { useTitlePreference } from '../../contexts/TitlePreferenceContext'
import { useLowEndMode } from '../../contexts/LowEndModeContext'
import styles from './HomePopularSpotlight.module.css'

const HomePopularSpotlight: React.FC = () => {
  const { data, isLoading } = usePopularAnime('weekly')
  const { titlePreference } = useTitlePreference()
  const { lowEndMode } = useLowEndMode()
  const railRef = useRef<HTMLDivElement>(null)

  const items = (data || []).slice(0, 8)
  if (!isLoading && items.length === 0) return null

  const scroll = (dir: 'left' | 'right') => {
    if (!railRef.current) return
    const offset = railRef.current.clientWidth * 0.75
    railRef.current.scrollBy({
      left: dir === 'left' ? -offset : offset,
      behavior: lowEndMode ? 'auto' : 'smooth',
    })
  }

  return (
    <section className={styles.section} aria-label="Trending this week">
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>
            <FaFire aria-hidden /> Trending
          </span>
          <h2 className={styles.title}>Hot this week</h2>
          <p className={styles.sub}>What everyone is talking about right now</p>
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
          : items.map((item, index) => {
              const title = String(item[titlePreference as keyof typeof item] || item.name)
              const id = item._id || item.id
              return (
                <Link key={id} to={`/anime/${id}`} className={styles.card}>
                  <div className={styles.poster}>
                    <span className={styles.rank}>{index + 1}</span>
                    <img
                      src={fixThumbnailUrl(item.thumbnail, 130, 195)}
                      alt=""
                      loading="lazy"
                      width={130}
                      height={195}
                    />
                    <span className={styles.playHint}>
                      <FaPlay aria-hidden />
                    </span>
                  </div>
                  <div className={styles.meta}>
                    <span className={styles.cardTitle}>{title}</span>
                    {item.type && <span className={styles.type}>{item.type}</span>}
                  </div>
                </Link>
              )
            })}
      </div>
    </section>
  )
}

export default HomePopularSpotlight
