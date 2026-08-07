import { describe, it, expect } from 'vitest'
import { decideSync, EMPTY_FINGERPRINT, seal, open, roomId, fingerprint,
  type SyncMark, type RemoteMeta } from './sync'

const mark = (updatedAt: string | null, fingerprint: string | null): SyncMark => ({ updatedAt, fingerprint })
const remote = (updatedAt: string, device = 'DESKTOP'): RemoteMeta => ({ updatedAt, device })

const T1 = '2026-08-08T10:00:00.000Z'
const T2 = '2026-08-08T12:00:00.000Z'

describe('the sync decision', () => {
  it('does nothing when neither side moved', () => {
    expect(decideSync(mark(T1, 'abc'), 'abc', remote(T1))).toBe('in-sync')
  })

  it('pushes when only this device changed', () => {
    expect(decideSync(mark(T1, 'abc'), 'def', remote(T1))).toBe('push')
  })

  it('pulls when only the other device changed', () => {
    expect(decideSync(mark(T1, 'abc'), 'abc', remote(T2))).toBe('pull')
  })

  it('REFUSES to guess when both moved', () => {
    // The whole point. Silently picking a winner here is how a forty-day streak
    // disappears without anyone noticing for a week.
    expect(decideSync(mark(T1, 'abc'), 'def', remote(T2))).toBe('conflict')
  })
})

describe('first contact with a room', () => {
  it('pushes into an empty room', () => {
    expect(decideSync(mark(null, null), 'abc', null)).toBe('push')
  })

  it('does not push an empty device into an empty room', () => {
    expect(decideSync(mark(null, null), EMPTY_FINGERPRINT, null)).toBe('in-sync')
  })

  it('treats a never-synced device meeting an occupied room as a conflict', () => {
    // A fresh install pointed at an existing room has no idea whether its local
    // data is newer. Asking is the only honest answer.
    expect(decideSync(mark(null, null), 'abc', remote(T1))).toBe('conflict')
  })

  it('still pushes over an empty room even if we synced before', () => {
    // The room was cleared server-side; local is the only copy left.
    expect(decideSync(mark(T1, 'abc'), 'abc', null)).toBe('push')
  })
})

describe('the envelope', () => {
  // Encryption you cannot reverse is data loss with extra steps, so the round
  // trip is tested rather than assumed.
  const PLAIN = JSON.stringify({ app: 'warren', data: { streak: 41, note: 'Привет — ✓' } })

  it('comes back out exactly as it went in', async () => {
    expect(await open(await seal(PLAIN, 'correct horse'), 'correct horse')).toBe(PLAIN)
  })

  it('refuses the wrong passphrase instead of returning garbage', async () => {
    const sealed = await seal(PLAIN, 'correct horse')
    await expect(open(sealed, 'battery staple')).rejects.toThrow(/passphrase/i)
  })

  it('never produces the same ciphertext twice', async () => {
    // Fresh salt and IV every time — identical blobs must not look identical.
    const a = await seal(PLAIN, 'same')
    const b = await seal(PLAIN, 'same')
    expect(a.data).not.toBe(b.data)
    expect(a.iv).not.toBe(b.iv)
    expect(a.salt).not.toBe(b.salt)
  })

  it('rejects a version it does not understand', async () => {
    const sealed = { ...(await seal(PLAIN, 'x')), v: 2 as 1 }
    await expect(open(sealed, 'x')).rejects.toThrow(/newer version/i)
  })
})

describe('the room', () => {
  it('is the same for the same passphrase and different for another', async () => {
    expect(await roomId('shared')).toBe(await roomId('shared'))
    expect(await roomId('shared')).not.toBe(await roomId('shared '))
  })

  it('looks like the hash the endpoint demands', async () => {
    // api/sync.ts rejects anything that isn't 64 hex characters.
    expect(await roomId('anything at all')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('does not contain the passphrase', async () => {
    expect(await roomId('hunter2')).not.toContain('hunter2')
  })
})

describe('the fingerprint', () => {
  it('moves when the data moves and holds still when it does not', async () => {
    expect(await fingerprint('{"a":1}')).toBe(await fingerprint('{"a":1}'))
    expect(await fingerprint('{"a":1}')).not.toBe(await fingerprint('{"a":2}'))
  })
})

describe('the marks that make it work', () => {
  it('treats a missing local fingerprint as "we changed"', () => {
    expect(decideSync(mark(T1, null), 'abc', remote(T1))).toBe('push')
  })

  it('treats a missing remote mark as "they changed"', () => {
    expect(decideSync(mark(null, 'abc'), 'abc', remote(T1))).toBe('pull')
  })

  it('never returns push when the remote moved and we did too', () => {
    for (const fp of ['a', 'b', 'c', EMPTY_FINGERPRINT]) {
      const action = decideSync(mark(T1, 'base'), fp, remote(T2))
      expect(action).not.toBe('push')
    }
  })
})
