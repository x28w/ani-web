import React, { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { FaLock } from 'react-icons/fa'
import { useAuth } from '../contexts/AuthContext'
import styles from './Login.module.css'

interface LoginLocationState {
  from?: string
}

const Login: React.FC = () => {
  const { authenticated, enabled, login, browseAsGuest } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const locationState = location.state as LoginLocationState | null
  const redirectTo = locationState?.from || '/'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    document.title = 'Sign in - ani-web'
  }, [])

  if (authenticated) {
    return <Navigate to={redirectTo} replace />
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      await login(username, password)
      navigate(redirectTo, { replace: true })
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Unable to sign in.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleGuestBrowse = async () => {
    setError('')
    setIsSubmitting(true)

    try {
      await browseAsGuest()
      navigate('/', { replace: true })
    } catch (guestError) {
      setError(guestError instanceof Error ? guestError.message : 'Unable to browse as guest.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={styles.loginPage}>
      <form className={styles.loginPanel} onSubmit={handleSubmit}>
        <img src="/logo.png" alt="ani-web" className={styles.logo} />
        <div className={styles.heading}>
          <FaLock />
          <div>
            <h1>Sign in</h1>
            <p>{enabled ? 'Enter your ani-web account.' : 'Site login is not configured.'}</p>
          </div>
        </div>

        <label className={styles.field}>
          <span>Username</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.currentTarget.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </label>

        <label className={styles.field}>
          <span>Password</span>
          <input
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
            type="password"
            autoComplete="current-password"
            required
          />
        </label>

        {error && <p className={styles.error}>{error}</p>}

        <button className={styles.submitButton} disabled={isSubmitting || !enabled}>
          {isSubmitting ? 'Signing in...' : 'Sign in'}
        </button>

        <button
          type="button"
          className={styles.guestButton}
          onClick={handleGuestBrowse}
          disabled={isSubmitting}
        >
          Browse as guest
        </button>
      </form>
    </div>
  )
}

export default Login
