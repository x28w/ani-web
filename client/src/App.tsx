import { useEffect, Suspense, lazy } from 'react'
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom'
import Header from './components/layout/Header'
import Sidebar from './components/layout/Sidebar'
import Footer from './components/layout/Footer'
import ScrollToTopButton from './components/common/ScrollToTopButton'
import { useTelemetry } from './hooks/useTelemetry'

const Home = lazy(() => import('./pages/Home'))
const Watchlist = lazy(() => import('./pages/Watchlist'))
const Settings = lazy(() => import('./pages/Settings'))
const Player = lazy(() => import('./pages/Player'))
const Search = lazy(() => import('./pages/Search'))
const MAL = lazy(() => import('./pages/MAL'))
const Insights = lazy(() => import('./pages/Insights'))
const AnimeInfoPage = lazy(() => import('./pages/AnimeInfoPage'))
const Login = lazy(() => import('./pages/Login'))
const Queue = lazy(() => import('./pages/Queue'))
const NotFound = lazy(() => import('./pages/NotFound'))

import { useSidebar } from './hooks/useSidebar'
import { Toaster } from 'react-hot-toast'
import TopProgressBar from './components/common/TopProgressBar'
import ErrorBoundary from './components/common/ErrorBoundary'
import { useAuth } from './contexts/AuthContext'

const PlayerRedirect = () => {
  const { id, episodeNumber } = useParams()
  return <Navigate to={episodeNumber ? `/watch/${id}/${episodeNumber}` : `/watch/${id}`} replace />
}

function App() {
  const { isOpen, setIsOpen } = useSidebar()
  const { authenticated, loading, user } = useAuth()
  const location = useLocation()
  useTelemetry()

  const mainClass =
    location.pathname === '/'
      ? 'main--home'
      : location.pathname.startsWith('/watch')
        ? 'main--watch'
        : location.pathname === '/search'
          ? 'main--search'
          : location.pathname === '/settings'
            ? 'main--settings'
            : ''

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (isOpen && event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.body.classList.add('sidebar-open')
    } else {
      document.body.classList.remove('sidebar-open')
    }

    window.addEventListener('keydown', handleKeydown)

    return () => {
      window.removeEventListener('keydown', handleKeydown)
      document.body.classList.remove('sidebar-open')
    }
  }, [isOpen, setIsOpen])

  const toaster = (
    <Toaster
      position="top-center"
      toastOptions={{
        style: {
          background: '#262829',
          color: '#fff',
          border: '1px solid #444',
        },
        success: {
          style: {
            background: 'var(--accent)',
            color: '#fff',
          },
          iconTheme: {
            primary: '#fff',
            secondary: 'var(--accent)',
          },
        },
        error: {
          style: {
            background: '#992a2a',
            color: '#fff',
          },
        },
      }}
    />
  )

  if (loading) {
    return (
      <>
        {toaster}
        <TopProgressBar />
      </>
    )
  }

  if (!authenticated || (user?.role === 'guest' && location.pathname === '/login')) {
    return (
      <>
        {toaster}
        <Suspense fallback={<TopProgressBar />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="*"
              element={
                <Navigate
                  to={authenticated ? '/' : '/login'}
                  state={{ from: `${location.pathname}${location.search}` }}
                  replace
                />
              }
            />
          </Routes>
        </Suspense>
      </>
    )
  }

  return (
    <div className="app-container">
      {toaster}
      <Header />
      <Sidebar />
      <main className={`${mainClass} page-enter`}>
        <ErrorBoundary>
          <Suspense fallback={<TopProgressBar />}>
            <Routes>
              <Route path="/login" element={<Navigate to="/" replace />} />
              <Route path="/" element={<Home />} />
              <Route path="/watchlist/:filter?" element={<Watchlist />} />
              <Route path="/search" element={<Search />} />
              <Route path="/queue" element={<Queue />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/mal" element={<MAL />} />
              <Route path="/insights" element={<Insights />} />
              <Route path="/anime/:id" element={<AnimeInfoPage />} />
              <Route path="/watch/:id" element={<Player />} />
              <Route path="/watch/:id/:episodeNumber" element={<Player />} />
              <Route path="/player/:id" element={<PlayerRedirect />} />
              <Route path="/player/:id/:episodeNumber" element={<PlayerRedirect />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
      <ScrollToTopButton />
    </div>
  )
}

export default App
