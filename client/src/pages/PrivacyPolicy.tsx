import React, { useEffect } from 'react'
import { Link } from 'react-router-dom'
import styles from './PrivacyPolicy.module.css'

const PrivacyPolicy: React.FC = () => {
  useEffect(() => {
    document.title = 'Privacy Policy - ani-web'
  }, [])

  return (
    <div className={`page-container ${styles.page}`}>
      <header className={styles.header}>
        <span className={styles.label}>Privacy Policy</span>
        <h1>Privacy at ani-web</h1>
        <p>
          ani-web helps you discover anime, watch episodes, and keep track of viewing progress.
          This page explains what information is used when you browse as a guest or connect a
          synchronization provider.
        </p>
        <p className={styles.updated}>Effective date: May 25, 2026</p>
      </header>

      <div className={styles.policyGrid}>
        <section className={styles.section}>
          <h2>Information We Store</h2>
          <p>
            Guest sessions use a cookie so the app can keep your watch activity separate from other
            visitors. Watch progress and watchlist activity may be stored by the ani-web
            installation so those features work when you return.
          </p>
          <p>
            Your display name and profile picture customizations are stored locally in your browser
            on this device. Removing site storage from your browser removes those local profile
            customizations.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Optional Telemetry</h2>
          <p>
            If telemetry is enabled in Settings, ani-web stores an anonymous installation ID, app
            version, last-seen time, and general browser type. Watch history is not included in
            telemetry. You can disable telemetry and clear its local identifier in Settings.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Google Drive Synchronization</h2>
          <p>
            If the site administrator connects Google Drive synchronization, ani-web requests
            access to the connected Google profile and Drive storage only to identify the
            connected account and synchronize ani-web application data. Google data is not sold or
            used for advertising.
          </p>
          <p>
            Google Drive access can be disconnected from the synchronization settings and revoked
            through the connected Google account permissions page.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Your Choices</h2>
          <p>
            You may continue as a guest without connecting a Google account. Use Settings to
            manage browser profile details, telemetry, and any synchronization options made
            available to your account.
          </p>
        </section>
      </div>

      <div className={styles.actions}>
        <Link to="/" className={styles.homeLink}>
          Return home
        </Link>
        <Link to="/settings" className={styles.settingsLink}>
          Open settings
        </Link>
      </div>
    </div>
  )
}

export default PrivacyPolicy
