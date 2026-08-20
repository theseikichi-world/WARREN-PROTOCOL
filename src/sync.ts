// ─── SYNC — one blob, two devices, nothing silently lost ──────────────────────
// Warren's data is not documents. It is a score that accrues over months, and a
// careless merge destroys a forty-day streak in a way you would not notice for a
// week. So this layer is deliberately conservative:
//
//   · localStorage stays the working copy. Nothing here changes how a store
//     reads or writes — sync pushes and pulls the WHOLE state, reusing the
//     export/import that `backup.ts` already does.
//   · Three-way decision, never last-write-wins. We remember what we last
//     synced; if both sides moved we stop and ask rather than guess.
//   · A snapshot is written locally before any pull overwrites you.
//   · The server sees ciphertext. Your journal is personal writing, so the blob
//     is encrypted with a key derived from a passphrase that never leaves the
//     device — and the room id is a hash of that passphrase, so the server
//     cannot even name you.
//
// The API key is NOT synced (`backup.ts` strips it). Enter it once per device.

import { exportAll, importBackup, type BackupFile } from './backup'

// ─── The decision ─────────────────────────────────────────────────────────────

export type SyncAction = 'in-sync' | 'push' | 'pull' | 'conflict'

export interface SyncMark {
  /** `updatedAt` of the remote record at our last successful sync. */
  updatedAt: string | null
  /** Fingerprint of our local blob at that same moment. */
  fingerprint: string | null
}

export interface RemoteMeta {
  updatedAt: string
  device:    string
}

/**
 * What to do, given what changed on each side since we last agreed.
 *
 * The whole safety of this feature is these four lines. Both-changed is the only
 * interesting case and it must never resolve itself — the user decides, because
 * only they know which device did the real work.
 */
export function decideSync(
  mark: SyncMark,
  localFingerprint: string,
  remote: RemoteMeta | null,
): SyncAction {
  if (!remote) return localFingerprint === EMPTY_FINGERPRINT ? 'in-sync' : 'push'

  const localChanged  = mark.fingerprint === null || localFingerprint !== mark.fingerprint
  const remoteChanged = mark.updatedAt === null || remote.updatedAt !== mark.updatedAt

  if (!localChanged && !remoteChanged) return 'in-sync'
  if (localChanged && !remoteChanged)  return 'push'
  if (!localChanged && remoteChanged)  return 'pull'
  return 'conflict'
}

/** A blob of nothing — used so a first run on an empty device doesn't push over you. */
export const EMPTY_FINGERPRINT = 'empty'

// ─── Crypto ───────────────────────────────────────────────────────────────────
// AES-GCM with a PBKDF2-derived key. The passphrase is stored locally, which
// adds no risk the device didn't already carry: your plaintext data is sitting
// in localStorage beside it. What it buys is that the SERVER never holds
// anything readable.

const enc = new TextEncoder()
const dec = new TextDecoder()

const b64 = (b: ArrayBuffer): string => btoa(String.fromCharCode(...new Uint8Array(b)))
const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), c => c.charCodeAt(0))

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(text))
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Which bucket on the server this device talks to. Derived from the passphrase,
 * so two devices sharing one meet, and the server learns nothing.
 *
 * STRETCHED, and that matters more than it looks. v1 was a single SHA-256, so
 * an attacker could hash a dictionary of common passphrases at millions a
 * second and probe the endpoint to see which rooms exist. Finding one never
 * decrypted it — PBKDF2 still stood in the way — but it confirmed a real target
 * worth grinding, and the blob now carries API keys rather than only a journal.
 * At 200k iterations that sweep costs the same as attacking the data itself.
 *
 * The salt is fixed rather than random because both devices must land on the
 * same room from the passphrase alone. That is what a salt is normally for, so
 * it is worth being explicit: this one exists to separate Warren's key space
 * from anyone else's, not to make two identical passphrases differ.
 *
 * Bumping to v2 MOVES every room. Nothing is lost — the blob is a copy and the
 * device still holds the original — but both devices re-enter the passphrase
 * once and the first push re-seeds the new room.
 */
export async function roomId(passphrase: string): Promise<string> {
  const base = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode('warren-sync-v2'), iterations: 200_000, hash: 'SHA-256' },
    base, 256)
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Fingerprint of the current local state — changes iff the data changed. */
export const fingerprint = (blob: string): Promise<string> => sha256Hex(blob)

async function keyFor(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 200_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export interface Sealed { v: 1; salt: string; iv: string; data: string }

export async function seal(plaintext: string, passphrase: string): Promise<Sealed> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv   = crypto.getRandomValues(new Uint8Array(12))
  const key  = await keyFor(passphrase, salt)
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, enc.encode(plaintext))
  return { v: 1, salt: b64(salt.buffer), iv: b64(iv.buffer), data: b64(data) }
}

export async function open(sealed: Sealed, passphrase: string): Promise<string> {
  if (sealed.v !== 1) throw new Error('This blob was written by a newer version of Warren.')
  const key = await keyFor(passphrase, unb64(sealed.salt))
  try {
    const out = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(sealed.iv) as BufferSource }, key, unb64(sealed.data) as BufferSource)
    return dec.decode(out)
  } catch {
    throw new Error('Wrong passphrase for this sync room.')
  }
}

// ─── Local marks ──────────────────────────────────────────────────────────────

const MARK_KEY     = 'warren_sync_mark_v1'
const SNAPSHOT_KEY = 'warren_sync_snapshot_v1'

export function loadMark(): SyncMark {
  try {
    const raw = localStorage.getItem(MARK_KEY)
    const p = raw ? JSON.parse(raw) : null
    return {
      updatedAt:   typeof p?.updatedAt === 'string' ? p.updatedAt : null,
      fingerprint: typeof p?.fingerprint === 'string' ? p.fingerprint : null,
    }
  } catch { return { updatedAt: null, fingerprint: null } }
}

export const saveMark = (m: SyncMark): void => {
  try { localStorage.setItem(MARK_KEY, JSON.stringify(m)) } catch { /* quota */ }
}

/** Everything as it stands, before a pull overwrites it. There is always a way back. */
export function snapshotLocal(): void {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify({
      // Keys included: this is the way back from a pull, and a restore that
      // silently dropped your API key would not be a way back.
      at: new Date().toISOString(), data: exportAll({ secrets: true }),
    }))
  } catch { /* quota */ }
}

export function lastSnapshot(): { at: string; data: BackupFile } | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function restoreSnapshot(): number {
  const snap = lastSnapshot()
  if (!snap) throw new Error('No snapshot to restore.')
  return importBackup(JSON.stringify(snap.data))
}

// ─── Talking to the endpoint ──────────────────────────────────────────────────

export interface SyncSettings {
  url:        string   // e.g. https://warren-black.vercel.app
  passphrase: string
  /** Vercel "Protection Bypass for Automation" — the desktop app has no SSO cookie. */
  bypass:     string
}

export interface RemoteRecord extends RemoteMeta { sealed: Sealed }

const endpoint = (s: SyncSettings, room: string) =>
  `${s.url.replace(/\/+$/, '')}/api/sync?room=${encodeURIComponent(room)}`

const headers = (s: SyncSettings): Record<string, string> => ({
  'content-type': 'application/json',
  ...(s.bypass ? { 'x-vercel-protection-bypass': s.bypass } : {}),
})

export async function fetchRemote(s: SyncSettings): Promise<RemoteRecord | null> {
  const room = await roomId(s.passphrase)
  const res  = await fetch(endpoint(s, room), { headers: headers(s) })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(await describe(res))
  const json = await res.json()
  return json && json.sealed ? json as RemoteRecord : null
}

export async function pushRemote(s: SyncSettings, device: string, baseUpdatedAt: string | null): Promise<RemoteMeta> {
  const room   = await roomId(s.passphrase)
  const sealed = await seal(JSON.stringify(exportAll({ secrets: true })), s.passphrase)
  const res = await fetch(endpoint(s, room), {
    method: 'PUT',
    headers: headers(s),
    body: JSON.stringify({ sealed, device, baseUpdatedAt }),
  })
  if (res.status === 409) throw new Error('The other device pushed while you were syncing — pull first.')
  if (!res.ok) throw new Error(await describe(res))
  return await res.json() as RemoteMeta
}

/** Apply a remote record over local state. Snapshots first — always. */
export async function applyRemote(s: SyncSettings, record: RemoteRecord): Promise<number> {
  const plaintext = await open(record.sealed, s.passphrase)
  snapshotLocal()
  return importBackup(plaintext)
}

// ─── One round ────────────────────────────────────────────────────────────────

export interface SyncOutcome {
  action: SyncAction
  /** How many keys a pull brought down. */
  pulled?: number
  /** Present only on 'conflict' — the record the other device left. */
  remote?: RemoteRecord
}

/**
 * Decide and act, once. Both the SYNC NOW button and the automatic runs go
 * through here so the two can never drift apart — a manual sync that was safer
 * than the automatic one would be a trap.
 *
 * A conflict is returned, never resolved. The caller asks.
 */
export async function syncOnce(s: SyncSettings, device: string): Promise<SyncOutcome> {
  const remote = await fetchRemote(s)
  const action = decideSync(loadMark(), await localFingerprint(), remote)

  if (action === 'push') {
    const meta = await pushRemote(s, device, remote?.updatedAt ?? null)
    saveMark({ updatedAt: meta.updatedAt, fingerprint: await localFingerprint() })
    return { action }
  }
  if (action === 'pull' && remote) {
    const pulled = await applyRemote(s, remote)
    // After the import, not before — the fingerprint has to describe what we now hold.
    saveMark({ updatedAt: remote.updatedAt, fingerprint: await localFingerprint() })
    return { action, pulled, remote }
  }
  if (action === 'conflict' && remote) return { action, remote }
  return { action: 'in-sync' }
}

/**
 * Must be taken over the SAME payload that gets pushed, secrets and all.
 * Fingerprinting a stripped copy would leave a changed API key looking like no
 * change at all, and the new key would sit unsynced until something else moved.
 */
export const localFingerprint = (): Promise<string> =>
  fingerprint(JSON.stringify(exportAll({ secrets: true })))

// ─── The automatic runs ───────────────────────────────────────────────────────

export interface SyncStatus {
  at:      string
  action:  SyncAction | 'error'
  message: string
}

const STATUS_KEY = 'warren_sync_status_v1'

export function lastStatus(): SyncStatus | null {
  try {
    const raw = localStorage.getItem(STATUS_KEY)
    return raw ? JSON.parse(raw) as SyncStatus : null
  } catch { return null }
}

const setStatus = (action: SyncStatus['action'], message: string): void => {
  try {
    localStorage.setItem(STATUS_KEY, JSON.stringify({ at: new Date().toISOString(), action, message }))
  } catch { /* quota */ }
}

/**
 * Sync in the background: on launch, and when the window goes away.
 *
 * Two rules make this safe to run unattended. It never resolves a conflict — it
 * records one and leaves it for Settings. And a pull reloads the page, because
 * the running app holds module state in memory that would otherwise overwrite
 * everything we just brought down on the next keystroke.
 */
export async function autoSync(s: SyncSettings & { enabled: boolean }): Promise<void> {
  if (!s.enabled || !s.url || !s.passphrase) return
  try {
    const out = await syncOnce(s, deviceLabel())
    setStatus(out.action, out.action === 'conflict'
      ? `Both devices changed since the last sync — open Settings to choose.`
      : out.action === 'pull' ? `Pulled ${out.pulled} records from ${out.remote?.device ?? 'the other device'}.`
      : out.action === 'push' ? 'Pushed this device.' : 'In sync.')
    if (out.action === 'pull') window.location.reload()
  } catch (e) {
    setStatus('error', e instanceof Error ? e.message : String(e))
  }
}

export const deviceLabel = (): string =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window ? 'DESKTOP' : 'WEB'

/**
 * A 302 to Vercel's SSO is the single most likely failure here, and the raw
 * status is useless on its own — deployment protection is on by default.
 */
async function describe(res: Response): Promise<string> {
  if (res.status === 401 || res.status === 403 || res.redirected) {
    return 'Blocked by Vercel deployment protection. Add a Protection Bypass token in Settings.'
  }
  const text = await res.text().catch(() => '')
  return `Sync failed (${res.status}). ${text.slice(0, 120)}`
}
