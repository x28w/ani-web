import React, { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { FaCalendarAlt, FaClock, FaFilm, FaPlayCircle } from 'react-icons/fa'
import AnimeSection from '../components/anime/AnimeSection'
import { useTitlePreference } from '../contexts/TitlePreferenceContext'
import { fixThumbnailUrl } from '../lib/utils'
import styles from './Insights.module.css'

interface MostWatchedTitle {
  id: string
  name: string
  nativeName?: string
  englishName?: string
  thumbnail?: string
  type?: string
  watchedSeconds: number
  episodesWatched: number
}

interface FavoriteGenre {
  name: string
  seconds: number
}

interface ActivityDay {
  day: string
  seconds: number
}

interface RecommendedAnime {
  _id: string
  id?: string
  name: string
  nativeName?: string
  englishName?: string
  thumbnail?: string
  type?: string
  availableEpisodesDetail?: {
    sub?: string[]
    dub?: string[]
  }
}

interface InsightData {
  totalSeconds: number
  totalEpisodes: number
  titlesWatched: number
  activeDays: number
  mostWatched: MostWatchedTitle[]
  favoriteGenres: FavoriteGenre[]
  activity: ActivityDay[]
  recommendations: RecommendedAnime[]
}

const formatWatchTime = (seconds: number) => {
  const roundedMinutes = Math.round(seconds / 60)
  const hours = Math.floor(roundedMinutes / 60)
  const minutes = roundedMinutes % 60

  if (hours === 0) return `${minutes}m`
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
}

const Insights: React.FC = () => {
  const { titlePreference } = useTitlePreference()
  const { data, isLoading, isError } = useQuery<InsightData>({
    queryKey: ['insights'],
    queryFn: async () => {
      const response = await fetch('/api/insights')
      if (!response.ok) throw new Error('Failed to fetch insights')
      return response.json()
    },
  })

  useEffect(() => {
    document.title = 'Insights - ani-web'
  }, [])

  const recentActivity = useMemo(() => {
    const values = new Map((data?.activity || []).map((day) => [day.day, day.seconds]))
    return Array.from({ length: 14 }, (_, offset) => {
      const date = new Date()
      date.setDate(date.getDate() - (13 - offset))
      const key = date.toISOString().slice(0, 10)
      return { day: key, seconds: values.get(key) || 0 }
    })
  }, [data?.activity])

  if (isLoading) {
    return (
      <div className="page-container">
        <div className={styles.loading}>Loading watch insights...</div>
      </div>
    )
  }
  if (isError) {
    return (
      <div className="page-container">
        <div className={styles.error}>Could not load watch insights.</div>
      </div>
    )
  }
  if (!data) return null

  const maxWatched = data.mostWatched[0]?.watchedSeconds || 1
  const maxGenre = data.favoriteGenres[0]?.seconds || 1
  const maxActivity = Math.max(...recentActivity.map((day) => day.seconds), 1)
  const recommendationTitle = data.favoriteGenres[0]
    ? `Recommended: ${data.favoriteGenres[0].name}`
    : 'Recommended For You'
  const recommendationCards = data.recommendations.map((anime) => ({
    ...anime,
    id: anime.id || anime._id,
    thumbnail: anime.thumbnail || '',
  }))
  const stats = [
    { label: 'Watch Time', value: formatWatchTime(data.totalSeconds), icon: <FaClock /> },
    { label: 'Episodes Played', value: String(data.totalEpisodes), icon: <FaPlayCircle /> },
    { label: 'Titles Watched', value: String(data.titlesWatched), icon: <FaFilm /> },
    { label: 'Active Days', value: String(data.activeDays), icon: <FaCalendarAlt /> },
  ]

  return (
    <div className={`page-container ${styles.page}`}>
      <header className={styles.pageHeader}>
        <div>
          <span className={styles.eyebrow}>Your stats</span>
          <h1 className={styles.pageTitle}>Watch Insights</h1>
          <p className={styles.pageSub}>See what you have been watching lately.</p>
        </div>
      </header>

      <div className={styles.statsGrid}>
        {stats.map((stat) => (
          <div className={styles.statCard} key={stat.label}>
            <span className={styles.statIcon}>{stat.icon}</span>
            <div>
              <div className={styles.statValue}>{stat.value}</div>
              <div className={styles.statLabel}>{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {data.mostWatched.length === 0 ? (
        <div className={styles.emptyState}>
          <FaPlayCircle />
          <h3>No watch history yet</h3>
          <p>Start an episode and your insights will appear here.</p>
        </div>
      ) : (
        <>
          <div className={styles.contentGrid}>
            <section className={styles.section}>
              <h3 className={styles.heading}>Most Watched</h3>
              <div className={styles.watchList}>
                {data.mostWatched.map((title, index) => {
                  const displayTitle =
                    title[titlePreference as keyof MostWatchedTitle] || title.name
                  const label = typeof displayTitle === 'string' ? displayTitle : title.name
                  return (
                    <Link to={`/anime/${title.id}`} className={styles.watchRow} key={title.id}>
                      <span className={styles.rank}>{String(index + 1).padStart(2, '0')}</span>
                      <img
                        className={styles.poster}
                        src={fixThumbnailUrl(title.thumbnail, 72, 100)}
                        alt=""
                        loading="lazy"
                      />
                      <div className={styles.watchInfo}>
                        <span className={styles.title}>{label}</span>
                        <span className={styles.detail}>
                          {title.episodesWatched} episodes / {formatWatchTime(title.watchedSeconds)}
                        </span>
                        <span className={styles.barTrack} aria-hidden="true">
                          <span
                            className={styles.barFill}
                            style={{ width: `${(title.watchedSeconds / maxWatched) * 100}%` }}
                          />
                        </span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </section>

            <div className={styles.sideColumn}>
              {data.favoriteGenres.length > 0 && (
                <section className={styles.section}>
                  <h3 className={styles.heading}>Top Genres</h3>
                  <div className={styles.genreList}>
                    {data.favoriteGenres.map((genre) => (
                      <div className={styles.genreRow} key={genre.name}>
                        <div className={styles.genreHeader}>
                          <span>{genre.name}</span>
                          <span>{formatWatchTime(genre.seconds)}</span>
                        </div>
                        <span className={styles.genreTrack} aria-hidden="true">
                          <span
                            className={styles.genreFill}
                            style={{ width: `${(genre.seconds / maxGenre) * 100}%` }}
                          />
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className={styles.section}>
                <h3 className={styles.heading}>Last 14 Days</h3>
                <div className={styles.activityChart}>
                  {recentActivity.map((day) => (
                    <span className={styles.activityColumn} key={day.day}>
                      <span
                        className={styles.activityBar}
                        style={{ height: `${Math.max((day.seconds / maxActivity) * 100, 3)}%` }}
                        title={`${formatWatchTime(day.seconds)} on ${day.day}`}
                      />
                      <span className={styles.activityLabel}>
                        {new Date(`${day.day}T12:00:00`).toLocaleDateString(undefined, {
                          weekday: 'short',
                        })}
                      </span>
                    </span>
                  ))}
                </div>
              </section>
            </div>
          </div>

          {recommendationCards.length > 0 && (
            <AnimeSection title={recommendationTitle} animeList={recommendationCards} carousel />
          )}
        </>
      )}
    </div>
  )
}

export default Insights
