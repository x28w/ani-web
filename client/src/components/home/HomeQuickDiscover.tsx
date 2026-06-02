import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FaDice, FaCompass } from 'react-icons/fa'
import type { Anime } from '../../hooks/useAnimeData'
import styles from './HomeQuickDiscover.module.css'

const DISCOVER_GENRES = [
  'Action',
  'Romance',
  'Comedy',
  'Fantasy',
  'Slice of Life',
  'Horror',
  'Sci-Fi',
  'Sports',
] as const

interface HomeQuickDiscoverProps {
  pool?: Anime[]
}

const HomeQuickDiscover: React.FC<HomeQuickDiscoverProps> = ({ pool = [] }) => {
  const navigate = useNavigate()

  const surpriseMe = () => {
    if (pool.length === 0) {
      navigate('/search')
      return
    }
    const pick = pool[Math.floor(Math.random() * pool.length)]
    const id = pick._id || pick.id
    if (id) navigate(`/anime/${id}`)
  }

  return (
    <section className={styles.discover} aria-label="Quick discovery">
      <div className={styles.head}>
        <div>
          <span className={styles.eyebrow}>
            <FaCompass aria-hidden /> Explore
          </span>
          <h2 className={styles.title}>Jump in by mood</h2>
        </div>
        <button type="button" className={styles.surpriseBtn} onClick={surpriseMe}>
          <FaDice aria-hidden />
          Surprise me
        </button>
      </div>
      <div className={styles.chips}>
        {DISCOVER_GENRES.map((genre) => (
          <Link
            key={genre}
            to={`/search?genres=${encodeURIComponent(genre)}`}
            className={styles.chip}
          >
            {genre}
          </Link>
        ))}
      </div>
    </section>
  )
}

export default HomeQuickDiscover
