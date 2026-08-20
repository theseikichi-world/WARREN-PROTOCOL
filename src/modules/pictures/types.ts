// ─── GALACTIC PICTURES — Movies · Shows · Games ───────────────────────────────
// Full port of Muppet Foxy (Guildhall). Every feature kept:
// library with statuses, per-episode tracking, season/episode ratings,
// 5-category reviews, discover rows, upcoming episodes, games.

export type MediaType = 'movie' | 'tv' | 'game'
export type Status    = 'watchlist' | 'watching' | 'watched' | 'coming-soon'

export interface ItemReview {
  categories: { name: string; emoji: string; score: number }[]  // 1–10 each
  comment:    string
  reviewedAt: string
  overall:    number  // average, 1–10
}

export interface MediaItem {
  id: string
  title: string
  year: number
  type: MediaType
  genre: string[]
  synopsis: string
  emoji: string
  mood_color: string
  director: string | null
  creator: string | null
  cast: string[]
  imdb_rating: number | null
  total_seasons: number | null
  status: Status
  tagline: string
  next_episode_date: string | null
  air_schedule: string | null
  episodes_in_season: number | null
  episodes_released: number | null
  /** Minutes: one episode for a series, the whole film for a movie. Null = unknown. */
  runtime: number | null
  imdb_id: string | null
  rating: number                              // 0–5 stars
  progress: { season: number; episode: number }
  release_date: string | null
  addedAt: string
  notes: string
  platform?: string | null
  poster_url?: string | null
  tmdb_id?: number | null
  review?: ItemReview
  watchedEps?: Record<number, number[]>       // season → [ep numbers watched]
  epRatings?: Record<string, number>          // "S{s}E{e}" → 1–5
  seasonRatings?: Record<number, number>      // season → 1–10
}

export interface DiscoverItem {
  imdb_id: string | null
  tmdb_id: number | null
  steam_id: number | null
  title: string
  year: number
  genre: string
  synopsis: string
  emoji: string
  mood_color: string
  rating: number | null
  type: MediaType
  platform: string | null
  release_date: string | null
  tagline: string | null
  poster_url: string | null
  next_episode_date: string | null
  current_season: number | null
  episodes_aired: number | null
  episodes_total: number | null
  air_schedule: string | null
}

export interface Candidate {
  imdb_id: string | null
  tmdb_id: number | null
  title: string
  year: number | null
  type: 'movie' | 'tv'
  cast: string
  image_url: string | null
}

export interface EpisodeInfo {
  episode_number: number
  name: string
  air_date: string | null
  overview: string
}

export interface GameEntry {
  rawg_id: number | null
  title: string
  genre: string
  synopsis: string
  emoji: string
  mood_color: string
  rating: number | null
  metacritic: number | null
  platform: string
  release_date: string | null
  poster_url: string | null
  publisher: string | null
}

// ─── Storage ──────────────────────────────────────────────────────────────────
const KEY = 'pictures_v1'

export function loadLib(): MediaItem[] {
  try {
    const r = localStorage.getItem(KEY)
    if (r) return JSON.parse(r)
    // migrate from the old Foxy key if present
    const old = localStorage.getItem('foxy-library')
    if (old) { localStorage.setItem(KEY, old); return JSON.parse(old) }
  } catch { /* fresh */ }
  return []
}

export function saveLib(lib: MediaItem[]): void {
  localStorage.setItem(KEY, JSON.stringify(lib))
}

export const uid = () => Math.random().toString(36).slice(2, 10)

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diff / 86400000)
}

export function scoreColor(n: number): string {
  return n >= 9 ? '#4ade80' : n >= 7 ? '#f5a623' : n >= 5 ? '#38bdf8' : n >= 3 ? '#ff6b00' : '#f87171'
}

export const REVIEW_CATS: Record<MediaType, { name: string; emoji: string }[]> = {
  movie: [
    { name: 'Acting',   emoji: '🎭' },
    { name: 'Writing',  emoji: '📜' },
    { name: 'Visuals',  emoji: '🎨' },
    { name: 'Sound',    emoji: '🎵' },
    { name: 'Direction',emoji: '🎬' },
  ],
  tv: [
    { name: 'Acting',   emoji: '🎭' },
    { name: 'Writing',  emoji: '📜' },
    { name: 'Visuals',  emoji: '🎨' },
    { name: 'Sound',    emoji: '🎵' },
    { name: 'Pacing',   emoji: '⏱' },
  ],
  game: [
    { name: 'Gameplay', emoji: '🎮' },
    { name: 'Story',    emoji: '📜' },
    { name: 'Graphics', emoji: '🎨' },
    { name: 'Sound',    emoji: '🎵' },
    { name: 'Polish',   emoji: '⚡' },
  ],
}

// Local (no-AI) vibe enrichment — genre → emoji + mood color
export const GENRE_EMOJI: Record<string, string> = {
  Action: '⚔️', Adventure: '🗺️', RPG: '⚔️', Shooter: '🔫', Strategy: '♟️',
  Simulation: '🎲', Sports: '⚽', Racing: '🏎️', Puzzle: '🧩', Horror: '👻',
  Platform: '🏃', Fighting: '🥊', Indie: '✨', Animation: '🎨', Comedy: '😂',
  Crime: '🕵️', Drama: '🎭', Family: '👪', Fantasy: '🐉', Mystery: '🔍',
  Romance: '💘', 'Sci-Fi': '🚀', Thriller: '🔪', War: '🪖', Western: '🤠',
  Documentary: '📷', Music: '🎵', History: '📜',
}
export const GENRE_MOOD: Record<string, string> = {
  Action: '#8B0000', Adventure: '#1a4a2e', RPG: '#3a1a6b', Shooter: '#1a2a3a',
  Strategy: '#2a1a4a', Simulation: '#1a3a4a', Sports: '#1a4a1a', Racing: '#4a2a00',
  Puzzle: '#003a4a', Horror: '#1a0a1a', Platform: '#003a8a', Fighting: '#4a1a00',
  Animation: '#7c3aed', Comedy: '#b45309', Crime: '#27272a', Drama: '#7d2150',
  Family: '#0e7490', Fantasy: '#4c1d95', Mystery: '#1e293b', Romance: '#9d174d',
  'Sci-Fi': '#0c4a6e', Thriller: '#450a0a', War: '#3f3f2e', Western: '#713f12',
  Documentary: '#374151', Music: '#6d28d9', History: '#57534e',
}

export function vibeFor(genre: string, type: MediaType): { emoji: string; mood_color: string } {
  const primary = genre.split(',')[0]?.trim() ?? ''
  return {
    emoji: GENRE_EMOJI[primary] ?? (type === 'game' ? '🎮' : type === 'tv' ? '📺' : '🎬'),
    mood_color: GENRE_MOOD[primary] ?? (type === 'game' ? '#4a3a7a' : type === 'tv' ? '#1a3a5c' : '#7d0000'),
  }
}
