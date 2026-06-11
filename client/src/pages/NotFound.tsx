import React, { useEffect } from 'react'
import { Link } from 'react-router-dom'
import Logo from '../components/common/Logo'
import styles from './NotFound.module.css'

const NotFound: React.FC = () => {
  useEffect(() => {
    document.title = '404 - Page Not Found - ani-web'
  }, [])

  return (
    <div className={`page-container ${styles.page}`}>
      <div className={styles.card}>
        <Logo />
        <h1 className={styles.code}>404</h1>
        <h2 className={styles.title}>Page not found</h2>
        <p className={styles.message}>
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className={styles.actions}>
          <Link to="/" className={styles.homeBtn}>Go home</Link>
          <Link to="/search" className={styles.searchBtn}>Search anime</Link>
        </div>
      </div>
    </div>
  )
}

export default NotFound