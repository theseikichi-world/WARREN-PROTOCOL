// ─── THE SPINE — one read of a dream ──────────────────────────────────────────
// A dream used to be read twice by two different models that never met: L.O.G's
// analysis produced missions and tasks that landed in ORBIT earning nothing,
// and the guide separately produced a fifteen-node chain. One of them fed the
// progression system and the other was decoration. This file is the merge.
//
// One read returns three things:
//
//   VERDICT  the honest paragraph — what the dream actually requires
//   SPINE    3-5 ACTS: title, PRESSURE, and the datable proof that ends each
//   SHELF    typed candidates, each one declaring where it is allowed to go
//
// The shelf is the point. A candidate is not advice — it carries its kind, and
// its kind decides which system may hold it: a ROUTINE becomes a scored chain
// node, a TASK becomes an ORBIT obligation, a BASIC becomes life support, a
// PROOF becomes an act's boss. Nothing that cannot be placed is proposed.
//
// Why routines are asked for ONE act at a time: bandwidth caps concurrent
// training at PRIMARY_MAX_NODES. A fifteen-node proposal was always ten things
// the operator could not begin, drawn as though they were available — and it was
// simultaneously the hardest shape for a model to get right and the hardest for
// a person to review. A smaller ask is a more reliable one.

import { aiJson, loadSettings, modelForTask, type AiMessage } from '../../settings'
import { dayShape, profileBrief } from '../../profile'
import type { AnalyzedMission, Dream, MissionPriority } from '../log/types'
import type { Goal, NodeTier } from './types'
import { TIER_META, PRIMARY_MAX_NODES } from './types'
import { blankDraft, slugify, uniqueKey, type ChainDraft, type DraftNode } from './draft'
import { parseAnchor } from './anchor'
import { isDueDate } from './deadline'
import { matchShape, shapeBrief } from './shapes'

export const SPINE_TASK_ID = 'uplink.protocol'

/** Instruments a routine can grant. Anything else the model invents is dropped. */
export const GRANTABLE_TOOLS = ['journal', 'ardo', 'solaris', 'pictures', 'vigilante'] as const

/**
 * How hard an act presses. This is the CRITICAL marking, and it is not
 * decoration: exactly one act carries the bottleneck the verdict named, so the
 * spine says where the goal is actually won rather than colouring everything red.
 */
export type Pressure = 'critical' | 'high' | 'medium'

/** Where a candidate is allowed to land. The kind IS the destination. */
export type CandidateKind = 'routine' | 'task' | 'basic' | 'proof'

export interface SpineAct {
  key:      string
  title:    string
  pressure: Pressure
  /** One line: what finishing this act buys you. */
  intent:   string
  /** A real, datable, external event, or nothing. Score states are not bosses. */
  boss:     string | null
  /**
   * The date that event lands on, `YYYY-MM-DD`, when the dream actually names
   * one. Never inferred: "in June" is a month, and a made-up 15th would be a
   * fact the operator never supplied.
   */
  due:      string | null
}

export interface Candidate {
  key:    string
  kind:   CandidateKind
  title:  string
  /** The act key this serves. Always resolves to a real act after normalising. */
  act:    string
  /** One line: why this earns the slot it would take. */
  why:    string
  // ── routine and basic ──
  cue:    string
  tier:   NodeTier
  ladder: string[]
  after:  string[]
  toolId: string | null
  // ── task ──
  repeats: boolean
}

export interface DreamRead {
  verdict:     string
  title:       string
  /** Inferred from the dream. The operator is never asked to pick one. */
  category:    string
  acts:        SpineAct[]
  shelf:       Candidate[]
  generatedAt: string
}

/**
 * A question the guide needs answered before it can plan this particular dream.
 *
 * Not a personality quiz and not a character sheet. Every question is about a
 * FACT the plan turns on — money, hours, geography, a deadline, what has already
 * been tried — because a spine that proposes a weekly coach to someone with no
 * budget for one has wasted a candidate and some trust. It carries its own `why`
 * so answering never feels like paperwork.
 */
export interface InterviewQuestion {
  key:      string
  question: string
  why:      string
  /** An example answer, to show the shape and the expected precision. */
  hint:     string
}

export interface Interview {
  questions:   InterviewQuestion[]
  /** question key → what was typed. A missing key means it was skipped. */
  answers:     Record<string, string>
  askedAt:     string
  answeredAt:  string | null
}

export const PRESSURE_LABEL: Record<Pressure, string> = {
  critical: 'CRITICAL', high: 'HIGH', medium: 'MEDIUM',
}

export const PRESSURE_COLOR: Record<Pressure, string> = {
  critical: '#ff0033', high: '#ff6b00', medium: '#c084fc',
}

export const KIND_LABEL: Record<CandidateKind, string> = {
  routine: 'ROUTINE', task: 'TASK', basic: 'BASIC', proof: 'PROOF',
}

/** Said in full on every card, because a deploy that surprises you is a bug. */
export const KIND_DEST: Record<CandidateKind, { en: string; ru: string }> = {
  routine: { en: 'PROTOCOL — scored, streaked, costs a slot', ru: 'ПРОТОКОЛ — счёт, серия, занимает слот' },
  task:    { en: 'ORBIT — the day, uncapped and unscored',    ru: 'ORBIT — день, без лимита и без счёта' },
  basic:   { en: 'LIFE SUPPORT — a basic, 3 XP a run',        ru: 'ЖИЗНЕОБЕСПЕЧЕНИЕ — базовое, 3 XP за раз' },
  proof:   { en: 'BREACH — the act\'s datable proof',         ru: 'ПРОРЫВ — доказательство акта с датой' },
}

// ─── The prompt ───────────────────────────────────────────────────────────────

export const SPINE_SYSTEM = `You are the guide of THE WARREN — a human RPG. You read one DREAM and return its SPINE: the acts the dream breaks into, and a shelf of concrete things the operator can deploy.

Respond with ONLY a valid JSON object — no markdown, no code fences, no explanation.

{
  "verdict": "2-3 sentences: the honest read. What this dream actually requires, where the real bottleneck is, and what the spine is betting on. Name the hard part. No flattery.",
  "title": "UPLINK NAME (1-2 words, uppercase)",
  "category": "one word naming the life area — inferred from the dream, never asked",
  "acts": [
    { "key": "fluency", "title": "Act name (2-4 words)", "pressure": "critical",
      "intent": "one line: what finishing this act buys", "boss": "A self-tape shot and submitted", "due": null }
  ],
  "shelf": [
    { "key": "shadow", "kind": "routine", "act": "fluency", "title": "Shadow one English scene",
      "why": "one line: why this earns the slot it takes",
      "cue": "straight after morning coffee", "tier": 2,
      "ladder": ["10 min", "20 min", "one full scene"], "after": [], "tool": null },
    { "key": "coach", "kind": "task", "act": "fluency", "title": "Book a weekly English coach",
      "why": "...", "repeats": false }
  ]
}

ACTS — 3 to 5, in order.
- "key": short lowercase ascii slug, unique.
- "pressure": EXACTLY ONE act is "critical" — the bottleneck the verdict named. That is where this dream is actually won. The rest are "high" or "medium". Do not mark everything critical; a spine where every act is urgent says nothing.
- "boss": a real, datable, EXTERNAL event that ends the act, or null. A score state dressed as an event is not a boss. Most acts have none; the last one usually does.
- "due": "YYYY-MM-DD" ONLY when the dream itself names a date you can resolve to a single day. A month ("in June") or a season is NOT a date — return null. Never invent one: the operator can type it, and a guessed deadline is a fact nobody supplied.
- Acts run in order: act 1 is what the operator starts this week, the last act is the dream arriving.

SHELF — 8 to 16 items.
- ROUTINES: give ${PRIMARY_MAX_NODES - 1} to ${PRIMARY_MAX_NODES}, and put EVERY ONE of them in the FIRST act. Never propose a routine for a later act. The operator can train at most ${PRIMARY_MAX_NODES} routines at a time, so routines for act 3 are work that cannot be started — they are drawn as available and are not. Later acts are given their routines when they are reached, by which point the operator's real scores are known.
- TASKS: one-off obligations and errands the dream needs — bookings, purchases, submissions, admin. Any act. "repeats": true only for something genuinely recurring that does NOT build a skill (a weekly invoice, a standing call).
- BASICS: sleep, food, movement, hydration — ONLY when the dream genuinely stands on it. Most dreams need none.
- PROOFS: one per act that has a boss, restating that event. It is how the operator marks the act done.

ROUTINE fields (also used by BASIC):
- "cue" is REQUIRED and must be a concrete anchor — an existing habit ("straight after reading"), a place, or a pinned weekday and time ("Mon/Wed/Fri 19:00"). Never "daily" or "3x a week": floating frequency measurably slows automatism.
- "tier": 1 = ${TIER_META[1].profile}. 2 = ${TIER_META[2].profile}. 3 = ${TIER_META[3].profile}. 4 = ${TIER_META[4].profile}. Vary them.
- "ladder": 3 ascending thresholds for the SAME behaviour, smallest first. The first rung must be genuinely easy — it is what gets done on the worst day of the month.
- "after": keys of routines that must be automatic first. Only reference routines in the same act. 1-2 entry routines should have "after": []. Never form a loop.
- "tool": one of journal, ardo, solaris, pictures — only when the routine genuinely needs that instrument. Otherwise null.

- Every "key" stays lowercase ascii even when the titles are not English. Keys are unique across the whole shelf.
- "why" is one line and must be specific to this dream. "It builds discipline" is not an answer.

USING WHAT YOU WERE TOLD.
- Answers to the interview are CONSTRAINTS. If they said they have no money, do not propose anything that costs money. If they said four hours a week, the whole first act has to fit in four hours. A plan that ignores what they told you is worse than one that never asked.
- The record is real tracking, not self-report. Anchor new routines to what is ALREADY HOLDING — an existing automatic habit is the strongest cue available and it costs nothing to attach to. Do not stack on what is STRUGGLING.
- Never re-propose something they ALREADY TRIED AND STOPPED in the same shape. If the dream truly requires it, change something real — a smaller first rung, a different anchor, a different time — and say what you changed in that routine's "why".
- If they answered nothing and there is no record, say so plainly in the verdict: name the one assumption the spine rests on, so they know what to correct.`

/**
 * The interview. Asked before the spine exists, because the answers change it.
 *
 * The hard rule here is the one that keeps it from being a form: never ask what
 * the dream already told you. A dream written in three paragraphs has answered
 * half of these, and asking anyway is how a product teaches you it isn't reading.
 */
export const INTERVIEW_SYSTEM = `You are the guide of THE WARREN — a human RPG. Before you plan anything, you ask.

An operator has written a DREAM. You are going to turn it into a protocol of daily routines, and there are facts you do not have that would change that plan completely. Ask for them.

Respond with ONLY a valid JSON object — no markdown, no code fences, no explanation.

{
  "questions": [
    { "key": "budget", "question": "What can you actually spend on this each month?",
      "why": "A coach, a studio and a mic are three different plans. If the answer is nothing, the protocol has to produce the same result out of free reps.",
      "hint": "e.g. \\"about $100\\", or \\"nothing right now\\"" }
  ]
}

- 3 to 5 questions. Fewer is better. Every one must be a question whose answer would visibly CHANGE the protocol you write.
- NEVER ask something the dream already says. If they told you their English is B2, do not ask their level — ask what B2 fails at when they are on camera.
- Ask about FACTS AND CONSTRAINTS, never about personality. Good ground: money, hours genuinely free in a week, location and whether it can change, equipment already owned, a real deadline or none, other people the goal depends on, and what they have already tried for this that did not stick.
- If the record below shows routines that were abandoned, ask about ONE of them directly and specifically — what actually happened. That answer is worth more than any other.
- "why" is one or two sentences, honest and concrete, and names what changes depending on the answer. Never "to understand you better".
- "hint" shows the shape of a useful answer, including the shape of an honest negative one.
- "key": short lowercase ascii slug, unique.
- Questions are answered in a hurry, at night, by one tired person. Short, direct, no preamble, no flattery.`

/** Ask what the guide needs to know about this dream. */
export async function askInterview(dream: Dream, record = ''): Promise<Interview> {
  const settings = loadSettings()
  const brief = [dreamBrief(dream), record].filter(Boolean).join('\n\n')
  const raw = await aiJson<{ questions?: unknown }>([
    { role: 'system', content: INTERVIEW_SYSTEM },
    { role: 'user',   content: brief },
  ], settings, { model: modelForTask(settings, SPINE_TASK_ID), maxTokens: 1500 })
  return normalizeInterview(raw)
}

interface RawQuestion { key?: unknown; question?: unknown; why?: unknown; hint?: unknown }

/** Whatever came back becomes a set of askable questions, or an empty one. */
export function normalizeInterview(raw: { questions?: unknown }): Interview {
  const keys: string[] = []
  const questions: InterviewQuestion[] = arr(raw.questions).slice(0, 6).map(r => {
    const q = (r ?? {}) as RawQuestion
    const question = str(q.question)
    const key = uniqueKey(str(q.key) || question.slice(0, 20), keys)
    keys.push(key)
    return { key, question, why: str(q.why), hint: str(q.hint) }
  }).filter(q => q.question.length > 0)

  return { questions, answers: {}, askedAt: new Date().toISOString(), answeredAt: null }
}

/** What the operator said, folded into the brief the spine is written from. */
export function interviewBrief(interview: Interview | null | undefined): string {
  if (!interview) return ''
  const answered = interview.questions
    .map(q => ({ q, a: (interview.answers[q.key] ?? '').trim() }))
    .filter(x => x.a.length > 0)
  if (answered.length === 0) return ''

  return [
    'WHAT THE OPERATOR ANSWERED WHEN ASKED. These are constraints, not preferences —',
    'a protocol that ignores them is a protocol they cannot run:',
    ...answered.map(x => `  Q: ${x.q.question}\n  A: ${x.a}`),
  ].join('\n')
}

/** Filling a later act, once it is reached. A small, scoped, far more reliable ask. */
export const LAYER_SYSTEM = `You are the guide of THE WARREN. The operator has reached a new ACT of a protocol they are already running. Give that act its routines — nothing else.

Respond with ONLY a valid JSON object — no markdown, no code fences, no explanation.

{ "routines": [ { "key": "...", "title": "...", "why": "...", "cue": "...", "tier": 2,
                  "ladder": ["...", "...", "..."], "after": [], "tool": null } ] }

- ${PRIMARY_MAX_NODES - 2} to ${PRIMARY_MAX_NODES} routines. This act only.
- You are shown the routines the operator already runs and how automatic each has become. Build on what is working; do not restate a routine they already have, and do not stack a demanding new routine on top of one that is still struggling.
- "after" may reference an existing routine's key as well as a new one. Never form a loop.
- Every other field follows the same rules as the spine: a concrete cue, an ascending ladder whose first rung is easy, a tier that matches the real effort.`

// ─── Normalising an untrusted read ────────────────────────────────────────────

interface RawAct { key?: unknown; title?: unknown; pressure?: unknown; intent?: unknown; boss?: unknown; due?: unknown }
interface RawCandidate {
  key?: unknown; kind?: unknown; act?: unknown; title?: unknown; why?: unknown
  cue?: unknown; tier?: unknown; ladder?: unknown; after?: unknown; tool?: unknown; repeats?: unknown
}
export interface RawRead {
  verdict?: unknown; title?: unknown; category?: unknown; acts?: unknown; shelf?: unknown
}

const str = (v: unknown, fallback = ''): string => typeof v === 'string' ? v.trim() : fallback
const arr = (v: unknown): unknown[] => Array.isArray(v) ? v : []

function asTier(v: unknown): NodeTier {
  const n = Math.round(Number(v))
  return (n >= 1 && n <= 4 ? n : 2) as NodeTier
}

function asLadder(v: unknown): string[] {
  const rungs = arr(v).map(x => str(x)).filter(Boolean).slice(0, 5)
  return rungs.length ? rungs : ['']
}

function asTool(v: unknown): string | null {
  const s = str(v).toLowerCase()
  return (GRANTABLE_TOOLS as readonly string[]).includes(s) ? s : null
}

function asPressure(v: unknown): Pressure {
  const s = str(v).toLowerCase()
  return s === 'critical' || s === 'high' || s === 'medium' ? s : 'high'
}

function asKind(v: unknown): CandidateKind {
  const s = str(v).toLowerCase()
  return s === 'routine' || s === 'task' || s === 'basic' || s === 'proof' ? s : 'task'
}

/**
 * Turn whatever came back into a read that always renders.
 *
 * Every failure mode is repaired rather than rejected — a read that refused to
 * open would just be a dead end, and the operator is the one who decides what
 * survives anyway. What is NOT repaired quietly is pressure: if the model marked
 * three acts critical, the first one keeps it and the rest drop to high, because
 * a spine where everything is critical has told you nothing.
 */
export function normalizeRead(raw: RawRead, dream: { id?: string; title: string }): DreamRead {
  // 1. Acts. At least one always exists, so every candidate has somewhere to go.
  const actKeys: string[] = []
  const acts: SpineAct[] = arr(raw.acts).slice(0, 5).map((r, i) => {
    const a = (r ?? {}) as RawAct
    const title = str(a.title) || `Act ${i + 1}`
    const key   = uniqueKey(str(a.key) || title, actKeys)
    actKeys.push(key)
    return {
      key, title,
      pressure: asPressure(a.pressure),
      intent:   str(a.intent),
      boss:     str(a.boss) || null,
      // A date with no event is a date for nothing, so it travels with the boss.
      due:      str(a.boss) && isDueDate(str(a.due)) ? str(a.due) : null,
    }
  })

  if (acts.length === 0) {
    acts.push({ key: 'act-1', title: 'Act 1', pressure: 'critical', intent: '', boss: null, due: null })
    actKeys.push('act-1')
  }

  // Exactly one critical. First one declared keeps it; if none did, act 1 takes
  // it — the opening act is the one being started, so it is never "medium".
  let criticalSeen = false
  for (const a of acts) {
    if (a.pressure !== 'critical') continue
    if (criticalSeen) a.pressure = 'high'
    criticalSeen = true
  }
  if (!criticalSeen) acts[0].pressure = 'critical'

  const firstAct = acts[0].key
  const knownAct = new Set(actKeys)

  // 2. Candidates. Keys are unique across the whole shelf: a routine and a proof
  //    that shared one would collide the moment either was deployed.
  const keys: string[] = []
  const shelf: Candidate[] = arr(raw.shelf).slice(0, 30).map(r => {
    const c = (r ?? {}) as RawCandidate
    const title = str(c.title)
    const key   = uniqueKey(str(c.key) || title, keys)
    keys.push(key)
    const kind = asKind(c.kind)
    return {
      key, kind,
      // No fallback title here, unlike a draft node. A node with a placeholder
      // name is something you rename in the forge; a shelf card called
      // "routine", with no cue and no reason, is a defect asking to be deployed.
      title,
      // An unplaceable candidate is not dropped — it lands in the opening act,
      // where it is visible and can be moved, rather than vanishing silently.
      act:     knownAct.has(str(c.act)) ? str(c.act) : firstAct,
      why:     str(c.why),
      cue:     str(c.cue),
      tier:    asTier(c.tier),
      ladder:  asLadder(c.ladder),
      after:   arr(c.after).map(x => str(x)).filter(Boolean),
      toolId:  asTool(c.tool),
      repeats: c.repeats === true,
    }
  }).filter(c => c.title.trim().length > 0)

  // 3. Prerequisites, among routines only. Walking in declaration order and
  //    refusing back-references cuts every cycle without having to detect one.
  const routineKeys = new Set(shelf.filter(c => c.kind === 'routine').map(c => c.key))
  const settled = new Set<string>()
  for (const c of shelf) {
    if (c.kind !== 'routine') { c.after = []; continue }
    c.after = [...new Set(c.after)].filter(k => k !== c.key && routineKeys.has(k) && settled.has(k))
    settled.add(c.key)
  }

  return {
    verdict:     str(raw.verdict),
    title:       str(raw.title) || dream.title.toUpperCase(),
    category:    str(raw.category),
    acts,
    shelf,
    generatedAt: new Date().toISOString(),
  }
}

// ─── A read becomes a draft ───────────────────────────────────────────────────

export const routineCandidates = (read: DreamRead, actKey: string): Candidate[] =>
  read.shelf.filter(c => c.kind === 'routine' && c.act === actKey)

/**
 * The draft the forge opens: every act as a chapter, but only the opening act
 * carrying routines. The later chapters are PLANNED — they hold their title,
 * their boss and their place in the story with nothing installed under them yet.
 *
 * This is the whole reason the forge is reviewable now. The operator reads the
 * ${PRIMARY_MAX_NODES} routines they are about to start, not fifteen they aren't.
 */
export function readToDraft(
  read: DreamRead,
  dream: { id?: string },
  /** Habits already running, so "straight after reading aloud" can resolve to one. */
  habits: { id: string; text: string }[] = [],
): ChainDraft {
  const draft = blankDraft(read.title)
  draft.sourceDreamId = dream.id ?? null
  draft.note = read.verdict

  const opening = read.acts[0]?.key ?? ''
  const nodes: DraftNode[] = routineCandidates(read, opening).map(c => {
    // The guide writes an anchor in prose because that is what a person says.
    // This is where it becomes something the timeline can act on; when it will
    // not parse, the prose is kept and shown as-is until it is edited.
    const anchor = parseAnchor(c.cue, habits)
    return {
      key:    c.key,
      title:  c.title,
      cue:    c.cue,
      ...(anchor ? { anchor } : {}),
      tier:   c.tier,
      ladder: c.ladder,
      after:  c.after,
      toolId: c.toolId,
    }
  })

  draft.nodes = nodes
  draft.chapters = read.acts.map((a, i) => ({
    key:     a.key,
    title:   a.title,
    keys:    i === 0 ? nodes.map(n => n.key) : [],
    boss:    a.boss,
    due:     a.due,
    planned: i !== 0,
  }))

  return draft
}

// ─── The read that already existed ────────────────────────────────────────────

/**
 * A pre-spine analysis, converted rather than discarded.
 *
 * The old shape was missions holding tasks, with a priority per mission and a
 * type per task. That maps onto the spine almost exactly — a mission is an act,
 * its priority is the act's pressure — and the task types map onto kinds by the
 * rule that decides everything else here: a HABIT builds you, so it is a
 * routine; a DAILY or a TODO just has to happen, so it is an ORBIT task.
 *
 * Nothing is deployed by converting. The candidates land on the shelf and wait
 * to be chosen, which is the point — the tasks the old panel already pushed into
 * ORBIT are untouched and still sitting there.
 */
export function readFromAnalysis(
  a: { analysis: string; missions: AnalyzedMission[] },
  dream: { title: string; category?: string },
): DreamRead {
  const pressureOf = (p: MissionPriority): Pressure =>
    p === 'critical' ? 'critical' : p === 'high' ? 'high' : 'medium'

  return normalizeRead({
    verdict:  a.analysis,
    title:    dream.title.toUpperCase(),
    category: dream.category ?? '',
    acts: a.missions.map(m => ({
      key:      m.title,
      title:    m.title,
      pressure: pressureOf(m.priority),
      intent:   m.description,
      boss:     null,
      due:      null,
    })),
    shelf: a.missions.flatMap(m => m.tasks.map(t => ({
      key:     t.text,
      kind:    t.type === 'habit' ? 'routine' : 'task',
      act:     slugify(m.title) || m.title,
      title:   t.text,
      why:     '',
      repeats: t.type === 'daily',
    }))),
  }, dream)
}

// ─── The calls ────────────────────────────────────────────────────────────────

/** What the guide is given: the dream, and whatever thinking already exists under it. */
export function dreamBrief(dream: Dream): string {
  const missions = dream.missions.slice(0, 6).map(m => {
    const tasks = m.tasks.slice(0, 6).map(t => `      · ${t.text} (${t.type})`).join('\n')
    return `  MISSION: ${m.title}${m.description ? ` — ${m.description}` : ''}${tasks ? `\n${tasks}` : ''}`
  }).join('\n')

  return [
    `DREAM: ${dream.title}`,
    dream.description ? `DESCRIPTION: ${dream.description}` : '',
    missions ? `\nWork already broken out under it:\n${missions}` : '\n(No missions defined yet.)',
  ].filter(Boolean).join('\n')
}

/**
 * Read a dream. Throws on transport/auth failure; the caller shows it.
 *
 * Four things go in, and each one used to be missing: the operator's hours, the
 * dream itself, what they answered when asked, and what actually happened the
 * last times they tried something. The guide was writing plans for a stranger.
 */
export async function readDream(
  dream: Dream,
  context: { interview?: Interview | null; record?: string } = {},
): Promise<DreamRead> {
  const settings = loadSettings()
  // The shape goes in as the skeleton. Adapting four acts is a smaller and far
  // more reliable ask than inventing the structure and the subject at once —
  // and it is the same skeleton the no-key path uses, so the two agree.
  const shape = matchShape(dream)
  // The operator's hours are a hard constraint on where cues can sit — a chain
  // anchored to 6am for a night owl fails for reasons unrelated to willpower.
  const brief = [
    profileBrief(dayShape(settings.sleepTime, settings.wakeTime)),
    dreamBrief(dream),
    shape ? shapeBrief(shape) : '',
    interviewBrief(context.interview),
    context.record ?? '',
  ].filter(Boolean).join('\n\n')
  const messages: AiMessage[] = [
    { role: 'system', content: SPINE_SYSTEM },
    { role: 'user',   content: brief },
  ]
  const raw = await aiJson<RawRead>(messages, settings, {
    model: modelForTask(settings, SPINE_TASK_ID),
    maxTokens: 5000,
  })
  return normalizeRead(raw, dream)
}

interface RawLayer { routines?: unknown }

/**
 * Routines for one act, normalised against what already exists. Keys taken by a
 * live routine are never reused — rule 13: a key is permanent, and a collision
 * would silently hand a new routine an old routine's accumulated score.
 */
export function normalizeLayer(raw: RawLayer, actKey: string, taken: Iterable<string>): Candidate[] {
  const keys = [...taken]
  const fresh: string[] = []
  const out = arr(raw.routines).slice(0, PRIMARY_MAX_NODES).map(r => {
    const c = (r ?? {}) as RawCandidate
    const title = str(c.title)
    const key   = uniqueKey(str(c.key) || title, keys)
    keys.push(key)
    fresh.push(key)
    return {
      key, kind: 'routine' as const,
      title:  title || key,
      act:    actKey,
      why:    str(c.why),
      cue:    str(c.cue),
      tier:   asTier(c.tier),
      ladder: asLadder(c.ladder),
      after:  arr(c.after).map(x => str(x)).filter(Boolean),
      toolId: asTool(c.tool),
      repeats: false,
    }
  }).filter(c => c.title.trim().length > 0)

  // A new routine may depend on one that already exists, or on an earlier one
  // from this same layer — never on a later one, which is what cuts the cycles.
  const settled = new Set(taken)
  for (const c of out) {
    c.after = [...new Set(c.after)].filter(k => k !== c.key && settled.has(k))
    settled.add(c.key)
  }
  return out
}

/**
 * Fold a freshly deepened act's routines into the read they belong to.
 *
 * The shelf is the only way anything reaches a protocol, so a layer lands there
 * rather than installing itself — deepening an act proposes work, it does not
 * start it. Keys already on the shelf are skipped: pressing DEEPEN twice must
 * not shelve the same routine again under a counted key, because that key would
 * then be permanent (rule 13).
 */
export function mergeLayer(read: DreamRead, layer: Candidate[]): DreamRead {
  const taken = new Set(read.shelf.map(c => c.key))
  const fresh = layer.filter(c => !taken.has(c.key))
  return fresh.length ? { ...read, shelf: [...read.shelf, ...fresh] } : read
}

/** What the operator is actually running, so a layer builds on it rather than beside it. */
export function goalBrief(goal: Goal, scoreOf: (nodeId: string) => number): string {
  const keyOf = (id: string) => id.startsWith(`${goal.id}:`) ? id.slice(goal.id.length + 1) : id
  const lines = goal.nodes.map(n => {
    const score = scoreOf(n.id)
    const state = !n.scrapTaskId ? 'not installed' : `automatism ${score.toFixed(2)}`
    return `  · ${keyOf(n.id)} — ${n.title} (${TIER_META[n.tier].name}, ${state})`
  }).join('\n')
  return `UPLINK: ${goal.title}\nRoutines already in this protocol:\n${lines || '  (none yet)'}`
}

/** Fill one act with routines. The scoped call — small ask, real context. */
export async function deepenAct(
  goal: Goal,
  act: { key: string; title: string; intent: string; boss: string | null },
  scoreOf: (nodeId: string) => number,
  record = '',
): Promise<Candidate[]> {
  const settings = loadSettings()
  const keyOf = (id: string) => id.startsWith(`${goal.id}:`) ? id.slice(goal.id.length + 1) : id
  const brief = [
    profileBrief(dayShape(settings.sleepTime, settings.wakeTime)),
    goalBrief(goal, scoreOf),
    record,
    `\nTHE ACT TO FILL: ${act.title}` +
      (act.intent ? `\nWhat it buys: ${act.intent}` : '') +
      (act.boss ? `\nIt ends with: ${act.boss}` : ''),
  ].filter(Boolean).join('\n\n')

  const raw = await aiJson<RawLayer>([
    { role: 'system', content: LAYER_SYSTEM },
    { role: 'user',   content: brief },
  ], settings, { model: modelForTask(settings, SPINE_TASK_ID), maxTokens: 2500 })

  return normalizeLayer(raw, act.key, goal.nodes.map(n => keyOf(n.id)))
}
