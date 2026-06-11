import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { FaPlay, FaClock, FaBell } from 'react-icons/fa'
import styles from './HomeWelcomeStrip.module.css'

interface HomeWelcomeStripProps {
  continueCount: number
  hasNotifications?: boolean
}

const getGreeting = () => {
  const hour = new Date().getHours()
  if (hour < 5) return 'Night owl mode'
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  if (hour < 22) return 'Good evening'
  return 'Late night binge'
}

const HomeWelcomeStrip: React.FC<HomeWelcomeStripProps> = ({
  continueCount,
  hasNotifications = false,
}) => {
  const greeting = useMemo(() => getGreeting(), [])

  return (
    <section className={styles.strip} aria-label="Welcome">
      <div className={styles.copy}>
        <span className={styles.greeting}>{greeting}</span>
        <h2 className={styles.headline}>What are we watching?</h2>
        <p className={styles.hint}>
          {continueCount > 0
            ? `${continueCount} show${continueCount === 1 ? '' : 's'} waiting where you left off.`
            : 'Fresh episodes drop daily — start something new from the catalog.'}
        </p>
      </div>
      <div className={styles.actions}>
        {continueCount > 0 && (
          <Link to="/watchlist/Continue Watching" className={styles.primaryAction}>
            <FaPlay aria-hidden />
            Resume watching
          </Link>
        )}
        <Link to="/search" className={styles.secondaryAction}>
          Browse catalog
        </Link>
        <Link to="/watchlist" className={styles.iconAction} title="Watchlist">
          <FaClock aria-hidden />
        </Link>
        {hasNotifications && (
          <span className={styles.noticeDot} title="New episode alerts">
            <FaBell aria-hidden />
          </span>
        )}
      </div>
    </section>
  )
}

export default HomeWelcomeStrip
