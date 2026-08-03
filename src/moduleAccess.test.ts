import { describe, it, expect } from 'vitest'
import { MODULE_LEVEL, moduleLevel, moduleUnlocked, modulesOpenedAt } from './moduleAccess'
import { GUILD, type ModuleId } from './guild'
import { QUEST_LINE, QUEST_DESTINATIONS } from './modules/progression/quests'

describe('module gates', () => {
  it('leaves anything unlisted open from the start', () => {
    expect(moduleLevel('kana')).toBe(1)
    expect(moduleUnlocked('kana', 1)).toBe(true)
  })

  it('locks below its level and opens at it', () => {
    expect(moduleUnlocked('ardo', 3)).toBe(false)
    expect(moduleUnlocked('ardo', 4)).toBe(true)
  })

  it('only names real modules', () => {
    const ids = new Set(GUILD.map(m => m.id))
    for (const id of Object.keys(MODULE_LEVEL) as ModuleId[]) expect(ids.has(id)).toBe(true)
  })

  it('never claims level 1 opened something', () => {
    expect(modulesOpenedAt(1)).toEqual([])
  })

  it('reports what a level opens, for the level screen to name', () => {
    expect(modulesOpenedAt(4)).toContain('ardo')
    expect(modulesOpenedAt(2)).toEqual(expect.arrayContaining(['pomu', 'scrap7']))
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

  it('keeps the three you start with open at level 1', () => {
    // Somewhere to put a dream, somewhere to write, and the character sheet
    for (const id of ['log', 'hoot'] as ModuleId[]) expect(moduleUnlocked(id, 1)).toBe(true)
  })

  it('never gates a module past the last level the quest line can reach', () => {
    const lastStage = Math.max(...QUEST_LINE.map(q => q.stage))
    for (const id of Object.keys(MODULE_LEVEL) as ModuleId[]) {
      expect(moduleLevel(id)).toBeLessThanOrEqual(lastStage + 1)
    }
  })
})
