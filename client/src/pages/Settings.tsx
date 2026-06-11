import React, { useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '../components/common/Button'
import { Input } from '../components/common/Input'
import TitlePreferenceToggle from '../components/common/TitlePreferenceToggle'
import styles from './Settings.module.css'
import GitHubSyncSettings from '../components/settings/GitHubSyncSettings'
import GoogleAuthSettings from '../components/settings/GoogleAuthSettings'
import WatchlistSettings from '../components/settings/WatchlistSettings'
import RcloneSettings from '../components/settings/RcloneSettings'
import SyncProviderSelector from '../components/settings/SyncProviderSelector'
import {
  FaCog,
  FaCloud,
  FaDatabase,
  FaList,
  FaSignInAlt,
  FaSignOutAlt,
  FaSave,
  FaUpload,
} from 'react-icons/fa'
import { useLowEndMode } from '../contexts/LowEndModeContext'
import { useAuth } from '../contexts/AuthContext'
import ToggleSwitch from '../components/common/ToggleSwitch'
import packageJson from '../../../package.json'
import { deleteTelemetryData } from '../hooks/useTelemetry'

type SettingsTab = 'general' | 'sync' | 'watchlist' | 'database'

const Settings: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user, logout, maxProfilePictureBytes, updateDisplayName, uploadProfilePicture } =
    useAuth()
  const initialTab = searchParams.get('tab') as SettingsTab | null
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    initialTab && ['general', 'sync', 'watchlist', 'database'].includes(initialTab)
      ? initialTab
      : 'general'
  )
  const [statusMessage, setStatusMessage] = useState('')
  const [profileStatus, setProfileStatus] = useState('')
  const [profileImageFailed, setProfileImageFailed] = useState(false)
  const [displayName, setDisplayName] = useState(user?.displayName || '')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const profileInputRef = useRef<HTMLInputElement>(null)
  const { lowEndMode, setLowEndMode } = useLowEndMode()
  const isAdmin = user?.role === 'admin'
  const isGuest = user?.role === 'guest'

  const isTabAllowed = React.useCallback(
    (tab: SettingsTab) => tab === 'general' || (!isGuest && tab === 'watchlist') || isAdmin,
    [isAdmin, isGuest]
  )
  const [telemetryEnabled, setTelemetryEnabled] = useState(
    localStorage.getItem('telemetry_enabled') !== 'false'
  )

  const toggleTelemetry = (enabled: boolean) => {
    setTelemetryEnabled(enabled)
    localStorage.setItem('telemetry_enabled', String(enabled))
    if (!enabled) {
      deleteTelemetryData()
    }
  }

  React.useEffect(() => {
    document.title = 'Settings - ani-web'
  }, [])

  React.useEffect(() => {
    setProfileImageFailed(false)
  }, [user?.profilePictureUrl])

  React.useEffect(() => {
    setDisplayName(user?.displayName || user?.username || '')
  }, [user?.displayName, user?.username])

  React.useEffect(() => {
    const tab = searchParams.get('tab') as SettingsTab | null
    if (tab && ['general', 'sync', 'watchlist', 'database'].includes(tab) && isTabAllowed(tab)) {
      setActiveTab(tab)
      return
    }

    if (!isTabAllowed(activeTab)) {
      setActiveTab('general')
      setSearchParams({})
    }
  }, [activeTab, isTabAllowed, searchParams, setSearchParams])

  const selectTab = (tab: SettingsTab) => {
    if (!isTabAllowed(tab)) return
    setActiveTab(tab)
    setSearchParams(tab === 'general' ? {} : { tab })
  }

  const handleBackup = async () => {
    setStatusMessage('Backing up database...')
    try {
      const response = await fetch('/api/backup-db')
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'ani-web-backup.db'
        document.body.appendChild(a)
        a.click()
        a.remove()
        window.URL.revokeObjectURL(url)
        setStatusMessage('Database backup successful!')
      } else {
        const errorData = await response.json()
        setStatusMessage(`Backup failed: ${errorData.error}`)
      }
    } catch (_error) {
      setStatusMessage('Backup failed: An unexpected error occurred.')
    }
  }

  const handleRestore = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setStatusMessage('Restoring database...')
    const formData = new FormData()
    formData.append('dbfile', file)

    try {
      const response = await fetch('/api/restore-db', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (response.ok) {
        setStatusMessage(result.message || 'Database restored successfully!')
        setTimeout(() => window.location.reload(), 2000)
      } else {
        setStatusMessage(`Restore failed: ${result.error}`)
      }
    } catch (_error) {
      setStatusMessage('Restore failed: An unexpected error occurred.')
    }
  }

  const triggerFileSelect = () => {
    fileInputRef.current?.click()
  }

  const triggerProfileFileSelect = () => {
    profileInputRef.current?.click()
  }

  const handleProfilePictureChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (file.size > maxProfilePictureBytes) {
      setProfileStatus('Profile picture must be 1 MB or smaller.')
      return
    }

    setProfileStatus('Saving profile picture in this browser...')
    try {
      await uploadProfilePicture(file)
      setProfileImageFailed(false)
      setProfileStatus('Profile picture saved in this browser.')
    } catch (error) {
      setProfileStatus(error instanceof Error ? error.message : 'Profile picture upload failed.')
    }
  }

  const handleDisplayNameSave = async (event: React.FormEvent) => {
    event.preventDefault()
    setProfileStatus('Saving display name in this browser...')
    try {
      await updateDisplayName(displayName)
      setProfileStatus(
        displayName.trim()
          ? 'Display name saved in this browser.'
          : 'Browser display name reset to your account name.'
      )
    } catch (error) {
      setProfileStatus(error instanceof Error ? error.message : 'Display name change failed.')
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const handleSignIn = () => {
    navigate('/login', { state: { from: '/settings' } })
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <div className={styles.tabContent}>
            <div className={`${styles.sectionCard} ${styles.profileCard}`}>
              <div className={styles.sectionHeading}>
                <h3>Profile</h3>
              </div>
              <div className={styles.profileRow}>
                <div className={styles.profileAvatar}>
                  <img
                    src={
                      user?.profilePictureUrl && !profileImageFailed
                        ? user.profilePictureUrl
                        : '/guest-avatar.svg'
                    }
                    alt={user?.displayName || user?.username || 'Profile'}
                    onError={() => setProfileImageFailed(true)}
                  />
                </div>
                <div className={styles.profileDetails}>
                  <h4>{user?.displayName || user?.username}</h4>
                  <span>{isAdmin ? 'Admin' : isGuest ? 'Guest' : 'User'}</span>
                </div>
                <div className={styles.profileActions}>
                  <Button onClick={triggerProfileFileSelect}>
                    <FaUpload /> Profile picture
                  </Button>
                  {isGuest ? (
                    <Button variant="secondary" onClick={handleSignIn}>
                      <FaSignInAlt /> Sign in
                    </Button>
                  ) : (
                    <Button variant="secondary" onClick={handleLogout}>
                      <FaSignOutAlt /> Sign out
                    </Button>
                  )}
                </div>
              </div>
              <form className={styles.profileEditor} onSubmit={handleDisplayNameSave}>
                <Input
                  id="profile-display-name"
                  label="Display name"
                  value={displayName}
                  maxLength={40}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder={user?.username || 'Display name'}
                />
                <Button type="submit" variant="secondary">
                  <FaSave /> Save name
                </Button>
              </form>
              <input
                type="file"
                ref={profileInputRef}
                onChange={handleProfilePictureChange}
                style={{ display: 'none' }}
                accept="image/png,image/jpeg,image/webp,image/gif"
              />
              {profileStatus && <p className={styles.status}>{profileStatus}</p>}
            </div>
            <div className={styles.preferenceGrid}>
              <div className={styles.sectionCard}>
                <h3>Preferences</h3>
                <p className={styles.sectionIntro}>
                  Adjust display and performance for this device.
                </p>
                <div className={styles.settingsList}>
                  <div className={styles.titlePreference}>
                    <TitlePreferenceToggle title="Title language" />
                  </div>
                  <div className={styles.preferenceRow}>
                    <div className={styles.preferenceCopy}>
                      <h4>Low End Mode</h4>
                      <p>Reduce animations and heavy visual effects on slower hardware.</p>
                    </div>
                    <ToggleSwitch
                      isChecked={lowEndMode}
                      onChange={(e) => setLowEndMode(e.target.checked)}
                      id="low-end-mode"
                    />
                  </div>
                </div>
              </div>

              <div className={styles.sectionCard}>
                <h3>Privacy</h3>
                <p className={styles.sectionIntro}>Control optional installation telemetry.</p>
                <div className={styles.settingsList}>
                  <div className={styles.preferenceRow}>
                    <div className={styles.preferenceCopy}>
                      <h4>Telemetry Tracking</h4>
                      <p>
                        Share an anonymous installation ID, app version, last-seen time, and browser
                        type. Watch history is not included.
                      </p>
                    </div>
                    <ToggleSwitch
                      isChecked={telemetryEnabled}
                      onChange={(e) => toggleTelemetry(e.target.checked)}
                      id="telemetry-enabled"
                    />
                  </div>
                </div>
                {telemetryEnabled && (
                  <details className={styles.telemetryDetails}>
                    <summary>View shared installation details</summary>
                    <div className={styles.telemetryData}>
                      <div>
                        <span>Installation ID</span>
                        <code>{localStorage.getItem('installation_id') || 'Not assigned yet'}</code>
                      </div>
                      <div>
                        <span>Version</span>
                        <code>{packageJson.version}</code>
                      </div>
                      <div>
                        <span>Browser</span>
                        <code>{navigator.userAgent.substring(0, 60)}...</code>
                      </div>
                    </div>
                  </details>
                )}
              </div>
            </div>
          </div>
        )
      case 'sync':
        if (!isAdmin) return null
        return (
          <div className={styles.tabContent}>
            <SyncProviderSelector />
            <GitHubSyncSettings />
            <GoogleAuthSettings />
            <RcloneSettings />
          </div>
        )
      case 'watchlist':
        return (
          <div className={styles.tabContent}>
            <WatchlistSettings />
          </div>
        )
      case 'database':
        if (!isAdmin) return null
        return (
          <div className={styles.tabContent}>
            <div className={styles.sectionCard}>
              <h3>Database Management</h3>
              <p>Download a backup of your current database or restore from an existing file.</p>
              <div className={styles.controls}>
                <Button onClick={handleBackup}>Backup Database</Button>
                <Button variant="secondary" onClick={triggerFileSelect}>
                  Restore Database
                </Button>
              </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleRestore}
                style={{ display: 'none' }}
                accept=".db"
              />
              {statusMessage && <p className={styles.status}>{statusMessage}</p>}
            </div>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="page-container">
      <div className={styles.settingsHeader}>
        <p className={styles.pageEyebrow}>Account</p>
        <h1 className={styles.pageTitle}>Settings</h1>
        <p className={styles.pageSubtitle}>Profile, playback, and privacy — kept in one place.</p>
      </div>

      <div className={styles.settingsLayout}>
        <aside className={styles.sidebar}>
          <button
            className={`${styles.sidebarItem} ${activeTab === 'general' ? styles.active : ''}`}
            onClick={() => selectTab('general')}
          >
            <FaCog /> <span>General</span>
          </button>
          {isAdmin && (
            <button
              className={`${styles.sidebarItem} ${activeTab === 'sync' ? styles.active : ''}`}
              onClick={() => selectTab('sync')}
            >
              <FaCloud /> <span>Synchronization</span>
            </button>
          )}
          {!isGuest && (
            <button
              className={`${styles.sidebarItem} ${activeTab === 'watchlist' ? styles.active : ''}`}
              onClick={() => selectTab('watchlist')}
            >
              <FaList /> <span>Watchlist</span>
            </button>
          )}
          {isAdmin && (
            <button
              className={`${styles.sidebarItem} ${activeTab === 'database' ? styles.active : ''}`}
              onClick={() => selectTab('database')}
            >
              <FaDatabase /> <span>Database</span>
            </button>
          )}
        </aside>

        <main className={styles.mainContent}>{renderTabContent()}</main>
      </div>
    </div>
  )
}

export default Settings
