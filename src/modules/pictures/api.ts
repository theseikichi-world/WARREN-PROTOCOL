// ─── GALACTIC PICTURES data layer ─────────────────────────────────────────────
// The old Foxy used Next.js server routes (kino.kz/IMDB scraping, Steam, Groq).
// A Tauri webview enforces CORS, so this port goes direct to CORS-friendly APIs:
//   TMDB  → movies, TV, search, seasons, posters, credits, next episodes
//   RAWG  → games with Metacritic
//   IMDB suggestion API → tried first for search (best-in-class), TMDB fallback
//   Claude (aiChat) → metadata fallback only when no TMDB key is set
// Discover results are cached in localStorage for 30 min.

import {
  type DiscoverItem, type Candidate, type EpisodeInfo, type GameEntry,
  type MediaItem, type MediaType, vibeFor,
} from './types'
import { aiJson, loadSettings, modelForTask } from '../../settings'

const TMDB_BASE = 'https://api.themoviedb.org/3'
const TMDB_IMG  = 'https://image.tmdb.org/t/p/w300'
const RAWG_BASE = 'https://api.rawg.io/api'

const MOVIE_GENRES: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  18: 'Drama', 10751: 'Family', 14: 'Fantasy', 27: 'Horror', 9648: 'Mystery',
  10749: 'Romance', 878: 'Sci-Fi', 53: 'Thriller', 10752: 'War', 37: 'Western',
  99: 'Documentary', 36: 'History', 10402: 'Music',
}
const TV_GENRES: Record<number, string> = {
  10759: 'Action', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 18: 'Drama',
  10751: 'Family', 9648: 'Mystery', 10765: 'Sci-Fi', 10768: 'War', 37: 'Western',
  99: 'Documentary',
}

export function tmdbKey(): string {
  return loadSettings().tmdbApiKey?.trim() ?? ''
}
export function rawgKey(): string {
  return loadSettings().rawgApiKey?.trim() ?? ''
}

async function tmdb(path: string): Promise<Record<string, unknown>> {
  const key = tmdbKey()
  if (!key) throw new Error('No TMDB key')
  const sep = path.includes('?') ? '&' : '?'
  const r = await fetch(`${TMDB_BASE}${path}${sep}api_key=${key}&language=en-US`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(9000),
  })
  if (!r.ok) throw new Error(`TMDB ${r.status}`)
  return r.json()
}

async function rawg(path: string): Promise<Record<string, unknown>> {
  const key = rawgKey()
  if (!key) throw new Error('No RAWG key')
  const sep = path.includes('?') ? '&' : '?'
  const r = await fetch(`${RAWG_BASE}${path}${sep}key=${key}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  })
  if (!r.ok) throw new Error(`RAWG ${r.status}`)
  return r.json()
}

const EP_NULL = {
  next_episode_date: null as string | null,
  current_season: null as number | null,
  episodes_aired: null as number | null,
  episodes_total: null as number | null,
  air_schedule: null as string | null,
}

// ─── Search ───────────────────────────────────────────────────────────────────
interface ImdbSuggestRow {
  id: string; l: string; y?: number; q?: string; s?: string; i?: { imageUrl: string }
}

/** IMDB suggestion API first (rich + fast); TMDB multi-search fallback. */
export async function searchTitles(query: string): Promise<Candidate[]> {
  const q = query.trim()
  if (!q) return []

  // 1. IMDB suggestion endpoint (CORS-permissive)
  try {
    const firstChar = q[0].toLowerCase().replace(/[^a-z0-9]/, 'a')
    const r = await fetch(`https://v2.sg.media-imdb.com/suggestion/${firstChar}/${encodeURIComponent(q.toLowerCase())}.json`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(7000),
    })
    if (r.ok) {
      const data = await r.json()
      const rows: ImdbSuggestRow[] = data.d ?? []
      const out = rows
        .filter(x => x.id?.startsWith('tt'))
        .slice(0, 6)
        .map<Candidate>(x => ({
          imdb_id: x.id, tmdb_id: null,
          title: x.l, year: x.y ?? null,
          type: (x.q === 'TV series' || x.q === 'TV mini-series' || x.q === 'TV short' || x.q === 'TV movie') ? 'tv' : 'movie',
          cast: x.s ?? '',
          image_url: x.i?.imageUrl ?? null,
        }))
      if (out.length > 0) return out
    }
  } catch { /* CORS or network — fall through to TMDB */ }

  // 2. TMDB multi-search
  if (!tmdbKey()) return []
  try {
    const data = await tmdb(`/search/multi?query=${encodeURIComponent(q)}&include_adult=false`) as {
      results?: Array<{ id: number; media_type: string; title?: string; name?: string
        release_date?: string; first_air_date?: string; poster_path?: string | null }>
    }
    return (data.results ?? [])
      .filter(x => x.media_type === 'movie' || x.media_type === 'tv')
      .slice(0, 6)
      .map<Candidate>(x => ({
        imdb_id: null, tmdb_id: x.id,
        title: x.title ?? x.name ?? '?',
        year: (() => { const d = x.release_date ?? x.first_air_date; return d ? parseInt(d.slice(0, 4)) : null })(),
        type: x.media_type === 'tv' ? 'tv' : 'movie',
        cast: '',
        image_url: x.poster_path ? `${TMDB_IMG}${x.poster_path}` : null,
      }))
  } catch {
    return []
  }
}

// ─── Title details (replaces the IMDB-scrape + Groq route) ───────────────────
export type DetailsResult = Partial<MediaItem>

interface TmdbCredits {
  cast?: Array<{ name: string }>
  crew?: Array<{ name: string; job: string }>
}

async function resolveTmdbId(c: Candidate): Promise<{ id: number; type: 'movie' | 'tv' } | null> {
  if (c.tmdb_id) return { id: c.tmdb_id, type: c.type }
  if (c.imdb_id && tmdbKey()) {
    try {
      const found = await tmdb(`/find/${c.imdb_id}?external_source=imdb_id`) as {
        movie_results?: Array<{ id: number }>; tv_results?: Array<{ id: number }>
      }
      if (found.tv_results?.[0]) return { id: found.tv_results[0].id, type: 'tv' }
      if (found.movie_results?.[0]) return { id: found.movie_results[0].id, type: 'movie' }
    } catch { /* fall through */ }
  }
  return null
}

const DAY_NAMES = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']

/** Fetch full details for a search candidate. TMDB-first; Claude fallback. */
export async function fetchDetails(c: Candidate): Promise<DetailsResult> {
  const resolved = await resolveTmdbId(c)

  if (resolved && tmdbKey()) {
    if (resolved.type === 'movie') {
      const d = await tmdb(`/movie/${resolved.id}?append_to_response=credits,external_ids`) as {
        title?: string; release_date?: string; genres?: Array<{ name: string }>
        overview?: string; tagline?: string; vote_average?: number
        poster_path?: string | null; credits?: TmdbCredits
        external_ids?: { imdb_id?: string | null }
      }
      const genre = (d.genres ?? []).slice(0, 3).map(g => g.name)
      const vibe = vibeFor(genre[0] ?? '', 'movie')
      return {
        title: d.title, year: d.release_date ? parseInt(d.release_date.slice(0, 4)) : undefined,
        type: 'movie', genre,
        synopsis: (d.overview ?? '').slice(0, 300),
        emoji: vibe.emoji, mood_color: vibe.mood_color,
        director: (d.credits?.crew ?? []).find(x => x.job === 'Director')?.name ?? null,
        creator: null,
        cast: (d.credits?.cast ?? []).slice(0, 4).map(x => x.name),
        imdb_rating: d.vote_average ? Math.round(d.vote_average * 10) / 10 : null,
        total_seasons: null,
        tagline: d.tagline ?? '',
        imdb_id: d.external_ids?.imdb_id ?? c.imdb_id,
        tmdb_id: resolved.id,
        release_date: d.release_date || null,
        poster_url: d.poster_path ? `${TMDB_IMG}${d.poster_path}` : null,
        next_episode_date: null, air_schedule: null,
        episodes_in_season: null, episodes_released: null,
      }
    } else {
      const d = await tmdb(`/tv/${resolved.id}?append_to_response=credits,external_ids`) as {
        name?: string; first_air_date?: string; genres?: Array<{ name: string }>
        overview?: string; tagline?: string; vote_average?: number
        poster_path?: string | null; number_of_seasons?: number
        created_by?: Array<{ name: string }>
        next_episode_to_air?: { air_date: string; season_number: number; episode_number: number } | null
        last_episode_to_air?: { air_date: string; season_number: number; episode_number: number } | null
        seasons?: Array<{ season_number: number; episode_count: number }>
        networks?: Array<{ name: string }>
        credits?: TmdbCredits
        external_ids?: { imdb_id?: string | null }
      }
      const genre = (d.genres ?? []).slice(0, 3).map(g => g.name)
      const vibe = vibeFor(genre[0] ?? '', 'tv')
      const nextEp = d.next_episode_to_air
      const lastEp = d.last_episode_to_air
      const curSeason = nextEp?.season_number ?? lastEp?.season_number ?? null
      const seasonData = curSeason != null ? (d.seasons ?? []).find(s => s.season_number === curSeason) : null
      const network = d.networks?.[0]?.name ?? null
      const nextDate = nextEp?.air_date ? new Date(nextEp.air_date + 'T12:00:00Z') : null
      const dayStr = nextDate ? DAY_NAMES[nextDate.getUTCDay()] : null
      return {
        title: d.name, year: d.first_air_date ? parseInt(d.first_air_date.slice(0, 4)) : undefined,
        type: 'tv', genre,
        synopsis: (d.overview ?? '').slice(0, 300),
        emoji: vibe.emoji, mood_color: vibe.mood_color,
        director: null,
        creator: d.created_by?.[0]?.name ?? null,
        cast: (d.credits?.cast ?? []).slice(0, 4).map(x => x.name),
        imdb_rating: d.vote_average ? Math.round(d.vote_average * 10) / 10 : null,
        total_seasons: d.number_of_seasons ?? null,
        tagline: d.tagline ?? '',
        imdb_id: d.external_ids?.imdb_id ?? c.imdb_id,
        tmdb_id: resolved.id,
        release_date: d.first_air_date || null,
        poster_url: d.poster_path ? `${TMDB_IMG}${d.poster_path}` : null,
        next_episode_date: nextEp?.air_date ?? null,
        air_schedule: dayStr && network ? `${dayStr} · ${network}` : network,
        episodes_in_season: seasonData?.episode_count ?? null,
        episodes_released: lastEp?.episode_number ?? null,
      }
    }
  }

  // ── Claude fallback (no TMDB key) ──
  const settings = loadSettings()
  const parsed = await aiJson<DetailsResult>([
    { role: 'system', content: `You are a movie/TV database. Return ONLY valid JSON:
{"title":"official English title","year":2026,"type":"movie"|"tv","genre":["Genre1","Genre2"],"synopsis":"2-3 sentences, no spoilers","emoji":"single emoji","mood_color":"#hex","director":"name or null","creator":"showrunner or null","cast":["A","B","C"],"imdb_rating":7.3,"total_seasons":1,"tagline":"tagline","episodes_in_season":8,"episodes_released":8,"air_schedule":"Tuesdays · Apple TV+","next_episode_date":null,"release_date":"YYYY-MM-DD or null"}
TV series → type "tv". Fill all fields from your knowledge. air_schedule null for movies.` },
    { role: 'user', content: `Title: ${c.title}${c.year ? ` (${c.year})` : ''}${c.imdb_id ? `\nIMDB: ${c.imdb_id}` : ''}${c.cast ? `\nCast: ${c.cast}` : ''}\nType hint: ${c.type}` },
  ], settings, { model: modelForTask(settings, 'pictures.metadata'), maxTokens: 700 })
  return { ...parsed, imdb_id: c.imdb_id ?? null }
}

// ─── Season episodes ──────────────────────────────────────────────────────────
export interface SeasonResult {
  episodes: EpisodeInfo[]
  season_name: string | null
  tmdb_id: number | null
  total_seasons: number
  resolved_season: number
}

export async function fetchSeason(opts: {
  tmdb_id?: number | null; title?: string; year?: number
  season: number | 'latest'
}): Promise<SeasonResult> {
  let id = opts.tmdb_id ?? null
  if (!id) {
    if (!opts.title) throw new Error('Need tmdb_id or title')
    const data = await tmdb(`/search/tv?query=${encodeURIComponent(opts.title)}${opts.year ? `&first_air_date_year=${opts.year}` : ''}`) as {
      results?: Array<{ id: number }>
    }
    const hit = data.results?.[0]
    if (!hit) return { episodes: [], season_name: null, tmdb_id: null, total_seasons: 1, resolved_season: 1 }
    id = hit.id
  }

  const show = await tmdb(`/tv/${id}`) as { number_of_seasons?: number }
  const totalSeasons = show.number_of_seasons ?? 1
  const resolved = (opts.season === 'latest' || (typeof opts.season === 'number' && opts.season <= 0))
    ? totalSeasons
    : Math.min(opts.season as number, totalSeasons)

  const sd = await tmdb(`/tv/${id}/season/${resolved}`) as {
    name?: string
    episodes?: Array<{ episode_number: number; name: string; air_date: string | null; overview?: string }>
  }
  return {
    episodes: (sd.episodes ?? []).map(e => ({
      episode_number: e.episode_number, name: e.name,
      air_date: e.air_date || null, overview: (e.overview ?? '').slice(0, 180),
    })),
    season_name: sd.name ?? null,
    tmdb_id: id, total_seasons: totalSeasons, resolved_season: resolved,
  }
}

// ─── Discover (cinema / coming soon / trending TV) ───────────────────────────
export interface DiscoverData {
  cinema: DiscoverItem[]
  comingSoon: DiscoverItem[]
  streaming: DiscoverItem[]
  generatedAt: string
}

interface TmdbMovieRow {
  id: number; title: string; overview: string; release_date: string
  vote_average: number; genre_ids: number[]; poster_path: string | null
}
interface TmdbShowRow {
  id: number; name: string; overview: string; first_air_date: string
  vote_average: number; genre_ids: number[]; poster_path: string | null
}

function movieRow(m: TmdbMovieRow, platform: string, mood: string): DiscoverItem {
  return {
    imdb_id: null, tmdb_id: m.id, steam_id: null,
    title: m.title,
    year: m.release_date ? parseInt(m.release_date.slice(0, 4)) : new Date().getFullYear(),
    genre: m.genre_ids.slice(0, 2).map(id => MOVIE_GENRES[id] ?? '').filter(Boolean).join(', '),
    synopsis: (m.overview ?? '').slice(0, 200),
    emoji: '🎬', mood_color: mood,
    rating: m.vote_average ? Math.round(m.vote_average * 10) / 10 : null,
    type: 'movie', platform,
    release_date: m.release_date || null, tagline: null,
    poster_url: m.poster_path ? `${TMDB_IMG}${m.poster_path}` : null,
    ...EP_NULL,
  }
}

async function getTrendingTv(): Promise<DiscoverItem[]> {
  const data = await tmdb('/trending/tv/week') as { results?: TmdbShowRow[] }
  const shows = (data.results ?? []).slice(0, 14)

  return Promise.all(shows.map(async (show): Promise<DiscoverItem> => {
    const base: DiscoverItem = {
      imdb_id: null, tmdb_id: show.id, steam_id: null,
      title: show.name,
      year: show.first_air_date ? parseInt(show.first_air_date.slice(0, 4)) : new Date().getFullYear(),
      genre: show.genre_ids.slice(0, 2).map(id => TV_GENRES[id] ?? 'Drama').join(', '),
      synopsis: (show.overview ?? '').slice(0, 200),
      emoji: '📺', mood_color: '#1a3a5c',
      rating: show.vote_average ? Math.round(show.vote_average * 10) / 10 : null,
      type: 'tv', platform: null,
      release_date: show.first_air_date || null, tagline: null,
      poster_url: show.poster_path ? `${TMDB_IMG}${show.poster_path}` : null,
      ...EP_NULL,
    }
    try {
      const d = await tmdb(`/tv/${show.id}`) as {
        next_episode_to_air?: { air_date: string; season_number: number; episode_number: number } | null
        last_episode_to_air?: { air_date: string; season_number: number; episode_number: number } | null
        seasons?: Array<{ season_number: number; episode_count: number }>
        networks?: Array<{ name: string }>
      }
      const nextEp = d.next_episode_to_air
      const lastEp = d.last_episode_to_air
      const curSeason = nextEp?.season_number ?? lastEp?.season_number ?? null
      const seasonData = curSeason != null ? (d.seasons ?? []).find(s => s.season_number === curSeason) : null
      const network = d.networks?.[0]?.name ?? null
      const nextDate = nextEp?.air_date ? new Date(nextEp.air_date + 'T12:00:00Z') : null
      const dayStr = nextDate ? DAY_NAMES[nextDate.getUTCDay()] : null
      return {
        ...base,
        next_episode_date: nextEp?.air_date ?? null,
        current_season: curSeason,
        episodes_aired: lastEp?.episode_number ?? null,
        episodes_total: seasonData?.episode_count ?? null,
        air_schedule: (dayStr && network ? `${dayStr} · ${network}` : network) ?? null,
      }
    } catch {
      return base
    }
  }))
}

const DISCOVER_CACHE = 'pictures_discover_v1'
const CACHE_TTL = 30 * 60 * 1000

export async function getDiscover(force = false): Promise<DiscoverData> {
  if (!force) {
    try {
      const raw = localStorage.getItem(DISCOVER_CACHE)
      if (raw) {
        const cached = JSON.parse(raw) as DiscoverData
        if (Date.now() - new Date(cached.generatedAt).getTime() < CACHE_TTL) return cached
      }
    } catch { /* refetch */ }
  }

  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)

  const [cinemaR, upcomingR, tvR] = await Promise.allSettled([
    tmdb('/movie/now_playing?region=US') as Promise<{ results?: TmdbMovieRow[] }>,
    tmdb('/movie/upcoming?region=US') as Promise<{ results?: TmdbMovieRow[] }>,
    getTrendingTv(),
  ])

  const data: DiscoverData = {
    cinema: cinemaR.status === 'fulfilled'
      ? (cinemaR.value.results ?? []).slice(0, 20).map(m => movieRow(m, 'In Cinemas', '#7d0000'))
      : [],
    comingSoon: upcomingR.status === 'fulfilled'
      ? (upcomingR.value.results ?? [])
          .filter(m => m.release_date > today && m.release_date <= monthEnd)
          .slice(0, 20)
          .map(m => movieRow(m, 'Coming to Cinemas', '#7d0000'))
      : [],
    streaming: tvR.status === 'fulfilled' ? tvR.value : [],
    generatedAt: new Date().toISOString(),
  }
  try { localStorage.setItem(DISCOVER_CACHE, JSON.stringify(data)) } catch { /* quota */ }
  return data
}

// ─── Games (RAWG) ─────────────────────────────────────────────────────────────
export interface GamesData {
  topSellers: GameEntry[]
  newReleases: GameEntry[]
  comingSoon: GameEntry[]
  generatedAt: string
}

interface RawgRow {
  id: number; name: string; released: string | null; background_image: string | null
  rating: number; metacritic: number | null
  genres?: { name: string }[]
  platforms?: { platform: { name: string } }[] | null
}

function rawgToEntry(g: RawgRow): GameEntry {
  const genre = (g.genres ?? []).slice(0, 2).map(x => x.name).join(', ') || 'Game'
  const vibe = vibeFor(genre, 'game')
  const platforms = (g.platforms ?? [])
    ?.map(p => p.platform.name)
    .filter(n => ['PC', 'PlayStation 5', 'Xbox Series S/X', 'Nintendo Switch'].includes(n))
    .slice(0, 3).join(' / ') || 'PC'
  return {
    rawg_id: g.id, title: g.name, genre,
    synopsis: `${genre} game${g.metacritic ? ` · Metacritic ${g.metacritic}` : ''}.`,
    emoji: vibe.emoji, mood_color: vibe.mood_color,
    rating: g.rating ? Math.round(g.rating * 20) / 10 : null,
    metacritic: g.metacritic ?? null,
    platform: platforms,
    release_date: g.released ?? null,
    poster_url: g.background_image ?? null,
    publisher: null,
  }
}

const GAMES_CACHE = 'pictures_games_v1'

export async function getGames(force = false): Promise<GamesData> {
  if (!force) {
    try {
      const raw = localStorage.getItem(GAMES_CACHE)
      if (raw) {
        const cached = JSON.parse(raw) as GamesData
        if (Date.now() - new Date(cached.generatedAt).getTime() < CACHE_TTL) return cached
      }
    } catch { /* refetch */ }
  }

  const today = new Date().toISOString().slice(0, 10)
  const twoYearsAgo = new Date(Date.now() - 730 * 86400000).toISOString().slice(0, 10)
  const threeMonths = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
  const sixMonthsFwd = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10)

  const [topR, newR, upR] = await Promise.allSettled([
    rawg(`/games?ordering=-metacritic&dates=${twoYearsAgo},${today}&metacritic=75,100&page_size=12`) as Promise<{ results?: RawgRow[] }>,
    rawg(`/games?ordering=-released&dates=${threeMonths},${today}&page_size=10`) as Promise<{ results?: RawgRow[] }>,
    rawg(`/games?ordering=released&dates=${today},${sixMonthsFwd}&page_size=10`) as Promise<{ results?: RawgRow[] }>,
  ])

  const data: GamesData = {
    topSellers:  topR.status === 'fulfilled' ? (topR.value.results ?? []).map(rawgToEntry) : [],
    newReleases: newR.status === 'fulfilled' ? (newR.value.results ?? []).map(rawgToEntry) : [],
    comingSoon:  upR.status  === 'fulfilled' ? (upR.value.results  ?? []).map(rawgToEntry) : [],
    generatedAt: new Date().toISOString(),
  }
  try { localStorage.setItem(GAMES_CACHE, JSON.stringify(data)) } catch { /* quota */ }
  return data
}

export function gameToDiscover(g: GameEntry): DiscoverItem {
  return {
    imdb_id: null, tmdb_id: null, steam_id: g.rawg_id,
    title: g.title,
    year: g.release_date ? parseInt(g.release_date.slice(0, 4)) : new Date().getFullYear(),
    genre: g.genre, synopsis: g.synopsis,
    emoji: g.emoji, mood_color: g.mood_color,
    rating: g.rating, type: 'game' as MediaType,
    platform: [g.metacritic ? `MC ${g.metacritic}` : null, g.platform || 'PC'].filter(Boolean).join(' · '),
    release_date: g.release_date,
    tagline: g.publisher ?? null,
    poster_url: g.poster_url,
    ...EP_NULL,
  }
}
