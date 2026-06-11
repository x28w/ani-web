import { Request, Response } from 'express'
import { AllAnimeProvider } from '../providers/allanime.provider'
import { Show } from '../providers/provider.interface'
import logger from '../logger'
import { InsightsRepository, MostWatchedTitle } from '../repositories/insights.repository'
import { asyncHandler } from '../utils/async-handler'

interface FavoriteGenre {
  name: string
  seconds: number
}

function parseGenres(value?: string): string[] {
  if (!value) return []

  try {
    if (value.startsWith('[')) {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.filter((genre) => typeof genre === 'string') : []
    }
  } catch (error) {
    logger.warn({ err: error }, 'Failed to parse genres for insights')
    return []
  }

  return value
    .split(',')
    .map((genre) => genre.trim())
    .filter(Boolean)
}

function buildFavoriteGenres(
  titles: { genres?: string; watchedSeconds: number }[]
): FavoriteGenre[] {
  const weights = new Map<string, number>()

  titles.forEach((title) => {
    parseGenres(title.genres).forEach((genre) => {
      weights.set(genre, (weights.get(genre) || 0) + Number(title.watchedSeconds || 0))
    })
  })

  return Array.from(weights.entries())
    .map(([name, seconds]) => ({ name, seconds }))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 5)
}

export class InsightsController {
  constructor(private provider: AllAnimeProvider) {}

  private async getRecommendations(
    watched: MostWatchedTitle[],
    favoriteGenres: FavoriteGenre[]
  ): Promise<Show[]> {
    if (watched.length === 0 || favoriteGenres.length === 0) return []

    const watchedIds = new Set(watched.map((title) => title.id))
    const recommendations = new Map<string, Show>()

    await Promise.all(
      favoriteGenres.slice(0, 2).map(async (genre) => {
        try {
          const matches = await this.provider.search({ genres: genre.name, limit: '8' })
          matches.forEach((show) => {
            if (!watchedIds.has(show._id) && !show.isAdult && !recommendations.has(show._id)) {
              recommendations.set(show._id, show)
            }
          })
        } catch (error) {
          logger.warn({ err: error, genre: genre.name }, 'Unable to load insight recommendations')
        }
      })
    )

    return Array.from(recommendations.values()).slice(0, 8)
  }

  getWatchInsights = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.siteUser?.username || 'local'
    const [summary, mostWatched, genreTitles, activity] = await Promise.all([
      InsightsRepository.getSummary(req.db, userId),
      InsightsRepository.getMostWatched(req.db, userId),
      InsightsRepository.getGenreTitles(req.db, userId),
      InsightsRepository.getActivity(req.db, userId),
    ])

    const favoriteGenres = buildFavoriteGenres(genreTitles)
    const recommendations = await this.getRecommendations(mostWatched, favoriteGenres)

    res.json({
      totalSeconds: Number(summary?.totalSeconds || 0),
      totalEpisodes: Number(summary?.totalEpisodes || 0),
      titlesWatched: Number(summary?.titlesWatched || 0),
      activeDays: Number(summary?.activeDays || 0),
      mostWatched: mostWatched.map((title) => ({
        ...title,
        watchedSeconds: Number(title.watchedSeconds || 0),
        episodesWatched: Number(title.episodesWatched || 0),
      })),
      favoriteGenres,
      activity: activity.map((day) => ({ ...day, seconds: Number(day.seconds || 0) })),
      recommendations,
    })
  })
}
