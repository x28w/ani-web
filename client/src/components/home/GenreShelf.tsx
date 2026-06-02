import React, { useRef } from 'react'
import { Link } from 'react-router-dom'
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa'
import AnimeCard from '../anime/AnimeCard'
import AnimeCardSkeleton from '../anime/AnimeCardSkeleton'
import { useGenreShelf } from '../../hooks/useAnimeData'
import { useLowEndMode } from '../../contexts/LowEndModeContext'
import styles from './GenreShelf.module.css'

interface GenreShelfProps {
  genre: string
  accent?: string
}

const GenreShelf: React.FC<GenreShelfProps> = ({ genre, accent }) => {
  const { data, isLoading } = useGenreShelf(genre, 12)
  const { lowEndMode } = useLowEndMode()
  const railRef = useRef<HTMLDivElement>(null)

  if (!isLoading && (!data || data.length === 0)) return null

  const scroll = (dir: 'left' | 'right') => {
    if (!railRef.current) return
    railRef.current.scrollBy({
      left: dir === 'left' ? -railRef.current.clientWidth * 0.7 : railRef.current.clientWidth * 0.7,
      behavior: lowEndMode ? 'auto' : 'smooth',
    })
  }

  return (
    <section className={styles.shelf} style={{ '--shelf-accent': accent } as React.CSSProperties}>
      <div className={styles.header}>
        <div>
          <span className={styles.genreTag}>{genre}</span>
          <h2 className={styles.title}>{genre} picks</h2>
        </div>
        <div className={styles.actions}>
          <Link to={`/search?genres=${encodeURIComponent(genre)}`} className={styles.seeAll}>
            See all
          </Link>
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
          ? Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className={styles.cardSlot}>
                <AnimeCardSkeleton />
              </div>
            ))
          : data?.map((anime) => (
              <div key={anime._id} className={styles.cardSlot}>
                <AnimeCard anime={anime} />
              </div>
            ))}
      </div>
    </section>
  )
}

export default GenreShelf
