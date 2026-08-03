// ─── What the level curve actually opens ──────────────────────────────────────
// Modules used to be visible from the first second, which made levelling a
// number with no consequences. In an RPG the world widens as you go, so it
// widens here too — but under one hard constraint:
//
//   A MODULE MUST BE OPEN BEFORE ANY QUEST SENDS YOU TO IT.
//
// That's the difference between a locked door and a dead end, and there's a test
// pinning it (`moduleAccess.test.ts`). It also keeps rule 8 intact: what a level
// holds back is a whole instrument you have no use for yet, never a feature of
// something you're already using — SOLARIS still opens complete at v0.
//
// The starting three are never locked: you need somewhere to put a dream,
// somewhere to see your character, and somewhere to write.

import type { ModuleId } from './guild'

export const MODULE_LEVEL: Partial<Record<ModuleId, number>> = {
  log:    1,   // PATHFINDER — stage 1 sends you here for CHOOSE ONE DREAM
  hoot:   1,   // JOURNAL    — stage 1 sends you here for FIRST LIGHT
  pomu:   2,   // SOLARIS    — stage 2 sends you here for WATER DISCIPLINE
  scrap7: 2,   // SCRAP-7    — the day's admin, once the character exists
  foxy:   3,   // PICTURES   — a utility, and the first thing that is purely yours
  ardo:   4,   // A.R.D.O    — stage 4 sends you here for COMMIT TO MEMORY
}

/** The level a module opens at. Anything unlisted is open from the start. */
export const moduleLevel = (id: ModuleId): number => MODULE_LEVEL[id] ?? 1

export const moduleUnlocked = (id: ModuleId, level: number): boolean =>
  level >= moduleLevel(id)

/** Modules this level just opened — for the level-up screen to name them. */
export const modulesOpenedAt = (level: number): ModuleId[] =>
  (Object.keys(MODULE_LEVEL) as ModuleId[]).filter(id => MODULE_LEVEL[id] === level && level > 1)
