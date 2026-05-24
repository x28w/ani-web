import { DatabaseWrapper } from '../db'
import { dbAll, dbGet } from '../utils/db-utils'

export interface InsightSummary {
  totalSeconds: number
  totalEpisodes: number
  titlesWatched: number
  activeDays: number
}

export interface MostWatchedTitle {
  id: string
  name: string
  nativeName?: string
  englishName?: string
  thumbnail?: string
  type?: string
  watchedSeconds: number
  episodesWatched: number
  genres?: string
}

export interface ActivityDay {
  day: string
  seconds: number
}

export const InsightsRepository = {
  getSummary: (db: DatabaseWrapper, userId: string) =>
    dbGet<InsightSummary>(
      db,
      `SELECT
        COALESCE(SUM(watchedSeconds), 0) AS totalSeconds,
        COUNT(DISTINCT showId || ':' || episodeNumber) AS totalEpisodes,
        COUNT(DISTINCT showId) AS titlesWatched,
        (SELECT COUNT(DISTINCT day) FROM watch_activity WHERE userId = ?) AS activeDays
       FROM watched_episodes
       WHERE userId = ? AND watchedSeconds > 0`,
      [userId, userId]
    ),

  getMostWatched: (db: DatabaseWrapper, userId: string, limit = 6) =>
    dbAll<MostWatchedTitle>(
      db,
      `SELECT
        we.showId AS id,
        COALESCE(NULLIF(sm.name, ''), NULLIF(sm.englishName, ''), we.showId) AS name,
        sm.nativeName,
        sm.englishName,
        sm.thumbnail,
        sm.type,
        SUM(we.watchedSeconds) AS watchedSeconds,
        COUNT(DISTINCT we.episodeNumber) AS episodesWatched,
        sm.genres
       FROM watched_episodes we
       LEFT JOIN shows_meta sm ON sm.id = we.showId
       WHERE we.userId = ? AND we.watchedSeconds > 0
       GROUP BY we.showId
       ORDER BY watchedSeconds DESC, MAX(we.watchedAt) DESC
       LIMIT ?`,
      [userId, limit]
    ),

  getGenreTitles: (db: DatabaseWrapper, userId: string) =>
    dbAll<{ id: string; genres?: string; watchedSeconds: number }>(
      db,
      `SELECT we.showId AS id, sm.genres, SUM(we.watchedSeconds) AS watchedSeconds
       FROM watched_episodes we
       LEFT JOIN shows_meta sm ON sm.id = we.showId
       WHERE we.userId = ? AND we.watchedSeconds > 0
       GROUP BY we.showId`,
      [userId]
    ),

  getActivity: (db: DatabaseWrapper, userId: string) =>
    dbAll<ActivityDay>(
      db,
      `SELECT day, SUM(seconds) AS seconds
       FROM watch_activity
       WHERE userId = ? AND seconds > 0 AND day >= date('now', '-29 days')
       GROUP BY day
       ORDER BY day ASC`,
      [userId]
    ),
}
