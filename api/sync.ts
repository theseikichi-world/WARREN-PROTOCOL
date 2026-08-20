import { put, list } from '@vercel/blob'

// ─── /api/sync — the only server Warren has ───────────────────────────────────
// It stores one opaque record per room and knows nothing else. The room id is a
// hash of the user's passphrase and the payload is AES-GCM ciphertext sealed on
// the device, so this function cannot identify whose data it holds or read a
// word of it. That is deliberate: a personal journal should not be legible to
// the machine storing it.
//
// Vercel Blob is public-by-URL, which is exactly why the client encrypts. The
// blob URL is never returned to the client either — reads are proxied here.

// NODE runtime, deliberately — do NOT set `runtime: 'edge'` here.
//
// Edge is a V8 isolate with no Node core modules, and @vercel/blob reaches
// undici for HTTP, which needs node:stream, net, tls, zlib and friends. Asking
// for Edge makes the build fail listing every one of them. Nothing in this
// function wants an isolate: it is a handful of blob reads a day, not something
// that needs to run in thirty regions.

interface Record {
  sealed:    unknown
  device:    string
  updatedAt: string
}

const KEY = (room: string) => `warren-sync/${room}.json`

/**
 * CORS, because only ONE of the two clients is same-origin.
 *
 * The PWA is served from this deployment and talks to /api/sync on its own
 * origin, so it never needed any of this. The desktop app is a Tauri webview on
 * tauri.localhost calling the same URL across origins — and since the client
 * sends content-type and a bypass header, the browser preflights with OPTIONS
 * first. With no CORS headers and no OPTIONS handler that preflight failed, and
 * the app could only report "Failed to fetch": no status, no body, nothing to
 * show the user, because the request never left the browser.
 *
 * `*` is the right answer rather than a lax one. The room id is the credential —
 * 256 bits derived through PBKDF2 — and no cookie or session rides these
 * requests, so there is nothing for an origin to be trusted WITH. CORS only
 * restrains browsers anyway; anything server-side could always call this.
 */
const CORS = {
  'access-control-allow-origin':  '*',
  'access-control-allow-methods': 'GET, PUT, OPTIONS',
  'access-control-allow-headers': 'content-type, x-vercel-protection-bypass',
  'access-control-max-age':       '86400',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS,
      'content-type': 'application/json',
      // No caching: a stale read here is a lost day of work
      'cache-control': 'no-store, max-age=0',
    },
  })

/** A room must look like a hash — anything else is a client that lost its way. */
const validRoom = (room: string | null): room is string =>
  !!room && /^[0-9a-f]{64}$/.test(room)

async function read(room: string): Promise<Record | null> {
  const { blobs } = await list({ prefix: KEY(room), limit: 1 })
  const hit = blobs.find(b => b.pathname === KEY(room))
  if (!hit) return null
  const res = await fetch(hit.url, { cache: 'no-store' })
  if (!res.ok) return null
  return await res.json() as Record
}

/**
 * Say what actually went wrong.
 *
 * An unhandled throw here reaches the client as FUNCTION_INVOCATION_FAILED and
 * a Vercel trace id — which tells the person staring at the settings screen
 * nothing they can act on. The overwhelmingly likely cause is that no Blob
 * store is connected, because @vercel/blob throws the moment it has no
 * BLOB_READ_WRITE_TOKEN, so that gets named explicitly rather than guessed at.
 */
function failed(err: unknown): Response {
  const msg = err instanceof Error ? err.message : String(err)
  const noStore = /BLOB_READ_WRITE_TOKEN|No token found|blob store/i.test(msg)
  return json({
    error: noStore ? 'no blob store' : 'server error',
    detail: noStore
      ? 'This deployment has no Blob store connected. In Vercel: Storage → create a Blob store → connect it to this project, then redeploy.'
      : msg.slice(0, 200),
  }, noStore ? 503 : 500)
}

export default async function handler(req: Request): Promise<Response> {
  // The preflight. Must answer before any cross-origin GET or PUT is allowed.
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  const room = new URL(req.url).searchParams.get('room')
  if (!validRoom(room)) return json({ error: 'bad room' }, 400)

  if (req.method === 'GET') {
    try {
      const record = await read(room)
      return record ? json(record) : json({ error: 'empty' }, 404)
    } catch (err) { return failed(err) }
  }

  if (req.method === 'PUT') {
    let body: { sealed?: unknown; device?: unknown; baseUpdatedAt?: unknown }
    try { body = await req.json() } catch { return json({ error: 'bad json' }, 400) }
    if (!body.sealed) return json({ error: 'nothing to store' }, 400)

    // Optimistic concurrency. The client tells us which version it edited from;
    // if the room moved on since, we refuse rather than overwrite the other
    // device's work — the client turns this into a question for the user.
    try {
    const current = await read(room)
    const base = typeof body.baseUpdatedAt === 'string' ? body.baseUpdatedAt : null
    if (current && current.updatedAt !== base) {
      return json({ error: 'conflict', updatedAt: current.updatedAt, device: current.device }, 409)
    }

    const record: Record = {
      sealed:    body.sealed,
      device:    typeof body.device === 'string' ? body.device.slice(0, 40) : 'unknown',
      updatedAt: new Date().toISOString(),
    }
    await put(KEY(room), JSON.stringify(record), {
      access: 'public',
      addRandomSuffix: false,   // a room is one stable path, overwritten in place
      allowOverwrite: true,
      contentType: 'application/json',
      // Blob defaults to caching for a YEAR, and the URL never changes. Left
      // alone, the other device would read today's push for months. This is the
      // whole feature: never hand back a stale record.
      cacheControlMaxAge: 0,
    })
    return json({ updatedAt: record.updatedAt, device: record.device })
    } catch (err) { return failed(err) }
  }

  return json({ error: 'method not allowed' }, 405)
}
