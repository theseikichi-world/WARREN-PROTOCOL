// ─── PATHFINDER — where dreams are written and read ───────────────────────────
// Hierarchy: Dream → Mission → Task
//
// The old flow synced daily/habit tasks straight into ORBIT, where they landed
// with origin 'log' and earned nothing. A dream's work now goes out through the
// SHELF instead, which types every candidate by the system allowed to hold it —
// see `progression/shelf.ts`.

import type { DreamRead, Interview } from '../progression/spine'

export type MissionStatus   = 'active' | 'completed' | 'paused'
export type MissionPriority = 'critical' | 'high' | 'medium' | 'low'
export type LogTaskType     = 'todo' | 'daily' | 'habit'

// ─── Task (finest grain — can live in ORBIT too) ────────────────────────────
export interface LogTask {
  id:        string
  text:      string
  type:      LogTaskType
  done:      boolean
  scrap7Id?: string    // set when synced to ORBIT (same ID)
  createdAt: string
}

// ─── Mission (objective serving a Dream) ──────────────────────────────────────
export interface Mission {
  id:          string
  title:       string
  description: string
  priority:    MissionPriority
  status:      MissionStatus
  deadline?:   string | null
  tasks:       LogTask[]
  signals:     Signal[]       // field log / notes
  createdAt:   string
  completedAt: string | null
}

// ─── Signal (progress note on a mission) ─────────────────────────────────────
export interface Signal {
  id:        string
  text:      string
  createdAt: string
}

// ─── Dream (the star — long-range vision) ─────────────────────────────────────
// Priority is POSITIONAL: a dream's rank = its index in LogState.dreams
// (top = highest priority). Reorder via drag to re-rank.
export interface Dream {
  id:          string
  title:       string
  description: string
  category:    string
  missions:    Mission[]
  createdAt:   string
  /**
   * THE SPINE — the current read of this dream: its acts, and the shelf of
   * candidates that can be deployed from it. One read now feeds both PATHFINDER
   * and the protocol; see `progression/spine.ts`.
   */
  read?:       DreamRead
  /**
   * What the guide asked about this dream, and what was answered. Kept so the
   * answers survive a re-read — they are facts about a life, and re-typing them
   * every time the spine is regenerated would be the fastest way to stop
   * answering honestly.
   */
  interview?:  Interview
  /** The pre-spine breakdown. Kept so an existing one can be converted, not lost. */
  analysis?:   DreamAnalysis
  x?:          number          // star-map position, 0..1 (fraction of board)
  y?:          number
}

// ─── AI analysis (persisted) ──────────────────────────────────────────────────
export interface AnalyzedTask {
  text: string
  type: LogTaskType
}
export interface AnalyzedMission {
  title:         string
  description:   string
  priority:      MissionPriority
  deadline_days: number
  tasks:         AnalyzedTask[]
}
export interface DreamAnalysis {
  analysis:    string
  missions:    AnalyzedMission[]
  generatedAt: string
}

// ─── Constellation (cross-dream synthesis) ────────────────────────────────────
export interface ConstellationLink {
  dreams:  string[]   // dream titles that connect
  insight: string
}
/** A unified, ORBIT-ready action with a clean, natural name. */
export interface PlanItem {
  text:      string       // short, natural task name (NOT the full dream text)
  type:      LogTaskType
  serves:    string       // which dream(s) this advances
  deployed?: boolean      // true once pushed to ORBIT (prevents dup re-deploys)
}
export interface Constellation {
  synthesis:   string
  links:       ConstellationLink[]
  plan:        PlanItem[]
  generatedAt: string
}

// ─── App state ────────────────────────────────────────────────────────────────
export interface LogState {
  dreams:        Dream[]
  categories:    string[]
  constellation?: Constellation   // persisted cross-dream analysis
}

// ─── Constants ────────────────────────────────────────────────────────────────
export const DEFAULT_CATEGORIES = ['Acting', 'Health', 'Work', 'Study', 'Finance', 'Personal']

export const PRIORITY_COLORS: Record<MissionPriority, string> = {
  critical: '#ff0033',
  high:     '#ff6b00',
  medium:   '#c084fc',
  low:      'rgba(148,163,184,0.4)',
}

export const PRIORITY_LABELS: Record<MissionPriority, string> = {
  critical: 'CRITICAL',
  high:     'HIGH',
  medium:   'MEDIUM',
  low:      'LOW',
}

export const TASK_TYPE_COLOR: Record<LogTaskType, string> = {
  todo:  'rgba(148,163,184,0.5)',
  daily: '#00f5ff',
  habit: '#00b4ff',
}

export const TASK_TYPE_LABEL: Record<LogTaskType, string> = {
  todo:  'TODO',
  daily: 'DAILY',
  habit: 'HABIT',
}

// ─── Progress helpers ─────────────────────────────────────────────────────────
export function calcMissionProgress(m: Mission): number {
  if (m.status === 'completed') return 100
  if (m.tasks.length === 0) return 0
  return Math.round(m.tasks.filter(t => t.done).length / m.tasks.length * 100)
}

export function calcDreamProgress(d: Dream): number {
  if (d.missions.length === 0) return 0
  const total = d.missions.reduce((s, m) => s + calcMissionProgress(m), 0)
  return Math.round(total / d.missions.length)
}

export function daysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
}

export function formatEta(days: number | null): string {
  if (days === null) return ''
  if (days < 0)  return `OVERDUE ${Math.abs(days)}d`
  if (days === 0) return 'DUE TODAY'
  return `T-${days}d`
}

export function etaColor(days: number | null): string {
  if (days === null) return 'rgba(148,163,184,0.35)'
  if (days < 0)   return '#ff0033'
  if (days <= 7)  return '#ff6b00'
  if (days <= 21) return '#eab308'
  return 'rgba(148,163,184,0.4)'
}
