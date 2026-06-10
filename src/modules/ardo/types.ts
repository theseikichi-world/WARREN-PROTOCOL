// ─── A.R.D.O — Adaptive Recall & Drilling Operator ───────────────────────────
// SRS memory trainer for actors. Built on SM-2 + chunking + active recall.

export type TextType     = 'poem' | 'monologue' | 'role' | 'song' | 'prose'
export type Language     = 'RU' | 'EN' | 'CN' | 'other'
export type SessionType  = 'learn' | 'recall' | 'performance'
export type LearningPace = 'slow' | 'medium' | 'fast'
export type MemoryType   = 'visual' | 'auditory' | 'kinesthetic'
export type ChunkStatus  = 'new' | 'learning' | 'reviewing' | 'mastered'

// ─── Sprint mode ──────────────────────────────────────────────────────────────
// Intra-day SRS based on Ebbinghaus forgetting curve.
// Review BEFORE memory fades — each review resets the curve to a shallower slope.
// Science: ~42% forgotten after 20min, ~50% after 1hr, sleep consolidates strongly.

/** Minutes after session start for each sprint review */
export const SPRINT_INTERVALS_MIN = [0, 20, 60, 240, 480, 1440, 4320, 10080]
// Stage:                           0     1    2    3     4     5      6     7
// Time:                           now  20m  1hr  4hr   8hr  1day   3day  7day

export const SPRINT_STAGE_LABELS = [
  'LEARN', '20 MIN', '1 HOUR', '4 HOURS', '8 HOURS', 'DAY 2', 'DAY 4', 'DAY 7',
]

export interface SprintData {
  stage:     number   // current stage (0 = just started, 8 = complete → enters standard SRS)
  nextDueAt: string   // ISO timestamp WITH time — precise to the minute
  startedAt: string
}

// ─── Core entities ────────────────────────────────────────────────────────────

export interface Chunk {
  id:      string
  textId:  string
  order:   number
  content: string
  anchor:  string   // emoji or short image/association
}

export interface ArdoText {
  id:        string
  title:     string
  author:    string
  type:      TextType
  language:  Language
  rawText:   string
  createdAt: string
  deadline:  string | null
  chunks:    Chunk[]
  sprint?:   SprintData   // set when sprint mode is active
  status:    'active' | 'learned'
  learnedAt: string | null
}

/** SM-2 review card — one per chunk */
export interface ReviewCard {
  id:             string
  chunkId:        string
  textId:         string
  nextReviewDate: string   // YYYY-MM-DD
  intervalDays:   number
  easeFactor:     number   // default 2.5, min 1.3
  lastScore:      number   // 1–4
  reviewCount:    number
}

export interface UserProfile {
  pace:           LearningPace
  bestTime:       'morning' | 'afternoon' | 'evening'
  memoryType:     MemoryType
  streak:         number
  lastStudyDate:  string | null
  totalReviews:   number
}

export interface ArdoState {
  texts:   ArdoText[]
  cards:   ReviewCard[]
  profile: UserProfile
}

// ─── Text type meta ───────────────────────────────────────────────────────────

export const TEXT_TYPE_LABEL: Record<TextType, string> = {
  poem:      'POEM',
  monologue: 'MONOLOGUE',
  role:      'ROLE',
  song:      'SONG',
  prose:     'PROSE',
}

export const LANG_LABEL: Record<Language, string> = {
  RU: 'RU', EN: 'EN', CN: 'CN', other: '??',
}

// ─── Score labels ─────────────────────────────────────────────────────────────

export const SCORE_LABELS = [
  { score: 1, label: 'FORGOT',    emoji: '🔴', color: '#ff0033' },
  { score: 2, label: 'PARTIAL',   emoji: '🟡', color: '#ff6b00' },
  { score: 3, label: 'REMEMBER',  emoji: '🟢', color: '#22c55e' },
  { score: 4, label: 'AUTO',      emoji: '⭐', color: '#f59e0b' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getChunkStatus(card: ReviewCard | undefined): ChunkStatus {
  if (!card || card.reviewCount === 0) return 'new'
  if (card.intervalDays < 3)  return 'learning'
  if (card.intervalDays < 14) return 'reviewing'
  return 'mastered'
}

export const STATUS_COLOR: Record<ChunkStatus, string> = {
  new:       'rgba(148,163,184,0.4)',
  learning:  '#ff6b00',
  reviewing: '#eab308',
  mastered:  '#22c55e',
}

export function getFirstLine(content: string): string {
  return content.split('\n')[0].trim()
}

export function getHint(content: string): string {
  const words = content.split(/\s+/)
  const n = Math.max(3, Math.ceil(words.length * 0.3))
  return words.slice(0, n).join(' ') + '…'
}

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}
