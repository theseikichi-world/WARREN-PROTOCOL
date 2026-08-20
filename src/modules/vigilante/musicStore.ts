// ─── Keeping the track between sessions ───────────────────────────────────────
// localStorage holds strings, and an audio file is megabytes of binary — dropping
// one in there would blow the quota and take every other module's data down with
// it, since Warren keeps everything in the same store. IndexedDB stores the Blob
// natively, so the file survives a reload without touching the localStorage
// budget that the rest of the app (and `backup.ts`) depends on.
//
// It is deliberately NOT part of the backup or the sync blob: a 6MB track is not
// part of your record, and pushing it through an encrypted sync every launch
// would be absurd. Re-pick it on a new device.

const DB = 'warren_vigilante'
const STORE = 'music'
const KEY = 'track'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export interface StoredTrack {
  name: string
  blob: Blob
}

/** Every call is best-effort: no soundtrack must never break the timer. */
export async function saveTrack(file: File): Promise<void> {
  try {
    const db = await open()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put({ name: file.name, blob: file }, KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch { /* the session just runs silent */ }
}

export async function loadTrack(): Promise<StoredTrack | null> {
  try {
    const db = await open()
    const out = await new Promise<StoredTrack | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve((req.result as StoredTrack) ?? null)
      req.onerror = () => reject(req.error)
    })
    db.close()
    return out && out.blob instanceof Blob ? out : null
  } catch {
    return null
  }
}

export async function clearTrack(): Promise<void> {
  try {
    const db = await open()
    await new Promise<void>(resolve => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
    db.close()
  } catch { /* nothing stored */ }
}
