import { describe, it, expect } from 'vitest'
import { SHAPES, matchShape, shapeById, shapeBrief, shapeToRead } from './shapes'
import { normalizeRead } from './spine'

const dream = (title: string, description = '') => ({ title, description })

describe('the shape library', () => {
  it('covers six structures, not a list of subjects', () => {
    expect(SHAPES).toHaveLength(6)
    expect(SHAPES.map(s => s.id)).toEqual(
      ['practise', 'body', 'ship', 'date', 'audience', 'quit'])
  })

  it('gives every act an intent, and every shape at least one datable proof', () => {
    for (const shape of SHAPES) {
      expect(shape.acts.length).toBeGreaterThanOrEqual(3)
      for (const act of shape.acts) {
        expect(act.intent.en).not.toBe('')
        expect(act.intent.ru).not.toBe('')
        expect(act.title.ru).not.toBe(act.title.en)
      }
      // A spine with no external proof is a spine you can never be wrong about.
      expect(shape.acts.some(a => a.proof !== null)).toBe(true)
      // Exactly one act carries the bottleneck — see spine.ts on pressure.
      expect(shape.acts.filter(a => a.pressure === 'critical')).toHaveLength(1)
    }
  })

  it('keeps act keys unique inside a shape', () => {
    for (const shape of SHAPES) {
      const keys = shape.acts.map(a => a.key)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })
})

describe('matching a dream to a shape', () => {
  it('reads the obvious ones', () => {
    expect(matchShape(dream('Get on camera', 'acting classes'))?.id).toBe('practise')
    expect(matchShape(dream('Run a marathon'))?.id).toBe('body')
    expect(matchShape(dream('Finish my book'))?.id).toBe('ship')
    expect(matchShape(dream('Pass IELTS'))?.id).toBe('date')
    expect(matchShape(dream('Grow the newsletter'))?.id).toBe('audience')
    expect(matchShape(dream('Quit smoking'))?.id).toBe('quit')
  })

  it('lets a deciding word beat a suggesting one', () => {
    // The subject is a language, but the SHAPE is a deadline — and the shape is
    // what this library is for.
    expect(matchShape(dream('Language exam in June'))?.id).toBe('date')
    // Same the other way: a book is a subject, "publish" is the structure.
    expect(matchShape(dream('Publish the guitar book'))?.id).toBe('ship')
  })

  it('says nothing rather than forcing the nearest skeleton', () => {
    expect(matchShape(dream('Be less of a coward'))).toBeNull()
  })
})

describe('a shape as a read', () => {
  it('passes through the same normaliser the model output does', () => {
    const shape = shapeById('ship')!
    const read = normalizeRead(shapeToRead(shape, dream('Finish my book')), { title: 'Finish my book' })

    expect(read.acts).toHaveLength(shape.acts.length)
    expect(read.acts[0].title).not.toBe('')
    expect(read.verdict).toContain('ship')
    // Exactly one critical survives normalising, which is the rule spine.ts keeps.
    expect(read.acts.filter(a => a.pressure === 'critical')).toHaveLength(1)
  })

  it('leaves the shelf empty on purpose — routines are specific, shapes are not', () => {
    const shape = shapeById('body')!
    const read = normalizeRead(shapeToRead(shape, dream('Get strong')), { title: 'Get strong' })
    expect(read.shelf).toHaveLength(0)
  })

  it('keeps the proofs, because they are what makes an act finishable', () => {
    const shape = shapeById('date')!
    const read = normalizeRead(shapeToRead(shape, dream('Sit the exam')), { title: 'Sit the exam' })
    expect(read.acts[0].boss).toBeTruthy()
  })
})

describe('a shape as prompt text', () => {
  it('names the skeleton and forbids keeping it generic', () => {
    const brief = shapeBrief(shapeById('practise')!)
    expect(brief).toContain('SHAPE OF THIS DREAM')
    expect(brief).toContain('never generic')
    expect(brief).toContain('proof:')
    // Every act reaches the prompt, or the model is adapting half a skeleton.
    for (const act of shapeById('practise')!.acts) expect(brief).toContain(act.title.en)
  })
})
