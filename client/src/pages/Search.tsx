import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  FaSearch,
  FaFilter,
  FaChevronDown,
  FaChevronUp,
  FaChevronLeft,
  FaChevronRight,
} from 'react-icons/fa'
import AnimeCard from '../components/anime/AnimeCard'
import SkeletonGrid from '../components/common/SkeletonGrid'
import { Button } from '../components/common/Button'
import ErrorMessage from '../components/common/ErrorMessage'
import SearchableSelect from '../components/common/SearchableSelect'
import {
  usePaginatedSearchAnime,
  useGenresAndStudios,
  useLatestReleases,
} from '../hooks/useAnimeData'
import { useLowEndMode } from '../contexts/LowEndModeContext'
import SearchDiscoverHub from '../components/search/SearchDiscoverHub'
import styles from './Search.module.css'

interface Option {
  value: string
  label: string
}

const typeOptions: Option[] = [
  { value: 'ALL', label: 'All Types' },
  { value: 'TV', label: 'TV Series' },
  { value: 'Movie', label: 'Movie' },
  { value: 'OVA', label: 'OVA' },
  { value: 'ONA', label: 'ONA' },
]

const seasonOptions: Option[] = [
  { value: 'ALL', label: 'All Seasons' },
  { value: 'Winter', label: 'Winter' },
  { value: 'Spring', label: 'Spring' },
  { value: 'Summer', label: 'Summer' },
  { value: 'Fall', label: 'Fall' },
]

const countryOptions: Option[] = [
  { value: 'ALL', label: 'All Countries' },
  { value: 'JP', label: 'Japan' },
  { value: 'CN', label: 'China' },
]

const FILTER_KEYS = ['type', 'season', 'year', 'country', 'studios', 'genres', 'excludeGenres']

const getGenreStateFromParams = (params: URLSearchParams) => {
  const states: { [key: string]: 'include' | 'exclude' } = {}
  params
    .get('genres')
    ?.split(',')
    .filter(Boolean)
    .forEach((genre) => {
      states[genre] = 'include'
    })
  params
    .get('excludeGenres')
    ?.split(',')
    .filter(Boolean)
    .forEach((genre) => {
      states[genre] = 'exclude'
    })
  return states
}

export default function Search() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('query') || '')
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1'))

  const [type, setType] = useState(searchParams.get('type') || 'ALL')
  const [season, setSeason] = useState(searchParams.get('season') || 'ALL')
  const [year, setYear] = useState(searchParams.get('year') || 'ALL')
  const [country, setCountry] = useState(searchParams.get('country') || 'ALL')
  const [studio, setStudio] = useState(searchParams.get('studios') || 'ALL')
  const [showFilters, setShowFilters] = useState(() =>
    FILTER_KEYS.some((key) => searchParams.has(key))
  )
  const { lowEndMode } = useLowEndMode()
  const resultsRef = useRef<HTMLDivElement>(null)

  const { data: latestReleases } = useLatestReleases()
  const { data: metaData } = useGenresAndStudios()
  const availableGenres = metaData?.genres || []
  const availableStudios = metaData?.studios || []

  const [genreStates, setGenreStates] = useState<{ [key: string]: 'include' | 'exclude' }>(() =>
    getGenreStateFromParams(searchParams)
  )

  // We only pass filters that are NOT 'page' to usePaginatedSearchAnime
  const filterParams = new URLSearchParams(searchParams)
  filterParams.delete('page')
  const filterString = filterParams.toString()

  const {
    data: results = [],
    isLoading,
    isError,
    error,
  } = usePaginatedSearchAnime(filterString, page, 14)

  const { data: nextPageData } = usePaginatedSearchAnime(filterString, page + 1, 14)

  useEffect(() => {
    setQuery(searchParams.get('query') || '')
    setType(searchParams.get('type') || 'ALL')
    setSeason(searchParams.get('season') || 'ALL')
    setYear(searchParams.get('year') || 'ALL')
    setCountry(searchParams.get('country') || 'ALL')
    setStudio(searchParams.get('studios') || 'ALL')
    setPage(parseInt(searchParams.get('page') || '1'))

    setGenreStates(getGenreStateFromParams(searchParams))
  }, [searchParams])

  const handleSearch = (newPage = 1) => {
    const params = new URLSearchParams()
    if (query.trim()) params.set('query', query.trim())

    if (type !== 'ALL') params.set('type', type)
    if (season !== 'ALL') params.set('season', season)
    if (year !== 'ALL') params.set('year', year)
    if (country !== 'ALL') params.set('country', country)
    if (studio !== 'ALL') params.set('studios', studio)

    const genres = Object.entries(genreStates)
      .filter(([, s]) => s === 'include')
      .map(([g]) => g)
    const exclude = Object.entries(genreStates)
      .filter(([, s]) => s === 'exclude')
      .map(([g]) => g)

    if (genres.length > 0) params.set('genres', genres.join(','))
    if (exclude.length > 0) params.set('excludeGenres', exclude.join(','))

    if (newPage > 1) params.set('page', newPage.toString())

    setSearchParams(params)
    if (newPage !== page) {
      setPage(newPage)
    }
  }

  const handlePageChange = (newPage: number) => {
    handleSearch(newPage)
    if (resultsRef.current) {
      const y = resultsRef.current.getBoundingClientRect().top + window.scrollY - 100
      window.scrollTo({ top: y, behavior: 'smooth' })
    }
  }

  const toggleGenre = (genre: string) => {
    setGenreStates((prev) => {
      const current = prev[genre]
      const next = current === 'include' ? 'exclude' : current === 'exclude' ? undefined : 'include'

      const newState = { ...prev }
      if (next) newState[genre] = next
      else delete newState[genre]

      return newState
    })
  }

  const currentYear = new Date().getFullYear()
  const yearOptions: Option[] = [
    { value: 'ALL', label: 'All Years' },
    ...Array.from({ length: currentYear - 1980 + 1 }, (_, i) => ({
      value: String(currentYear - i),
      label: String(currentYear - i),
    })),
  ]

  const studioOptions: Option[] = [
    { value: 'ALL', label: 'All Studios' },
    ...availableStudios.map((s) => ({ value: s, label: s })),
  ]

  const appliedQuery = searchParams.get('query')?.trim() || ''
  const activeFilterCount =
    [type, season, year, country, studio].filter((value) => value !== 'ALL').length +
    Object.keys(genreStates).length
  const showDiscoverHub = !appliedQuery && activeFilterCount === 0 && page === 1
  const canGoNext = results.length >= 14 && nextPageData && nextPageData.length > 0

  const resetFilters = () => {
    setType('ALL')
    setSeason('ALL')
    setYear('ALL')
    setCountry('ALL')
    setStudio('ALL')
    setGenreStates({})

    const params = new URLSearchParams()
    if (query.trim()) params.set('query', query.trim())
    setSearchParams(params)
    setPage(1)
  }

  return (
    <div className="page-container">
      <header className={styles.header}>
        <div>
          <p className={styles.pageEyebrow}>Catalog</p>
          <h1 className={styles.pageTitle}>Search</h1>
          <p className={styles.pageSubtitle}>Title, studio, season, or genre — stack filters when you need precision.</p>
        </div>
      </header>

      {showDiscoverHub && (
        <SearchDiscoverHub
          latest={latestReleases}
        />
      )}

      <form
        className={styles.searchToolbar}
        onSubmit={(event) => {
          event.preventDefault()
          handleSearch()
        }}
      >
        <div className={styles.searchBarWrapper}>
          <div className={styles.inputIconWrapper}>
            <FaSearch className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              aria-label="Search anime titles"
              placeholder="Search anime titles..."
              value={query}
              onInput={(e) => setQuery(e.currentTarget.value)}
            />
          </div>
          <div className={styles.searchActions}>
            <Button type="submit" className={styles.searchBtn}>
              <FaSearch size={13} />
              Search
            </Button>
            <button
              type="button"
              className={`${styles.filterToggleBtn} ${showFilters ? styles.active : ''}`}
              onClick={() => setShowFilters(!showFilters)}
              aria-expanded={showFilters}
              aria-controls="search-filters"
            >
              <FaFilter size={14} />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className={styles.filterCount}>{activeFilterCount}</span>
              )}
              {showFilters ? <FaChevronUp size={12} /> : <FaChevronDown size={12} />}
            </button>
          </div>
        </div>
      </form>

      {showFilters && (
        <div className={styles.filterContainer} id="search-filters">
          <div className={styles.filterGrid}>
            <div className={styles.filterItem}>
              <label>Type</label>
              <select value={type} onChange={(e) => setType(e.currentTarget.value)}>
                {typeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.filterItem}>
              <label>Season</label>
              <select value={season} onChange={(e) => setSeason(e.currentTarget.value)}>
                {seasonOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.filterItem}>
              <label>Year</label>
              <select value={year} onChange={(e) => setYear(e.currentTarget.value)}>
                {yearOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.filterItem}>
              <label>Country</label>
              <select value={country} onChange={(e) => setCountry(e.currentTarget.value)}>
                {countryOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            {studioOptions.length > 1 && (
              <div className={styles.filterItem}>
                <label>Studio</label>
                <SearchableSelect
                  options={studioOptions}
                  value={studio}
                  onChange={setStudio}
                  placeholder="All Studios"
                />
              </div>
            )}
          </div>

          {availableGenres.length > 0 && (
            <div className={styles.genreSection}>
              <label className={styles.genreLabel}>Genres</label>
              <div className={styles.genreContainer}>
                {availableGenres.map((g) => (
                  <button
                    type="button"
                    key={g}
                    className={`${styles.genreButton} ${styles[genreStates[g] || '']}`}
                    onClick={() => toggleGenre(g)}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={styles.filterActions}>
            <Button variant="secondary" onClick={resetFilters}>
              Reset All
            </Button>
            <Button onClick={() => handleSearch()} className={styles.applyBtn}>
              Apply Filters
            </Button>
          </div>
        </div>
      )}

      {isError && <ErrorMessage message={error?.message || 'Error'} />}

      {!showDiscoverHub && (
        <>
          <div className={styles.resultsHeader} ref={resultsRef}>
            <div>
              <h2 className={styles.resultsTitle}>
                {appliedQuery ? `Results for "${appliedQuery}"` : 'Browse Anime'}
              </h2>
              {!isLoading && !isError && (
                <span className={styles.itemCount}>
                  {results.length === 0
                    ? 'No matching titles'
                    : `${results.length} titles on page ${page}`}
                </span>
              )}
            </div>

            {results.length > 0 && (
              <div className={styles.pagination}>
                <button
                  className={styles.pageBtn}
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page === 1 || isLoading}
                >
                  <FaChevronLeft size={14} />
                </button>
                <span className={styles.pageInfo}>
                  Page <strong>{page}</strong>
                </span>
                <button
                  className={styles.pageBtn}
                  onClick={() => handlePageChange(page + 1)}
                  disabled={!canGoNext || isLoading}
                >
                  <FaChevronRight size={14} />
                </button>
              </div>
            )}
          </div>

          {isLoading ? (
            <SkeletonGrid />
          ) : results.length > 0 ? (
            <div className={`${styles.resultsGrid} ${lowEndMode ? styles.lowEnd : ''}`}>
              {results.map((anime) => (
                <AnimeCard key={anime._id} anime={anime} />
              ))}
            </div>
          ) : null}

          {!isLoading && !isError && results.length === 0 && (
            <div className={styles.noResults}>
              <FaSearch size={30} className={styles.noResultsIcon} />
              <h3>No results found</h3>
              <p>Try another title or loosen one of your filters.</p>
            </div>
          )}

          {results.length > 0 && (
            <div className={styles.bottomPagination}>
              <div className={styles.pagination}>
                <button
                  className={styles.pageBtn}
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page === 1 || isLoading}
                >
                  <FaChevronLeft size={14} />
                  <span>Previous</span>
                </button>
                <span className={styles.pageInfo}>
                  Page <strong>{page}</strong>
                </span>
                <button
                  className={styles.pageBtn}
                  onClick={() => handlePageChange(page + 1)}
                  disabled={!canGoNext || isLoading}
                >
                  <span>Next</span>
                  <FaChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
