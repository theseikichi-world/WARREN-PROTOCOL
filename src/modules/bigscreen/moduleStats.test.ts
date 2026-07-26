import { describe, it, expect } from 'vitest'
import { deriveScrap7, deriveLog, derivePictures, deriveJournal, dueToday } from './moduleStats'
import type { Task } from '../scrap7/types'
import type { LogState } from '../log/types'
import type { MediaItem } from '../pictures/types'
import type { JournalState } from '../journal/store'

const TODAY = '2026-07-26'

const task = (p: Partial<Task>): Task => ({
  id: p.id ?? 't', text: p.text ?? 'Task', category: 'General',
  taskType: p.taskType ?? 'todo', completed: p.completed ?? false,
  createdAt: '2026-01-01T00:00:00.000Z', ...p,
}) as Task

describe('dueToday', () => {
  it('treats a missing schedule as every day', () => {
    expect(dueToday(undefined, 'mon')).toBe(true)
  })
  it('honours weekly day lists', () => {
    expect(dueToday({ type: 'weekly', days: ['mon', 'wed'] }, 'mon')).toBe(true)
    expect(dueToday({ type: 'weekly', days: ['mon', 'wed'] }, 'tue')).toBe(false)
  })
})

describe('deriveScrap7', () => {
  it('counts open work and surfaces the first item as "next"', () => {
    const s = deriveScrap7([
      task({ id: 'a', text: 'Write pages', taskType: 'todo' }),
      task({ id: 'b', text: 'Done thing', taskType: 'todo', completed: true }),
      task({ id: 'c', text: 'Drink water', taskType: 'habit', direction: 'positive', target: 1 }),
    ], TODAY, 'sun')
    expect(s.due).toBe(2)
    expect(s.next).toBe('Write pages')
    expect(s.weekDots).toHaveLength(7)
  })

  it('excludes a habit already hit today and a not-due daily', () => {
    const s = deriveScrap7([
      task({ id: 'a', taskType: 'habit', direction: 'positive', target: 2, todayCount: 2, lastTrackedDate: TODAY }),
      task({ id: 'b', taskType: 'daily', schedule: { type: 'weekly', days: ['mon'] } }),
    ], TODAY, 'sun')
    expect(s.due).toBe(0)
    expect(s.next).toBeNull()
  })
})

describe('deriveLog', () => {
  const state = (dreams: LogState['dreams']): LogState => ({ dreams } as LogState)

  it('summarises the top dream and finds the next open task', () => {
    const s = deriveLog(state([{
      id: 'd', title: 'Ship Warren', description: '', category: 'work', createdAt: '',
      missions: [
        { id: 'm1', title: 'Done mission', description: '', priority: 'high', status: 'completed',
          tasks: [], signals: [], createdAt: '', completedAt: null },
        { id: 'm2', title: 'Open mission', description: '', priority: 'high', status: 'active',
          tasks: [{ id: 'x', text: 'Write the docs', type: 'todo', done: false, createdAt: '' }],
          signals: [], createdAt: '', completedAt: null },
      ],
    }] as LogState['dreams']))
    expect(s.dream).toBe('Ship Warren')
    expect(s.done).toBe(1)
    expect(s.total).toBe(2)
    expect(s.next).toBe('Write the docs')
    expect(s.active).toBe(1)
  })

  it('handles an empty log', () => {
    const s = deriveLog(state([]))
    expect(s).toEqual({ dream: null, done: 0, total: 0, next: null, active: 0 })
  })
})

describe('derivePictures', () => {
  const show = (p: Partial<MediaItem>): MediaItem => ({
    id: 'x', title: 'Show', type: 'tv', status: 'watching',
    progress: { season: 1, episode: 0 }, ...p,
  }) as MediaItem

  it('prefers a show with episodes ready to watch', () => {
    const s = derivePictures([
      show({ id: 'a', title: 'Ready Show', episodes_released: 5, progress: { season: 1, episode: 3 } }),
    ])
    expect(s.title).toBe('Ready Show')
    expect(s.detail).toBe('2 ep ready')
    expect(s.catchUp).toBe(2)
    expect(s.days).toBe(0)
  })

  it('falls back to the soonest upcoming episode when nothing is ready', () => {
    const soon = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
    const s = derivePictures([
      show({ id: 'b', title: 'Waiting Show', episodes_released: 2,
        progress: { season: 1, episode: 2 }, next_episode_date: soon }),
    ])
    expect(s.title).toBe('Waiting Show')
    expect(s.catchUp).toBe(0)
    expect(s.days).toBeGreaterThanOrEqual(2)
  })

  it('survives an empty library', () => {
    expect(derivePictures([]).title).toBeNull()
  })
})

describe('deriveJournal', () => {
  it('knows whether today has a page', () => {
    const state = { entries: [{ id: '1', date: TODAY, createdAt: '', raw: 'hi', view: 'raw' }] } as JournalState
    const s = deriveJournal(state, TODAY)
    expect(s.writtenToday).toBe(true)
    expect(s.entries).toBe(1)
  })
  it('reports a blank page for a fresh day', () => {
    expect(deriveJournal({ entries: [] } as JournalState, TODAY).writtenToday).toBe(false)
  })
})
