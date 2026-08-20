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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
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

export default async function handler(req: Request): Promise<Response> {
  const room = new URL(req.url).searchParams.get('room')
  if (!validRoom(room)) return json({ error: 'bad room' }, 400)

  if (req.method === 'GET') {
    const record = await read(room)
    return record ? json(record) : json({ error: 'empty' }, 404)
  }

  if (req.method === 'PUT') {
    let body: { sealed?: unknown; device?: unknown; baseUpdatedAt?: unknown }
    try { body = await req.json() } catch { return json({ error: 'bad json' }, 400) }
    if (!body.sealed) return json({ error: 'nothing to store' }, 400)

    // Optimistic concurrency. The client tells us which version it edited from;
    // if the room moved on since, we refuse rather than overwrite the other
    // device's work — the client turns this into a question for the user.
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
  }

  return json({ error: 'method not allowed' }, 405)
}
