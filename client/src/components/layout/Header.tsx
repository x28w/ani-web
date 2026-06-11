import React, { useState, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { FaBars, FaSearch, FaChevronDown, FaListUl, FaCog, FaSignInAlt } from 'react-icons/fa'
import { useWatchQueue } from '../../contexts/WatchQueueContext'
import NotificationBell from './NotificationBell'
import Logo from '../common/Logo'
import { useSidebar } from '../../hooks/useSidebar'
import { useAuth } from '../../contexts/AuthContext'
import styles from './Header.module.css'

const Header: React.FC = () => {
  const { toggleSidebar } = useSidebar()
  const { queue } = useWatchQueue()
  const { user, guestSignInDismissed } = useAuth()
  const [query, setQuery] = useState('')
  const [visible, setVisible] = useState(true)
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [profileImageFailed, setProfileImageFailed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null)
  const HIDE_DELAY_MS = 3000

  useEffect(() => {
    setProfileImageFailed(false)
  }, [user?.profilePictureUrl])

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (!menuRef.current?.contains(target)) {
        setMenuOpen(false)
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

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

  const isGuest = user?.role === 'guest'
  const promptGuestSignIn = isGuest && !guestSignInDismissed
  const avatarSrc =
    user?.profilePictureUrl && !profileImageFailed ? user.profilePictureUrl : '/guest-avatar.png'
  const loginState = { from: `${location.pathname}${location.search}` }

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

        <div className={styles.userMenu} ref={menuRef}>
          <button
            type="button"
            className={styles.userMenuBtn}
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="User menu"
            aria-expanded={menuOpen}
          >
            <img
              src={avatarSrc}
              alt=""
              className={styles.userAvatar}
              referrerPolicy="no-referrer"
              onError={() => setProfileImageFailed(true)}
            />
            {queue.length > 0 && <span className={styles.queueDot} aria-hidden />}
            <FaChevronDown className={styles.chevron} aria-hidden />
          </button>

          {menuOpen && (
            <div className={styles.userDropdown} role="menu" aria-label="User menu">
              <Link
                to="/queue"
                className={styles.menuItem}
                onClick={() => setMenuOpen(false)}
                role="menuitem"
              >
                <FaListUl aria-hidden />
                <span>Queue</span>
                {queue.length > 0 && <span className={styles.menuBadge}>{queue.length}</span>}
              </Link>

              <Link
                to={promptGuestSignIn ? '/login' : '/settings'}
                state={promptGuestSignIn ? loginState : undefined}
                className={styles.menuItem}
                onClick={() => setMenuOpen(false)}
                role="menuitem"
              >
                <FaCog aria-hidden />
                <span>Settings</span>
              </Link>

              {isGuest && (
                <Link
                  to="/login"
                  state={loginState}
                  className={styles.menuItem}
                  onClick={() => setMenuOpen(false)}
                  role="menuitem"
                >
                  <FaSignInAlt aria-hidden />
                  <span>Sign in</span>
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

export default Header
