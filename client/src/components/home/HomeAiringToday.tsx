import React from 'react'
import { Link } from 'react-router-dom'
import { FaBroadcastTower } from 'react-icons/fa'
import { fixThumbnailUrl } from '../../lib/utils'
import { useTodaySchedule } from '../../hooks/useAnimeData'
import { useTitlePreference } from '../../contexts/TitlePreferenceContext'
import styles from './HomeAiringToday.module.css'

const HomeAiringToday: React.FC = () => {
  const { data, isLoading } = useTodaySchedule()
  const { titlePreference } = useTitlePreference()
  const items = (data || []).slice(0, 6)

  if (!isLoading && items.length === 0) return null

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })

  return (
    <section className={styles.section} aria-label="Airing today">
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>
            <FaBroadcastTower aria-hidden /> Airing today
          </span>
          <h2 className={styles.title}>{todayLabel}</h2>
          <p className={styles.sub}>New episodes scheduled for today</p>
        </div>
        <a href="#schedule" className={styles.calendarLink}>
          See full schedule ↓
        </a>
      </div>

      <div className={styles.grid}>
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={`${styles.tile} ${styles.skeleton}`} />
            ))
          : items.map((item) => {
              const id = item._id || item.id
              const title = String(item[titlePreference as keyof typeof item] || item.name)
              return (
                <Link key={id} to={`/anime/${id}`} className={styles.tile}>
                  <img src={fixThumbnailUrl(item.thumbnail, 120, 168)} alt="" loading="lazy" />
                  <div className={styles.tileBody}>
                    <span className={styles.live}>Today</span>
                    <span className={styles.tileTitle}>{title}</span>
                  </div>
                </Link>
              )
            })}
      </div>
    </section>
  )
}

export default HomeAiringToday
