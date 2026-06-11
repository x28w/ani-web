import React from 'react'
import { NavLink } from 'react-router-dom'
import { useSidebar } from '../../hooks/useSidebar'
import styles from './Sidebar.module.css'
import {
  FaHome,
  FaSearch,
  FaClock,
  FaFileImport,
  FaCog,
  FaChartPie,
  FaListUl,
} from 'react-icons/fa'
import Logo from '../common/Logo'

const navClass = ({ isActive }: { isActive: boolean }) =>
  `${styles.navLink} navLink${isActive ? ` ${styles.active}` : ''}`

const Sidebar: React.FC = () => {
  const { isOpen, setIsOpen } = useSidebar()

  const handleNavLinkClick = () => {
    setIsOpen(false)
  }

  return (
    <>
      <aside className={`${styles.sidebar} ${isOpen ? styles.open : ''} sidebar`}>
        <div className={styles.sidebarHeader}>
          <NavLink to="/" className={styles.logo} onClick={handleNavLinkClick} end>
            <Logo />
          </NavLink>
          <button
            className={`${styles.closeBtn} closeBtn`}
            onClick={() => setIsOpen(false)}
            aria-label="Close menu"
          >
            &times;
          </button>
        </div>

        <nav className={styles.nav} aria-label="Main">
          <p className={styles.navGroup}>Browse</p>
          <NavLink to="/" className={navClass} onClick={handleNavLinkClick} end>
            <FaHome aria-hidden />
            <span>Home</span>
          </NavLink>
          <NavLink to="/search" className={navClass} onClick={handleNavLinkClick}>
            <FaSearch aria-hidden />
            <span>Search</span>
          </NavLink>
          <NavLink to="/watchlist" className={navClass} onClick={handleNavLinkClick}>
            <FaClock aria-hidden />
            <span>Watchlist</span>
          </NavLink>
          <NavLink to="/queue" className={navClass} onClick={handleNavLinkClick}>
            <FaListUl aria-hidden />
            <span>Queue</span>
          </NavLink>

          <p className={styles.navGroup}>Library</p>
          <NavLink to="/insights" className={navClass} onClick={handleNavLinkClick}>
            <FaChartPie aria-hidden />
            <span>Insights</span>
          </NavLink>
          <NavLink to="/mal" className={navClass} onClick={handleNavLinkClick}>
            <FaFileImport aria-hidden />
            <span>MAL Import</span>
          </NavLink>
        </nav>

        <div className={styles.sidebarFooter}>
          <NavLink to="/settings" className={navClass} onClick={handleNavLinkClick}>
            <FaCog aria-hidden />
            <span>Settings</span>
          </NavLink>
        </div>
      </aside>
      {isOpen && (
        <div
          className={styles.overlay}
          onClick={() => setIsOpen(false)}
          aria-label="Close sidebar"
        />
      )}
    </>
  )
}

export default Sidebar
