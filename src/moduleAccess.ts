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
// What you start with is the goal loop and nothing else: somewhere to put a
// dream, and the character sheet it hangs off.
//
// UTILITIES ARE NEVER GATED. A.R.D.O and PICTURES answer to no goal, feed no
// gate and cost no slot — locking them was withholding a toy, not pacing a
// system, and rule 8 says gate complexity rather than utility. Their own depth
// still comes from use: A.R.D.O's tiers are earned, not opened by a level.

import type { ModuleId } from './guild'

export const MODULE_LEVEL: Partial<Record<ModuleId, number>> = {
  log:    1,   // PATHFINDER — stage 1 sends you here for CHOOSE ONE DREAM
  pomu:   2,   // SOLARIS    — stage 2 sends you here for WATER DISCIPLINE
  // ORBIT — open from the start since LIFE SUPPORT moved into it. Stage 1's
  // KEEP YOURSELF RUNNING installs a basic, and a basic is an ORBIT habit, so
  // holding the module to level 2 would have made that quest a dead end. The
  // floor is not something you earn access to.
  scrap7: 1,
  hoot:   3,   // JOURNAL    — stage 3, once there is something worth recording
  vigil:  5,   // VIGILANTE  — stage 5; the body comes after the habit of showing up
}

/** The level a module opens at. Anything unlisted is open from the start. */
export const moduleLevel = (id: ModuleId): number => MODULE_LEVEL[id] ?? 1

/**
 * `unlockAll` opens every door regardless of level.
 *
 * Two reasons it exists. Not everyone wants to be levelled at — someone who
 * came for a habit tracker should not have to earn the kitchen. And the gates
 * make the app hard to inspect: checking a change in A.R.D.O should not require
 * playing to level 4 first.
 *
 * It withholds nothing else. Quests still run, XP still accrues, the character
 * still levels — the switch is about doors, not about progress.
 */
export const moduleUnlocked = (id: ModuleId, level: number, unlockAll = false): boolean =>
  unlockAll || level >= moduleLevel(id)

/** Modules this level just opened — for the level-up screen to name them. */
export const modulesOpenedAt = (level: number): ModuleId[] =>
  (Object.keys(MODULE_LEVEL) as ModuleId[]).filter(id => MODULE_LEVEL[id] === level && level > 1)
