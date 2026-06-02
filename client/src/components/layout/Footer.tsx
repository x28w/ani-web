import React from 'react'
import { Link } from 'react-router-dom'
import Logo from '../common/Logo'
import styles from './Footer.module.css'

const Footer: React.FC = () => {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <Link to="/" className={styles.logo}>
            <Logo />
          </Link>
          <p className={styles.tagline}>Track progress, browse seasonal anime, watch your way.</p>
        </div>

        <div className={styles.columns}>
          <div className={styles.column}>
            <h4>Browse</h4>
            <Link to="/">Home</Link>
            <Link to="/search">Search</Link>
            <Link to="/watchlist">Watchlist</Link>
          </div>
          <div className={styles.column}>
            <h4>Tools</h4>
            <Link to="/insights">Insights</Link>
            <Link to="/mal">MAL Import</Link>
            <Link to="/settings">Settings</Link>
          </div>
        </div>
      </div>

      <div className={styles.bottom}>
        <span>© 2026 ani-web</span>
        <span className={styles.dot} aria-hidden>
          ·
        </span>
        <span>Privacy-first</span>
      </div>
    </footer>
  )
}

export default Footer
