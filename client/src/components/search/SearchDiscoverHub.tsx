import React from 'react'
import { Link } from 'react-router-dom'
import { fixThumbnailUrl } from '../../lib/utils'
import type { Anime } from '../../hooks/useAnimeData'
import styles from './SearchDiscoverHub.module.css'

interface SearchDiscoverHubProps {
  latest?: Anime[]
}

const SearchDiscoverHub: React.FC<SearchDiscoverHubProps> = ({ latest = [] }) => {
  const featured = latest.slice(0, 4)

  return (
    <div className={styles.hub}>
      <div className={styles.heroPanel}>
        <div className={styles.heroCopy}>
          <h2>Discover your next obsession</h2>
          <p>
            Stack filters for precision — the catalog is huge and we will surface something that fits.
          </p>
          <div className={styles.heroActions}>
            <Link to="/" className={styles.latestLink}>
              Fresh releases →
            </Link>
          </div>
        </div>
        {featured.length > 0 && (
          <div className={styles.heroPosters} aria-hidden>
            {featured.map((anime, i) => (
              <img
                key={anime._id}
                src={fixThumbnailUrl(anime.thumbnail, 140, 200)}
                alt=""
                style={{ '--stack-i': i } as React.CSSProperties}
              />
            ))}
          </div>
        )}
      </div>

      <div className={styles.quickLinks}>
        <Link to="/search?type=Movie">Movies</Link>
        <Link to="/search?season=Winter">Winter season</Link>
        <Link to="/watchlist">Your watchlist</Link>
        <Link to="/insights">Watch stats</Link>
      </div>
    </div>
  )
}

export default SearchDiscoverHub
