import {
  type ArdoText, type ArdoState, type Chunk, type ReviewCard, type UserProfile,
  type SprintData, type TextType, type Language, type LearningPace,
  SPRINT_INTERVALS_MIN, todayKey,
} from './types'

export type { ArdoState } from './types'

const KEY = 'ardo_v1'

const DEFAULT_PROFILE: UserProfile = {
  pace:          'medium',
  bestTime:      'morning',
  memoryType:    'visual',
  streak:        0,
  lastStudyDate: null,
  totalReviews:  0,
}

const INITIAL: ArdoState = { texts: [], cards: [], profile: DEFAULT_PROFILE }

// ─── Persistence ──────────────────────────────────────────────────────────────

export function loadArdoState(): ArdoState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...INITIAL }
    const parsed = JSON.parse(raw)
    // Migration: add status/learnedAt to existing texts that lack it
    const texts = (parsed.texts ?? []).map((t: ArdoText) => ({
      ...t,
      status:    t.status    ?? 'active',
      learnedAt: t.learnedAt ?? null,
    }))
    return { ...INITIAL, ...parsed, texts, profile: { ...DEFAULT_PROFILE, ...(parsed.profile ?? {}) } }
  } catch {
    return { ...INITIAL }
  }
}

export function saveArdoState(s: ArdoState): void {
  localStorage.setItem(KEY, JSON.stringify(s))
}

// ─── Chunking engine ──────────────────────────────────────────────────────────

export function autoChunk(rawText: string, type: TextType): string[] {
  const text = rawText.trim()
  if (!text) return []

  // Split on double newlines first
  const paras = text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0)

  if (type === 'poem' || type === 'song') {
    return paras  // each stanza/verse = one chunk
  }

  if (type === 'role') {
    // Detect "CHARACTER: ..." dialogue format
    const hasMarkers = /^[А-ЯA-Z][А-ЯA-Zа-яa-z\s]{1,20}:/m.test(text)
    if (hasMarkers) {
      const chunks: string[] = []
      let current = ''
      for (const line of text.split('\n')) {
        if (/^[А-ЯA-Z][А-ЯA-Zа-яa-z\s]{1,20}:/.test(line) && current.trim()) {
          chunks.push(current.trim())
          current = line + '\n'
        } else {
          current += line + '\n'
        }
      }
      if (current.trim()) chunks.push(current.trim())
      if (chunks.length > 1) return chunks
    }
  }

  // Prose / monologue: use paragraphs if multiple, else split by sentences
  if (paras.length > 1) return paras

  const sentences = text.match(/[^.!?…]+[.!?…]+/g)?.map(s => s.trim()).filter(s => s.length > 5) ?? [text]
  const chunks: string[] = []
  const group = type === 'monologue' ? 2 : 3
  for (let i = 0; i < sentences.length; i += group) {
    chunks.push(sentences.slice(i, i + group).join(' '))
  }
  return chunks.length > 0 ? chunks : [text]
}

function makeChunks(rawText: string, textId: string, type: TextType): Chunk[] {
  return autoChunk(rawText, type).map((content, i) => ({
    id: crypto.randomUUID(), textId, order: i, content, anchor: '',
  }))
}

function makeCard(chunk: Chunk, textId: string): ReviewCard {
  return {
    id:             crypto.randomUUID(),
    chunkId:        chunk.id,
    textId,
    nextReviewDate: todayKey(),  // new cards due immediately
    intervalDays:   0,
    easeFactor:     2.5,
    lastScore:      0,
    reviewCount:    0,
  }
}

// ─── SM-2 algorithm ───────────────────────────────────────────────────────────

const PACE_M: Record<LearningPace, number> = { slow: 0.7, medium: 1.0, fast: 1.4 }

// Initial intervals (days) for first 3 reviews: [0th, 1st, 2nd+]
const INIT_INTERVALS: Record<LearningPace, number[]> = {
  slow:   [1, 2, 4],
  medium: [1, 3, 7],
  fast:   [1, 3, 10],
}

export function applyReview(card: ReviewCard, score: number, pace: LearningPace): ReviewCard {
  // score: 1=forgot, 2=partial, 3=remember, 4=automatic
  const pm = PACE_M[pace]

  // Update ease factor (SM-2 formula)
  const newEF = Math.max(1.3, card.easeFactor + 0.1 * score - 0.08 * Math.pow(4 - score, 2))

  let nextInterval: number
  if (score === 1) {
    nextInterval = 1  // forgot: review tomorrow regardless
  } else if (card.reviewCount < INIT_INTERVALS[pace].length) {
    const base = INIT_INTERVALS[pace][card.reviewCount]
    nextInterval = Math.max(1, score < 3 ? base - 1 : base)
  } else {
    nextInterval = Math.round(card.intervalDays * newEF * pm)
    if (score === 2) nextInterval = Math.max(1, Math.round(nextInterval * 0.6))
  }

  nextInterval = Math.min(90, Math.max(1, nextInterval))

  const next = new Date()
  next.setDate(next.getDate() + nextInterval)

  return {
    ...card,
    nextReviewDate: next.toISOString().slice(0, 10),
    intervalDays:   nextInterval,
    easeFactor:     newEF,
    lastScore:      score,
    reviewCount:    card.reviewCount + 1,
  }
}

// After a Learn session — schedule all new cards for tomorrow
function scheduleAfterLearn(cards: ReviewCard[], chunkIds: string[]): ReviewCard[] {
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
  const tStr = tomorrow.toISOString().slice(0, 10)
  return cards.map(c =>
    chunkIds.includes(c.chunkId) && c.reviewCount === 0
      ? { ...c, nextReviewDate: tStr, intervalDays: 1 }
      : c
  )
}

// ─── Text CRUD ────────────────────────────────────────────────────────────────

export interface NewTextData {
  title:    string
  author:   string
  type:     TextType
  language: Language
  rawText:  string
  deadline: string | null
}

export function addText(state: ArdoState, data: NewTextData): ArdoState {
  const id     = crypto.randomUUID()
  const chunks = makeChunks(data.rawText, id, data.type)
  const newText: ArdoText = {
    id, title: data.title, author: data.author,
    type: data.type, language: data.language,
    rawText: data.rawText, createdAt: new Date().toISOString(),
    deadline: data.deadline, chunks,
    status: 'active', learnedAt: null,
  }
  const newCards = chunks.map(ch => makeCard(ch, id))
  return { ...state, texts: [newText, ...state.texts], cards: [...state.cards, ...newCards] }
}

/** Move text to Glory Hall — preserves all data */
export function markTextLearned(state: ArdoState, textId: string): ArdoState {
  return {
    ...state,
    texts: state.texts.map(t => t.id !== textId ? t : {
      ...t, status: 'learned' as const, learnedAt: new Date().toISOString(),
    }),
  }
}

/** Bring text back to active drilling */
export function reviveText(state: ArdoState, textId: string): ArdoState {
  return {
    ...state,
    texts: state.texts.map(t => t.id !== textId ? t : {
      ...t, status: 'active' as const, learnedAt: null,
    }),
  }
}

export function updateChunkAnchor(state: ArdoState, textId: string, chunkId: string, anchor: string): ArdoState {
  return {
    ...state,
    texts: state.texts.map(t => t.id !== textId ? t : {
      ...t, chunks: t.chunks.map(c => c.id !== chunkId ? c : { ...c, anchor }),
    }),
  }
}

// ─── Session ──────────────────────────────────────────────────────────────────

export interface SessionItem {
  chunk: Chunk
  card:  ReviewCard
  textTitle: string
}

/** Get due items for recall across one text (or all if textId=null) */
export function getDueItems(state: ArdoState, textId: string | null): SessionItem[] {
  const today = todayKey()
  return state.cards
    .filter(c => {
      if (textId && c.textId !== textId) return false
      return c.nextReviewDate <= today
    })
    .map(c => {
      const text  = state.texts.find(t => t.id === c.textId)
      const chunk = text?.chunks.find(ch => ch.id === c.chunkId)
      return text && chunk ? { chunk, card: c, textTitle: text.title } : null
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a!.chunk.textId === b!.chunk.textId) return a!.chunk.order - b!.chunk.order
      return a!.card.nextReviewDate.localeCompare(b!.card.nextReviewDate)
    }) as SessionItem[]
}

/** Get learn items — all chunks of a text in order */
export function getLearnItems(state: ArdoState, textId: string): SessionItem[] {
  const text = state.texts.find(t => t.id === textId)
  if (!text) return []
  return text.chunks.map(chunk => ({
    chunk,
    card: state.cards.find(c => c.chunkId === chunk.id) ?? makeCard(chunk, textId),
    textTitle: text.title,
  }))
}

/** Apply recall session results */
export function applySessionResults(
  state: ArdoState,
  results: { cardId: string; score: number }[],
): ArdoState {
  const today = todayKey()
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
  const yStr = yesterday.toISOString().slice(0, 10)

  const scoreMap = new Map(results.map(r => [r.cardId, r.score]))

  const cards = state.cards.map(c => {
    const score = scoreMap.get(c.id)
    return score !== undefined ? applyReview(c, score, state.profile.pace) : c
  })

  // Update streak
  const last = state.profile.lastStudyDate
  let streak = state.profile.streak
  if (last === today) {
    // already studied today, streak unchanged
  } else if (last === yStr) {
    streak++
  } else {
    streak = 1
  }

  return {
    ...state,
    cards,
    profile: {
      ...state.profile,
      streak,
      lastStudyDate: today,
      totalReviews: state.profile.totalReviews + results.length,
    },
  }
}

/** Apply learn session — schedule all seen chunks for tomorrow */
export function applyLearnSession(state: ArdoState, textId: string): ArdoState {
  const text = state.texts.find(t => t.id === textId)
  if (!text) return state
  const chunkIds = text.chunks.map(c => c.id)
  const today = todayKey()
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
  const yStr = yesterday.toISOString().slice(0, 10)

  let streak = state.profile.streak
  const last = state.profile.lastStudyDate
  if (last !== today && last !== yStr) streak = 1
  else if (last === yStr) streak++

  return {
    ...state,
    cards: scheduleAfterLearn(state.cards, chunkIds),
    profile: { ...state.profile, streak, lastStudyDate: today },
  }
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export interface TextStats {
  total:     number
  new:       number
  learning:  number
  reviewing: number
  mastered:  number
  due:       number
  progress:  number  // 0-100
}

export function getTextStats(text: ArdoText, cards: ReviewCard[]): TextStats {
  const today = todayKey()
  const tc    = cards.filter(c => c.textId === text.id)
  const total = text.chunks.length
  const mastered  = tc.filter(c => c.intervalDays >= 14).length
  const reviewing = tc.filter(c => c.reviewCount > 0 && c.intervalDays > 0 && c.intervalDays < 14).length
  const learning  = tc.filter(c => c.reviewCount > 0 && c.intervalDays === 0).length
  const newCount  = tc.filter(c => c.reviewCount === 0).length
  const due       = tc.filter(c => c.nextReviewDate <= today).length
  return {
    total, new: newCount, learning, reviewing, mastered, due,
    progress: total > 0 ? Math.round(mastered / total * 100) : 0,
  }
}

export function getTotalDue(state: ArdoState): number {
  const today = todayKey()
  return state.cards.filter(c => c.nextReviewDate <= today).length
}

// ─── Sprint mode ──────────────────────────────────────────────────────────────
// Intra-day spaced repetition based on the Ebbinghaus forgetting curve.
// Reviews happen at: 20min → 1hr → 4hr → 8hr → next day → 3d → 7d
// Each review catches the memory BEFORE it decays, resetting the curve.

function addMinutes(minutes: number): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() + minutes)
  return d.toISOString()
}

/** Start sprint mode on a text — schedules first recall in 20 minutes */
export function startSprint(state: ArdoState, textId: string): ArdoState {
  const sprint: SprintData = {
    stage:     1,                         // 0 = learn (now), 1 = first recall in 20min
    nextDueAt: addMinutes(SPRINT_INTERVALS_MIN[1]),
    startedAt: new Date().toISOString(),
  }
  return {
    ...state,
    texts: state.texts.map(t => t.id !== textId ? t : { ...t, sprint }),
    // Schedule cards so they don't interfere with sprint — push out to after sprint completes
    cards: state.cards.map(c =>
      c.textId !== textId ? c : { ...c, nextReviewDate: new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 10) }
    ),
  }
}

/** Advance to the next sprint stage after completing a recall session */
export function advanceSprint(state: ArdoState, textId: string): ArdoState {
  const text = state.texts.find(t => t.id === textId)
  if (!text?.sprint) return state

  const nextStage = text.sprint.stage + 1
  const today = todayKey()
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
  const yStr = yesterday.toISOString().slice(0, 10)
  let streak = state.profile.streak
  const last = state.profile.lastStudyDate
  if (last !== today) streak = last === yStr ? streak + 1 : 1

  if (nextStage >= SPRINT_INTERVALS_MIN.length) {
    // Sprint complete — clear sprint data, cards enter standard SRS starting today
    return {
      ...state,
      texts: state.texts.map(t => t.id !== textId ? t : { ...t, sprint: undefined }),
      cards: state.cards.map(c => {
        if (c.textId !== textId) return c
        return { ...c, nextReviewDate: today, intervalDays: 7, reviewCount: 7, easeFactor: 2.5 }
      }),
      profile: { ...state.profile, streak, lastStudyDate: today, totalReviews: state.profile.totalReviews + (text.chunks.length) },
    }
  }

  const minutesUntilNext = SPRINT_INTERVALS_MIN[nextStage] - SPRINT_INTERVALS_MIN[text.sprint.stage]
  const sprint: SprintData = {
    ...text.sprint,
    stage:     nextStage,
    nextDueAt: addMinutes(minutesUntilNext),
  }

  return {
    ...state,
    texts: state.texts.map(t => t.id !== textId ? t : { ...t, sprint }),
    profile: { ...state.profile, streak, lastStudyDate: today, totalReviews: state.profile.totalReviews + (text.chunks.length) },
  }
}

/** Returns milliseconds until next sprint session (0 = due now) */
export function sprintMsUntil(sprint: SprintData): number {
  return Math.max(0, new Date(sprint.nextDueAt).getTime() - Date.now())
}

/** All chunks of a text as sprint items — used for both sprint and full run */
export function getAllItems(state: ArdoState, textId: string): SessionItem[] {
  const text = state.texts.find(t => t.id === textId)
  if (!text) return []
  return text.chunks.map(chunk => ({
    chunk,
    card: state.cards.find(c => c.chunkId === chunk.id) ?? makeCard(chunk, textId),
    textTitle: text.title,
  }))
}

export function getSprintDueCount(state: ArdoState): number {
  const now = Date.now()
  return state.texts.filter(t => t.sprint && new Date(t.sprint.nextDueAt).getTime() <= now).length
}
