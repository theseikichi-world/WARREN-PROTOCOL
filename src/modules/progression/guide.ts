// ─── The guide — a dream becomes a proposed PROTOCOL ──────────────────────────
// Life is finite; the dream list isn't. The guide's job is the narrowing: take
// one dream and lay out the smallest chain of routines that would actually get
// you there, in the order a person can carry.
//
// It proposes. It never commits — the output of this file is a DRAFT, and every
// node passes through the forge before a single habit exists. That is also why
// the normaliser below is paranoid: a proposal is untrusted input, and a broken
// graph must still open in the editor rather than fail to render.

import { aiJson, loadSettings, modelForTask, type AiMessage } from '../../settings'
import type { Dream } from '../log/types'
import type { NodeTier } from './types'
import { TIER_META } from './types'
import { blankDraft, uniqueKey, type ChainDraft, type DraftNode } from './draft'

export const GUIDE_TASK_ID = 'uplink.protocol'

/** Instruments a routine can grant. Anything else the model invents is dropped. */
export const GRANTABLE_TOOLS = ['journal', 'ardo', 'solaris', 'pictures'] as const

export const GUIDE_SYSTEM = `You are the guide of THE WARREN — a human RPG. You turn one DREAM into a PROTOCOL: a tech tree of daily ROUTINES that, followed, actually produce the dream.

Respond with ONLY a valid JSON object — no markdown, no code fences, no explanation.

{
  "note": "1-2 sentences: the honest read on this dream — what it really requires, and what the chain is betting on. No flattery.",
  "title": "UPLINK NAME (1-2 words, uppercase)",
  "chapters": [
    { "title": "Chapter name (2-3 words)", "keys": ["reading", "diction"], "boss": null }
  ],
  "nodes": [
    {
      "key": "reading",
      "title": "Reading aloud",
      "cue": "after morning coffee",
      "tier": 2,
      "ladder": ["30 min", "45 min", "60 min"],
      "after": [],
      "tool": null
    }
  ]
}

Rules:
- 5-9 nodes total, in 2-4 chapters. Every node appears in exactly ONE chapter.
- "key": short lowercase ascii slug, unique, stable. Referenced by "after" and by chapter "keys".
- "cue" is REQUIRED and must be a concrete anchor — an existing habit ("straight after reading"), a place, or a pinned weekday and time ("Mon/Wed/Fri 19:00"). Never "daily" or "3x a week": floating frequency measurably slows automatism.
- "tier": 1 = ${TIER_META[1].profile}. 2 = ${TIER_META[2].profile}. 3 = ${TIER_META[3].profile}. 4 = ${TIER_META[4].profile}.
- "ladder": 3 ascending thresholds for the SAME behaviour, smallest first. The first rung must be genuinely easy — it is what gets done on the worst day of the month.
- "after": keys of routines that must be integrated first. 1-3 entry nodes with "after": [] ; the rest form a shallow tree, not one long line. Never reference a key that doesn't exist and never form a loop.
- "tool": one of journal, ardo, solaris, pictures — only when the routine genuinely needs that instrument. Otherwise null.
- "boss": a real, datable, EXTERNAL event that ends the chapter ("A self-tape shot and submitted") — or null. A score state dressed as an event is not a boss. Most chapters have none; the last one usually does.
- Every "key" stays lowercase ascii even when the titles are not English.`

// ─── Normalising an untrusted proposal ────────────────────────────────────────

interface RawNode {
  key?: unknown; title?: unknown; cue?: unknown; tier?: unknown
  ladder?: unknown; after?: unknown; tool?: unknown
}
interface RawChapter { title?: unknown; keys?: unknown; boss?: unknown }
export interface RawProposal {
  note?: unknown; title?: unknown; nodes?: unknown; chapters?: unknown
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

/**
 * Turn whatever came back into a draft that always opens.
 *
 * Every failure mode is repaired rather than rejected: unknown prerequisites are
 * dropped, loops are cut at the edge that closes them, an unassigned node lands
 * in the last chapter. The user then sees and edits the result — a proposal that
 * refused to render would just be a dead end.
 */
export function normalizeProposal(raw: RawProposal, dream: { id?: string; title: string }): ChainDraft {
  const draft = blankDraft(str(raw.title) || dream.title.toUpperCase())
  draft.sourceDreamId = dream.id ?? null
  draft.note = str(raw.note)

  // 1. Nodes, with unique keys. A key collision would silently merge routines.
  const keys: string[] = []
  const nodes: DraftNode[] = arr(raw.nodes).slice(0, 16).map(r => {
    const n = (r ?? {}) as RawNode
    const title = str(n.title)
    const key   = uniqueKey(str(n.key) || title, keys)
    keys.push(key)
    return {
      key,
      title:  title || key,
      cue:    str(n.cue),
      tier:   asTier(n.tier),
      ladder: asLadder(n.ladder),
      after:  arr(n.after).map(x => str(x)).filter(Boolean),
      toolId: asTool(n.tool),
    }
  })

  // 2. Prerequisites: keep only edges that point at a real, earlier-resolvable
  //    node. Walking in declaration order and refusing back-references cuts
  //    every cycle without needing to detect them.
  const settled = new Set<string>()
  for (const n of nodes) {
    n.after = [...new Set(n.after)].filter(k => k !== n.key && settled.has(k))
    settled.add(n.key)
  }

  const byKey = new Map(nodes.map(n => [n.key, n]))
  draft.nodes = nodes

  // 3. Chapters. Anything the model forgot to place still has a home.
  const placed = new Set<string>()
  const chapters = arr(raw.chapters).slice(0, 6).map((r, i) => {
    const c = (r ?? {}) as RawChapter
    const chapterKeys = arr(c.keys).map(x => str(x))
      .filter(k => byKey.has(k) && !placed.has(k))
    for (const k of chapterKeys) placed.add(k)
    return { title: str(c.title) || `Chapter ${i + 1}`, keys: chapterKeys, boss: str(c.boss) || null }
  }).filter(c => c.keys.length > 0)

  if (chapters.length === 0) chapters.push({ title: 'Chapter 1', keys: [], boss: null })
  const orphans = nodes.filter(n => !placed.has(n.key)).map(n => n.key)
  if (orphans.length) chapters[chapters.length - 1].keys.push(...orphans)

  draft.chapters = chapters
  return draft
}

// ─── The call ─────────────────────────────────────────────────────────────────

/** What the guide is given: the dream, and whatever thinking already exists under it. */
export function dreamBrief(dream: Dream): string {
  const missions = dream.missions.slice(0, 6).map(m => {
    const tasks = m.tasks.slice(0, 6).map(t => `      · ${t.text} (${t.type})`).join('\n')
    return `  MISSION: ${m.title}${m.description ? ` — ${m.description}` : ''}${tasks ? `\n${tasks}` : ''}`
  }).join('\n')

  return [
    `DREAM: ${dream.title}`,
    dream.description ? `DESCRIPTION: ${dream.description}` : '',
    dream.category ? `CATEGORY: ${dream.category}` : '',
    missions ? `\nWork already broken out under it:\n${missions}` : '\n(No missions defined yet.)',
  ].filter(Boolean).join('\n')
}

/** Ask the guide for a chain. Throws on transport/auth failure; the caller shows it. */
export async function proposeChain(dream: Dream): Promise<ChainDraft> {
  const settings = loadSettings()
  const messages: AiMessage[] = [
    { role: 'system', content: GUIDE_SYSTEM },
    { role: 'user',   content: dreamBrief(dream) },
  ]
  const raw = await aiJson<RawProposal>(messages, settings, {
    model: modelForTask(settings, GUIDE_TASK_ID),
    maxTokens: 2400,
  })
  return normalizeProposal(raw, dream)
}
