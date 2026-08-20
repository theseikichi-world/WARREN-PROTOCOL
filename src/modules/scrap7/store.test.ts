import { describe, it, expect } from 'vitest'
import { createTask, trackHabit, duplicateTask, pickableCategories, orbitTasks, taskSource, habitDoneToday, type NewTaskData } from './store'
import { parseCommand } from './commandParser'
import { isOrphanHabit, todayKey, dateKey, parseDateKey, shiftDateKey, daysBetweenKeys, dayKeyAt, sleepCutoffMin } from './types'
import type { Scrap7State, Task } from './types'

const empty: Scrap7State = { tasks: [], categories: [], chatHistory: [], lastDailyReset: '2026-06-10' }
const mk = (over: Partial<NewTaskData> = {}): NewTaskData =>
  ({ text: 'Test', category: 'Health', taskType: 'habit', ...over })

describe('duplicateTask (creation guard)', () => {
  const withTexts = (...texts: string[]): Task[] =>
    texts.map((text, i) => ({ ...createTask(empty, mk({ text })).tasks[0], id: `t${i}` }))

  it('does not match on a shared word stem or a stopword', () => {
    // The bug: "workouts" contains "work", "diction" contains "on", so the old
    // loose matcher scored this 0.67 and silently dropped the new task.
    const tasks = withTexts('Diction/Breath/Tonguetwister Workouts', 'Stretch')
    expect(duplicateTask(tasks, 'Work on Warren')).toBeNull()
  })

  it('matches the same task written differently', () => {
    const tasks = withTexts('Drink water')
    expect(duplicateTask(tasks, 'drink water!')?.text).toBe('Drink water')
    expect(duplicateTask(tasks, 'Drink the water')?.text).toBe('Drink water')
  })

  it('folds plurals and verb endings so one thing is not added twice', () => {
    expect(duplicateTask(withTexts('Morning workout'), 'Morning workouts')?.text).toBe('Morning workout')
    expect(duplicateTask(withTexts('Stretch'), 'Stretching')?.text).toBe('Stretch')
    expect(duplicateTask(withTexts('Stretching'), 'Stretch')?.text).toBe('Stretching')
  })

  it('keeps genuinely different tasks apart', () => {
    const tasks = withTexts('Batch-film short clips')
    expect(duplicateTask(tasks, 'Edit short clips')).toBeNull()
    expect(duplicateTask(tasks, 'Stretch')).toBeNull()
  })

  it('is null on an empty or punctuation-only title', () => {
    expect(duplicateTask(withTexts('Stretch'), '   ')).toBeNull()
    expect(duplicateTask(withTexts('Stretch'), '!!!')).toBeNull()
  })
})

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

describe('the category picker', () => {
  const st = (tasks: Partial<Task>[], categories: string[]): Scrap7State => ({
    tasks: tasks as Task[], categories, chatHistory: [], lastDailyReset: '2026-08-03',
  })

  it('hides categories another system owns', () => {
    const s = st([], ['Health', 'Life support', 'Goals', 'Work'])
    expect(pickableCategories(s)).toEqual(['Health', 'Work'])
  })

  it('hides a goal title that arrived as a habit category', () => {
    // Installing a routine stamps the uplink's name on its habit
    const s = st(
      [{ taskType: 'habit', category: 'BECOME A SUPERMAN' } as Partial<Task>],
      ['Health', 'BECOME A SUPERMAN'],
    )
    expect(pickableCategories(s)).toEqual(['Health'])
  })

  it('keeps a category a to-do actually uses, even if a habit shares it', () => {
    const s = st([{ taskType: 'todo', category: 'Fitness' } as Partial<Task>], ['Fitness'])
    expect(pickableCategories(s)).toContain('Fitness')
  })

  it('never returns an empty list — the modal needs something to select', () => {
    expect(pickableCategories(st([], ['Life support']))).toEqual(['Personal'])
    expect(pickableCategories(st([], []))).toEqual(['Personal'])
  })
})

describe('the day is the operator\'s, not the server\'s', () => {
  it('reads a moment as its LOCAL calendar date', () => {
    // The bug this pins: toISOString() gives the UTC date, so east of UTC a
    // habit tracked after midnight was stamped with yesterday — the timeline
    // showed it as still due and a late night could read as a miss.
    const lateNight = new Date(2026, 7, 9, 1, 30)     // 09 Aug, 01:30 local
    expect(dateKey(lateNight)).toBe('2026-08-09')
  })

  it('round-trips a key through parse and back', () => {
    expect(dateKey(parseDateKey('2026-08-09'))).toBe('2026-08-09')
  })

  it('shifts by whole local days across a month boundary', () => {
    expect(shiftDateKey('2026-08-31', 1)).toBe('2026-09-01')
    expect(shiftDateKey('2026-09-01', -1)).toBe('2026-08-31')
    expect(shiftDateKey('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('counts whole days between two keys, signed', () => {
    expect(daysBetweenKeys('2026-08-01', '2026-08-04')).toBe(3)
    expect(daysBetweenKeys('2026-08-04', '2026-08-01')).toBe(-3)
    expect(daysBetweenKeys('2026-08-04', '2026-08-04')).toBe(0)
  })

  it('agrees with todayKey when there is no late bedtime to shift it', () => {
    expect(todayKey()).toBe(dayKeyAt(new Date(), 0))
  })
})

describe('the day ends at bedtime, not at midnight', () => {
  const at = (h: number, m = 0) => new Date(2026, 7, 9, h, m)   // 09 Aug 2026

  it('keeps the small hours on the day that started yesterday', () => {
    // Bedtime 02:00. Work done at 01:00 belongs to the day you woke into,
    // not to the calendar date that just ticked over.
    const cutoff = sleepCutoffMin('02:00')
    expect(dayKeyAt(at(1, 0),  cutoff)).toBe('2026-08-08')
    expect(dayKeyAt(at(1, 59), cutoff)).toBe('2026-08-08')
  })

  it('rolls the moment bedtime passes, and does not roll back', () => {
    const cutoff = sleepCutoffMin('02:00')
    expect(dayKeyAt(at(2, 0),  cutoff)).toBe('2026-08-09')
    expect(dayKeyAt(at(9, 0),  cutoff)).toBe('2026-08-09')
    expect(dayKeyAt(at(23, 0), cutoff)).toBe('2026-08-09')
  })

  it('leaves an early sleeper on midnight', () => {
    // Rolling at 23:00 would close the day while they were still awake in it.
    const cutoff = sleepCutoffMin('23:00')
    expect(cutoff).toBe(0)
    expect(dayKeyAt(at(23, 30), cutoff)).toBe('2026-08-09')
    expect(dayKeyAt(at(0, 30),  cutoff)).toBe('2026-08-09')
  })

  it('ignores a missing or malformed bedtime', () => {
    expect(sleepCutoffMin(undefined)).toBe(0)
    expect(sleepCutoffMin('')).toBe(0)
    expect(sleepCutoffMin('nonsense')).toBe(0)
    expect(sleepCutoffMin('00:00')).toBe(0)      // midnight is already the default
  })

  it('carries the shift across a month boundary', () => {
    const cutoff = sleepCutoffMin('03:00')
    expect(dayKeyAt(new Date(2026, 8, 1, 2, 0), cutoff)).toBe('2026-08-31')
  })
})

describe('ORBIT shows the whole day', () => {
  const t = (over: Partial<Task>): Task => ({
    id: over.id ?? 'x', text: over.text ?? 'Task', category: 'c',
    taskType: 'todo', completed: false, createdAt: '', ...over,
  } as Task)

  const routine = (id: string, over: Partial<Task> = {}) =>
    t({ id, text: id, taskType: 'habit', origin: 'chain', direction: 'positive', target: 1, ...over })
  const basic = (id: string, over: Partial<Task> = {}) =>
    t({ id, text: id, taskType: 'habit', origin: 'baseline', direction: 'positive', target: 1, ...over })

  it('lists routines and basics beside todos and dailies', () => {
    // Routines used to be excluded entirely, which made the day feel like two
    // apps and left "did I finish today" unanswerable.
    const ids = orbitTasks([
      t({ id: 'todo' }),
      t({ id: 'daily', taskType: 'daily' }),
      routine('routine'),
      basic('basic'),
    ]).map(x => x.id)
    expect(ids.sort()).toEqual(['basic', 'daily', 'routine', 'todo'])
  })

  it('leads with the scored work, then basics, then your own', () => {
    const ids = orbitTasks([
      t({ id: 'mine', taskType: 'daily', origin: 'manual' }),
      basic('basic'),
      routine('routine'),
    ]).map(x => x.id)
    expect(ids).toEqual(['routine', 'basic', 'mine'])
  })

  it('names the source of every row', () => {
    expect(taskSource(routine('r'))).toBe('uplink')
    expect(taskSource(basic('b'))).toBe('basic')
    expect(taskSource(t({ origin: 'manual' }))).toBe('yours')
    expect(taskSource(t({ origin: 'log' }))).toBe('yours')   // unscored either way
  })

  it('sinks anything already done, whichever way it is measured', () => {
    const ids = orbitTasks([
      t({ id: 'doneTodo', completed: true }),
      routine('openRoutine'),
    ]).map(x => x.id)
    expect(ids).toEqual(['openRoutine', 'doneTodo'])
  })

  it('reads a habit as done from its dose, not from a checkbox', () => {
    const today = todayKey()
    expect(habitDoneToday(routine('r', { lastTrackedDate: today, todayCount: 1, target: 1 }))).toBe(true)
    expect(habitDoneToday(routine('r', { lastTrackedDate: today, todayCount: 1, target: 3 }))).toBe(false)
    expect(habitDoneToday(routine('r', { lastTrackedDate: '2020-01-01', todayCount: 9 }))).toBe(false)
  })

  it('keeps a negative habit out — the list is what to DO', () => {
    expect(orbitTasks([routine('bad', { direction: 'negative' })])).toEqual([])
  })

  it('honours a habit\'s weekly schedule', () => {
    const day = ['sun','mon','tue','wed','thu','fri','sat'][new Date().getDay()]
    const other = day === 'mon' ? 'tue' : 'mon'
    expect(orbitTasks([routine('on',  { schedule: { type: 'weekly', days: [day] } })])).toHaveLength(1)
    expect(orbitTasks([routine('off', { schedule: { type: 'weekly', days: [other] } })])).toHaveLength(0)
  })
})

describe('isOrphanHabit', () => {
  const habit = (over: Partial<Task> = {}): Task =>
    ({ taskType: 'habit', ...over } as Task)

  it('leaves a routine and a basic alone — they have homes', () => {
    expect(isOrphanHabit(habit({ origin: 'chain' }))).toBe(false)
    expect(isOrphanHabit(habit({ origin: 'baseline' }))).toBe(false)
  })

  it('adopts a hand-made habit', () => {
    expect(isOrphanHabit(habit({ origin: 'manual' }))).toBe(true)
    expect(isOrphanHabit(habit())).toBe(true)          // no origin resolves to manual
  })

  it('adopts a habit that came in through the L.O.G sync', () => {
    // The one this was missing: PATHFINDER's old analysis wrote habits with a
    // logDream, which resolves to 'log'. They were in no system and on no screen.
    expect(isOrphanHabit(habit({ logDream: 'Become an actor' }))).toBe(true)
    expect(isOrphanHabit(habit({ origin: 'log' }))).toBe(true)
  })

  it('never touches anything that is not a habit', () => {
    expect(isOrphanHabit({ taskType: 'todo',  origin: 'log' } as Task)).toBe(false)
    expect(isOrphanHabit({ taskType: 'daily', origin: 'log' } as Task)).toBe(false)
  })
})

describe('the fast parser knows what it cannot handle', () => {
  const tasks: Task[] = []

  it('hands a scheduled class with times to the AI instead of mangling it', () => {
    // It used to match `every <weekday> (.+)` and title the task with the whole
    // remaining sentence — clock times, commute and all — because the capture
    // group had no opinion about what it swallowed.
    expect(parseCommand(
      'every Wednesday I have Acting Class from 19:30 to 22:30, usually I walk there it takes 30 minutes to get',
      tasks,
    )).toBeNull()
  })

  it('declines anything carrying a clock time', () => {
    expect(parseCommand('add gym at 19:30', tasks)).toBeNull()
  })

  it('declines a sentence with a second clause', () => {
    expect(parseCommand('add reading, then journal', tasks)).toBeNull()
  })

  it('still answers instantly for the short things it is for', () => {
    // The whole point of tier 1 is that "add pushups" never waits on a network.
    const simple = parseCommand('add a daily pushups', tasks)
    expect(simple).not.toBeNull()
    expect(simple!.actions[0]).toMatchObject({ type: 'create_direct' })
  })

  it('still takes a plain weekday recurrence', () => {
    const weekly = parseCommand('every monday gym', tasks)
    expect(weekly).not.toBeNull()
    expect(weekly!.actions[0]).toMatchObject({ type: 'create_direct', recurrence: 'weekly' })
  })
})

describe('one tap means "I did it"', () => {
  const habit = (over: Partial<Task>): Scrap7State => ({
    ...empty,
    tasks: [{ ...createTask(empty, mk({ taskType: 'habit' })).tasks[0], id: 'h', ...over }],
  })
  const after = (s: Scrap7State) => trackHabit(s, 'h', 1).state.tasks[0]

  it('completes a measured session in one tap, not fifteen', () => {
    // "Move the body · 1/15 minutes". Tapping added a minute, and because score
    // only moves when the count REACHES the target, the first fourteen taps
    // changed nothing at all — which is indistinguishable from a dead button.
    const t = after(habit({ target: 15, unit: 'minutes' }))
    expect(t.todayCount).toBe(15)
    expect(t.score).toBeGreaterThan(0)
    expect(t.streak).toBe(1)
  })

  it('still steps one at a time for something you genuinely repeat', () => {
    const t = after(habit({ target: 2, unit: 'times' }))
    expect(t.todayCount).toBe(1)
    expect(t.score).toBe(0)          // not done yet — twice means twice
  })

  it('finishes the repeatable one on its last tap', () => {
    const t = after(habit({ target: 2, unit: 'times', todayCount: 1 }))
    expect(t.todayCount).toBe(2)
    expect(t.score).toBeGreaterThan(0)
  })

  it('treats an unknown unit as measured, the safer wrong answer', () => {
    // Generous beats unusable: completing in one tap is merely lenient, while
    // demanding thirty taps makes the habit impossible to tick.
    expect(after(habit({ target: 30, unit: 'laps' })).todayCount).toBe(30)
  })

  it('undo takes back exactly what the tap gave', () => {
    const done = trackHabit(habit({ target: 15, unit: 'minutes' }), 'h', 1).state
    expect(trackHabit(done, 'h', -1).state.tasks[0].todayCount).toBe(0)

    const once = trackHabit(habit({ target: 3, unit: 'times' }), 'h', 1).state
    expect(trackHabit(once, 'h', -1).state.tasks[0].todayCount).toBe(0)
  })

  it('lets you over-achieve a measured basic without breaking', () => {
    const done = trackHabit(habit({ target: 15, unit: 'minutes' }), 'h', 1).state
    expect(trackHabit(done, 'h', 1).state.tasks[0].todayCount).toBe(16)
  })
})
