import React, { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { FaPlay, FaTrash, FaListUl } from 'react-icons/fa'
import { useWatchQueue } from '../contexts/WatchQueueContext'
import { useTitlePreference } from '../contexts/TitlePreferenceContext'
import { fixThumbnailUrl } from '../lib/utils'
import styles from './Queue.module.css'

const Queue: React.FC = () => {
  const { queue, remove, clear } = useWatchQueue()
  const { titlePreference } = useTitlePreference()

  useEffect(() => {
    document.title = 'Queue - ani-web'
  }, [])

  return (
    <div className="page-container">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>
            <FaListUl aria-hidden /> Up next
          </span>
          <h1 className={styles.title}>Watch queue</h1>
          <p className={styles.sub}>Line up what to watch — play through in order.</p>
        </div>
        {queue.length > 0 && (
          <button type="button" className={styles.clearBtn} onClick={clear}>
            Clear all
          </button>
        )}
      </header>

      {queue.length === 0 ? (
        <div className={styles.empty}>
          <FaListUl size={32} aria-hidden />
          <h2>Queue is empty</h2>
          <p>Add shows from search, a card popup, or the player page.</p>
          <Link to="/search" className={styles.browseLink}>
            Browse anime
          </Link>
        </div>
      ) : (
        <ol className={styles.list}>
          {queue.map((item, index) => {
            const title = String(item[titlePreference as keyof typeof item] || item.name)
            return (
              <li key={item.id} className={styles.item}>
                <span className={styles.index}>{index + 1}</span>
                <img src={fixThumbnailUrl(item.thumbnail, 72, 102)} alt="" />
                <div className={styles.meta}>
                  <span className={styles.name}>{title}</span>
                  {item.type && <span className={styles.type}>{item.type}</span>}
                </div>
                <div className={styles.actions}>
                  <Link to={`/anime/${item.id}`} className={styles.playBtn}>
                    <FaPlay aria-hidden /> Play
                  </Link>
                  <button
                    type="button"
                    className={styles.removeBtn}
                    onClick={() => remove(item.id)}
                    aria-label={`Remove ${title} from queue`}
                  >
                    <FaTrash aria-hidden />
                  </button>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

export default Queue
