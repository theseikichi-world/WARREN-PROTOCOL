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
const SECRET_FIELDS = ['aiApiKey', 'tmdbApiKey', 'rawgApiKey'] as const
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
