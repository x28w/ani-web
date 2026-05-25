import React from 'react'
import { Link } from 'react-router-dom'
import styles from './Footer.module.css'

const Footer: React.FC = () => {
  return (
    <footer>
      <p className={styles.purpose}>Discover anime and keep track of what you have watched.</p>
      <Link to="/privacy" className={styles.privacyLink}>
        Copyright 2026 · Privacy Policy
      </Link>
    </footer>
  )
}

export default Footer
