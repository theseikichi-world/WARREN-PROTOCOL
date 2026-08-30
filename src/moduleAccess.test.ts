import { describe, it, expect } from 'vitest'
import { MODULE_LEVEL, moduleLevel, moduleUnlocked, modulesOpenedAt } from './moduleAccess'
import { GUILD, type ModuleId } from './guild'
import { QUEST_LINE, QUEST_DESTINATIONS } from './modules/progression/quests'

describe('module gates', () => {
  it('leaves anything unlisted open from the start', () => {
    expect(moduleLevel('nimbus')).toBe(1)
    expect(moduleUnlocked('nimbus', 1)).toBe(true)
  })

  it('locks below its level and opens at it', () => {
    expect(moduleUnlocked('hoot', 2)).toBe(false)
    expect(moduleUnlocked('hoot', 3)).toBe(true)
  })

  it('never gates a utility — they answer to no goal and cost no slot', () => {
    // Rule 8: gate complexity, never utility. A.R.D.O and PICTURES feed no gate
    // and take no bandwidth, so locking them withheld a toy rather than pacing
    // anything. Their depth is still earned by use, not opened by a level.
    for (const m of GUILD.filter(g => g.built && g.group === 'utility')) {
      expect(moduleLevel(m.id), `${m.id} is a utility and must not be gated`).toBe(1)
    }
  })

  it('only names real modules', () => {
    const ids = new Set(GUILD.map(m => m.id))
    for (const id of Object.keys(MODULE_LEVEL) as ModuleId[]) expect(ids.has(id)).toBe(true)
  })

  it('never claims level 1 opened something', () => {
    expect(modulesOpenedAt(1)).toEqual([])
  })

  it('reports what a level opens, for the level screen to name', () => {
    expect(modulesOpenedAt(3)).toContain('hoot')
    // ORBIT used to be here. It opens at level 1 now that LIFE SUPPORT lives in
    // it and a stage-1 quest sends you there.
    expect(modulesOpenedAt(2)).toEqual(['pomu'])
    expect(modulesOpenedAt(2)).not.toContain('scrap7')
  })
})

describe('a locked door is never a dead end', () => {
  /**
   * The invariant the whole feature rests on: a stage's quests become live when
   * you reach that level, so every module a quest points at must already be open
   * at that level. Break this and the starting zone hands you an objective you
   * physically cannot reach.
   */
  it('opens every module before the quest that sends you there', () => {
    const pathToId = new Map(GUILD.map(m => [m.path, m.id]))
    for (const quest of QUEST_LINE) {
      const path = QUEST_DESTINATIONS[quest.target].path
      if (!path) continue
      const id = pathToId.get(path)
      if (!id) continue
      expect(
        moduleUnlocked(id, quest.stage),
        `${quest.id} (stage ${quest.stage}) points at ${id}, which opens at level ${moduleLevel(id)}`,
      ).toBe(true)
    }
  })

  it('keeps what you start with open at level 1', () => {
    // Somewhere to put a dream, and the character sheet it hangs off. The
    // journal is no longer one of them — it arrives with stage 3.
    expect(moduleUnlocked('log', 1)).toBe(true)
    expect(moduleUnlocked('hoot', 1)).toBe(false)
  })

  it('never gates a module past the last level the quest line can reach', () => {
    const lastStage = Math.max(...QUEST_LINE.map(q => q.stage))
    for (const id of Object.keys(MODULE_LEVEL) as ModuleId[]) {
      expect(moduleLevel(id)).toBeLessThanOrEqual(lastStage + 1)
    }
  })
})
