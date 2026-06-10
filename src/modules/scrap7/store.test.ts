import { describe, it, expect } from 'vitest'
import { createTask, type NewTaskData } from './store'
import type { Scrap7State } from './types'

const empty: Scrap7State = { tasks: [], categories: [], chatHistory: [], lastDailyReset: '2026-06-10' }
const mk = (over: Partial<NewTaskData> = {}): NewTaskData =>
  ({ text: 'Test', category: 'Health', taskType: 'habit', ...over })

// These tests pin the Task shape produced by the shared buildTask() —
// the same builder used by createExternalTask for cross-module sync.
describe('createTask (shared task shape)', () => {
  it('habit gets the full tracking field set with defaults', () => {
    const t = createTask(empty, mk({ taskType: 'habit' })).tasks[0]
    expect(t).toMatchObject({
      taskType: 'habit', completed: false,
      direction: 'positive', streak: 0, score: 0, todayCount: 0,
      lastTrackedDate: null, trackingHistory: [], skippedDates: [],
      target: 1, unit: 'times',
    })
    expect(t.id).toBeTruthy()
    expect(t.createdAt).toBeTruthy()
  })

  it('daily gets schedule + completion history', () => {
    const t = createTask(empty, mk({ taskType: 'daily' })).tasks[0]
    expect(t).toMatchObject({
      taskType: 'daily', streak: 0, completionHistory: [],
      schedule: { type: 'everyday' },
    })
    expect(t.target).toBeUndefined()   // no habit fields bleed in
  })

  it('daily honors a weekly schedule', () => {
    const t = createTask(empty, mk({ taskType: 'daily', schedule: { type: 'weekly', days: ['mon', 'fri'] } })).tasks[0]
    expect(t.schedule).toEqual({ type: 'weekly', days: ['mon', 'fri'] })
  })

  it('todo gets priority + dueDate and nothing else', () => {
    const t = createTask(empty, mk({ taskType: 'todo' })).tasks[0]
    expect(t).toMatchObject({ taskType: 'todo', priority: 'medium', dueDate: null })
    expect(t.schedule).toBeUndefined()
    expect(t.score).toBeUndefined()
  })

  it('prepends new tasks', () => {
    const s1 = createTask(empty, mk({ text: 'First' }))
    const s2 = createTask(s1, mk({ text: 'Second' }))
    expect(s2.tasks.map(t => t.text)).toEqual(['Second', 'First'])
  })
})
