import React, { useState, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { FaBars, FaSearch, FaUserCircle } from 'react-icons/fa'
import NotificationBell from './NotificationBell'
import Logo from '../common/Logo'
import { useSidebar } from '../../hooks/useSidebar'
import { useAuth } from '../../contexts/AuthContext'
import styles from './Header.module.css'

const Header: React.FC = () => {
  const { toggleSidebar } = useSidebar()
  const { user, guestSignInDismissed } = useAuth()
  const [query, setQuery] = useState('')
  const [visible, setVisible] = useState(true)
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [profileImageFailed, setProfileImageFailed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null)
  const HIDE_DELAY_MS = 3000

  useEffect(() => {
    setProfileImageFailed(false)
  }, [user?.profilePictureUrl])

  useEffect(() => {
    const handleScroll = () => {
      setVisible(true)

      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
      }

      hideTimerRef.current = setTimeout(() => {
        if (window.scrollY > 100 && !isSearchFocused) {
          setVisible(false)
        }
      }, HIDE_DELAY_MS)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
      }
    }
  }, [isSearchFocused])

  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (query.trim()) {
      navigate(`/search?query=${encodeURIComponent(query.trim())}`)
    }
  }

  const promptGuestSignIn = user?.role === 'guest' && !guestSignInDismissed
  const profileDestination = promptGuestSignIn ? '/login' : '/settings'

  return (
    <header className={`${styles.header} ${visible ? '' : styles.hidden}`}>
      <div className={styles.leftSection}>
        <button className={styles.hamburgerBtn} onClick={toggleSidebar} aria-label="Menu">
          <FaBars />
        </button>
        <Link to="/" className={styles.logo} aria-label="Ani-Web Home">
          <Logo />
        </Link>
      </div>

      <div className={styles.rightSection}>
        <form onSubmit={handleSearch} className={styles.searchContainer}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search anime..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
          />
          <button type="submit" className={styles.searchButton} aria-label="Search">
            <FaSearch className={styles.searchIcon} />
          </button>
        </form>

        <NotificationBell />

        <Link
          to={profileDestination}
          state={
            promptGuestSignIn ? { from: `${location.pathname}${location.search}` } : undefined
          }
          className={styles.profileBtn}
          aria-label={promptGuestSignIn ? 'Sign in or continue as guest' : 'Profile settings'}
        >
          {user?.profilePictureUrl && !profileImageFailed ? (
            <img
              src={user.profilePictureUrl}
              alt={user.displayName}
              className={styles.profileImg}
              referrerPolicy="no-referrer"
              onError={() => setProfileImageFailed(true)}
            />
          ) : (
            <FaUserCircle />
          )}
        </Link>
      </div>
    </header>
  )
}

export default Header
