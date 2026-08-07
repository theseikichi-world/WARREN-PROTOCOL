/**
 * Warren data backup — export/import every module's localStorage state.
 * All persistence lives in localStorage (WebView2 profile), which can be lost
 * to a Windows reset or uninstall. This gives the user a one-file lifeboat.
 */

export interface BackupFile {
  app:        'warren'
  version:    number
  exportedAt: string
  data:       Record<string, string>
}

/** Volatile caches — pointless to back up, refetched automatically. */
const SKIP = [/^pictures_discover_/, /^pictures_games_/]

/** Secret fields inside warren_settings — stripped from every export so a shared
 *  backup file can never leak the user's Anthropic / TMDB / RAWG keys. */
/**
 * Never leaves the device. The sync passphrase and bypass token are stripped
 * alongside the API keys — a blob that carried the key to its own room would
 * hand the whole account to anyone who opened one export.
 */
const SECRET_FIELDS = ['aiApiKey', 'tmdbApiKey', 'rawgApiKey', 'syncPassphrase', 'syncBypass'] as const
const SETTINGS_KEY = 'warren_settings'

function stripSecrets(settingsJson: string): string {
  try {
    const s = JSON.parse(settingsJson) as Record<string, unknown>
    for (const f of SECRET_FIELDS) delete s[f]
    return JSON.stringify(s)
  } catch {
    return settingsJson   // unparsable — exported as-is, validated on import anyway
  }
}

export function exportAll(): BackupFile {
  const data: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key) continue
    if (SKIP.some(re => re.test(key))) continue
    const val = localStorage.getItem(key)
    if (val === null) continue
    data[key] = key === SETTINGS_KEY ? stripSecrets(val) : val
  }
  return { app: 'warren', version: 1, exportedAt: new Date().toISOString(), data }
}

export function exportAllJson(): string {
  return JSON.stringify(exportAll(), null, 2)
}

/** Trigger a file download of the backup (WebView2 supports blob downloads). */
export function downloadBackup(): void {
  const blob = new Blob([exportAllJson()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `warren-backup-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

// ─── Start over ───────────────────────────────────────────────────────────────

/**
 * What survives a reset: the app's configuration, never anything about you.
 * The API key and the accent colour are machine setup — re-entering a key after
 * a reset is pure friction and tells you nothing about starting over.
 */
export const RESET_KEEP = [SETTINGS_KEY, 'warren_locale'] as const

/**
 * ...except the profile inside settings, which IS about you. Starting over has
 * to mean starting over: the name, the gender and the hours go, `onboardedAt`
 * goes with them, and FIRST CONTACT asks again on the next load.
 */
/**
 * `syncEnabled` is in here for a reason that isn't obvious: without it, RESET
 * EVERYTHING would wipe the device and then immediately pull the whole record
 * back down from the room on the next sync. Starting over has to mean the cloud
 * copy stops following you home.
 */
export const RESET_PROFILE_FIELDS = ['displayName', 'gender', 'wakeTime', 'sleepTime', 'onboardedAt', 'syncEnabled'] as const

/** Settings with every trace of the person stripped out. */
export function stripProfile(settingsJson: string): string {
  try {
    const s = JSON.parse(settingsJson) as Record<string, unknown>
    for (const f of RESET_PROFILE_FIELDS) delete s[f]
    return JSON.stringify(s)
  } catch {
    return settingsJson
  }
}

/**
 * Everything a reset removes.
 *
 * `warren_sync_mark_v1` and the snapshot go with everything else — after a
 * reset this device has never synced, which is the truth.
 *
 * Deliberately a denylist of survivors rather than a list of known module keys:
 * a module added later would otherwise quietly survive the reset. `scrap7_v3`
 * matters most here — it is the pre-v4 rollback copy, and leaving it behind
 * would let the v3→v4 migration resurrect every old task on the next load.
 */
export function resetKeys(allKeys: string[]): string[] {
  return allKeys.filter(k => !(RESET_KEEP as readonly string[]).includes(k))
}

/** Wipe the record. Returns how many keys went. There is no undo — export first. */
export function resetProgress(): number {
  const all: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key) all.push(key)
  }
  const doomed = resetKeys(all)
  for (const key of doomed) localStorage.removeItem(key)

  const settings = localStorage.getItem(SETTINGS_KEY)
  if (settings) localStorage.setItem(SETTINGS_KEY, stripProfile(settings))

  return doomed.length
}

/** Validate + restore a backup. Returns the number of keys restored. Throws on bad input. */
export function importBackup(json: string): number {
  let parsed: unknown
  try { parsed = JSON.parse(json) } catch { throw new Error('Not valid JSON.') }

  const b = parsed as Partial<BackupFile>
  if (b.app !== 'warren' || typeof b.data !== 'object' || b.data === null) {
    throw new Error('Not a Warren backup file (missing app/data fields).')
  }

  // Each value must be a string that itself parses as JSON (our stores all are)
  const entries = Object.entries(b.data)
  if (entries.length === 0) throw new Error('Backup contains no data.')
  for (const [key, val] of entries) {
    if (typeof val !== 'string') throw new Error(`Invalid value for key "${key}".`)
    try { JSON.parse(val) } catch { throw new Error(`Corrupted data for key "${key}".`) }
  }

  for (const [key, val] of entries) {
    // Backups carry no API keys (stripped on export) — when restoring settings,
    // keep whatever keys this device already has instead of blanking them.
    if (key === SETTINGS_KEY) {
      try {
        const incoming = JSON.parse(val) as Record<string, unknown>
        const current  = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Record<string, unknown>
        for (const f of SECRET_FIELDS) {
          if (!incoming[f] && typeof current[f] === 'string') incoming[f] = current[f]
        }
        localStorage.setItem(key, JSON.stringify(incoming))
        continue
      } catch { /* fall through to raw write */ }
    }
    localStorage.setItem(key, val)
  }
  return entries.length
}
