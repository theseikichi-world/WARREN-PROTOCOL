import { aiLangSuffix } from './i18n'

// ─── Claude models (the only AI provider Warren uses) ─────────────────────────
export interface ClaudeModel {
  id:    string
  label: string
  sub:   string
}

export const CLAUDE_MODELS: ClaudeModel[] = [
  { id: 'claude-haiku-4-5',  label: 'Haiku 4.5',  sub: 'fastest · cheapest' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', sub: 'balanced · recommended' },
  { id: 'claude-opus-4-8',   label: 'Opus 4.8',   sub: 'most capable · priciest' },
]

export const DEFAULT_MODEL = 'claude-sonnet-4-6'

export function isClaudeModel(id: string): boolean {
  return /^claude-/.test(id)
}

// ─── Per-task model routing ───────────────────────────────────────────────────
// Each AI feature is routed to the cheapest model that does the job well, so the
// token budget is spent where it matters. Users can override any task in Settings.
export interface AiTask {
  id:           string
  label:        string
  desc:         string
  defaultModel: string
}

export const AI_TASKS: AiTask[] = [
  { id: 'scrap7.assistant', label: 'SCRAP-7 chat',     desc: 'Command parsing & quick replies',     defaultModel: 'claude-haiku-4-5'  },
  { id: 'solaris.delivery', label: 'SOLARIS dishes',   desc: 'What-to-eat / pantry dish ideas (JSON)', defaultModel: 'claude-sonnet-4-6' },
  { id: 'solaris.mealparse', label: 'SOLARIS meal log', desc: 'Parse "what I ate" (text/photo) → entries', defaultModel: 'claude-sonnet-4-6' },
  { id: 'solaris.pantry',    label: 'SOLARIS pantry',   desc: 'Read groceries from a photo → items',   defaultModel: 'claude-haiku-4-5' },
  { id: 'solaris.analyze',   label: 'SOLARIS analyzer', desc: 'Pantry gaps + cost-tiered shopping list', defaultModel: 'claude-sonnet-4-6' },
  { id: 'log.analysis',     label: 'L.O.G analysis',   desc: 'Deep goal breakdown — missions/tasks', defaultModel: 'claude-opus-4-8'   },
  { id: 'uplink.protocol',  label: 'UPLINK protocol',  desc: 'A dream → a proposed chain of routines', defaultModel: 'claude-opus-4-8'   },
  { id: 'infinity8.optimize', label: 'INFINITY-8 optimize', desc: 'Rebalance the week, circadian timing', defaultModel: 'claude-sonnet-4-6' },
  { id: 'pictures.metadata',  label: 'PICTURES metadata',  desc: 'Title details fallback (no TMDB key)', defaultModel: 'claude-haiku-4-5' },
  { id: 'journal.enhance',    label: 'JOURNAL enhance',    desc: 'Polish entries, stickers, reflection',  defaultModel: 'claude-sonnet-4-6' },
]

/** Resolve which model a given task should use: per-task override → task default → global. */
export function modelForTask(settings: Settings, taskId: string): string {
  const override = settings.taskModels?.[taskId]
  if (override && isClaudeModel(override)) return override
  const task = AI_TASKS.find(t => t.id === taskId)
  if (task) return task.defaultModel
  return isClaudeModel(settings.aiModel) ? settings.aiModel : DEFAULT_MODEL
}

// ─── Settings ─────────────────────────────────────────────────────────────────
export interface Settings {
  accentColor:    string
  opacity:        number
  alwaysOnTop:    boolean
  startOnStartup: boolean
  showIntro:      boolean
  bootBigScreen:  boolean                   // desktop: launch straight into fullscreen Warren OS
  displayName:    string
  // AI — Claude only
  aiApiKey:       string
  aiModel:        string                    // global default / fallback model
  taskModels:     Record<string, string>    // per-task overrides, keyed by AiTask.id
  // Data sources (Galactic Pictures)
  tmdbApiKey:     string                    // themoviedb.org — movies/TV/posters
  rawgApiKey:     string                    // rawg.io — games with Metacritic
}

export const ACCENT_PRESETS = [
  { name: 'Cyan',   value: '#00f5ff' },
  { name: 'Purple', value: '#bf5fff' },
  { name: 'Green',  value: '#39ff14' },
  { name: 'Orange', value: '#ff6b00' },
  { name: 'Pink',   value: '#ff006e' },
  { name: 'Blue',   value: '#4488ff' },
  { name: 'Gold',   value: '#ffd700' },
  { name: 'Red',    value: '#ff2244' },
]

export const DEFAULT_SETTINGS: Settings = {
  accentColor:    '#00f5ff',
  opacity:        0.78,
  alwaysOnTop:    false,
  startOnStartup: false,
  showIntro:      true,
  bootBigScreen:  true,
  displayName:    '',
  aiApiKey:       '',
  aiModel:        DEFAULT_MODEL,
  taskModels:     {},
  tmdbApiKey:     '',
  rawgApiKey:     '',
}

const KEY = 'warren_settings'

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    const merged = raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS }

    // ── Migration from the old multi-provider config ──
    // Old keys (aiProvider, aiBaseUrl) are simply ignored. But the old aiModel
    // (e.g. "gpt-4o-mini") and any non-Anthropic key would 401 against Claude.
    if (!isClaudeModel(merged.aiModel)) merged.aiModel = DEFAULT_MODEL
    if (merged.aiApiKey && !/^sk-ant-/.test(merged.aiApiKey)) merged.aiApiKey = ''
    if (!merged.taskModels || typeof merged.taskModels !== 'object') merged.taskModels = {}

    return merged
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(s))
}

/** True only inside the Tauri desktop shell — false in a plain browser / iOS web build. */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function applySettings(s: Settings): void {
  const root = document.documentElement
  root.style.setProperty('--accent', s.accentColor)
  root.style.setProperty('--accent-dim', `${s.accentColor}40`)
}

// ─── AI chat — Claude Messages API (direct REST) ──────────────────────────────
// Warren is a Tauri webview, so we call the Anthropic API directly with
// `anthropic-dangerous-direct-browser-access`. We use raw fetch rather than the
// official SDK because the SDK bundles Node-only modules (node:crypto / fs via
// its agent-toolset) that don't bundle for a browser/webview target. The key
// never leaves the user's machine — it sits in localStorage and goes straight
// to api.anthropic.com.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'

export interface AiMessage {
  role:    'system' | 'user' | 'assistant'
  content: string
}

export interface AiChatOptions {
  maxTokens?: number
  /** Explicit model id — usually passed via modelForTask(settings, taskId). */
  model?:     string
}
// NOTE: current Claude models (Haiku 4.5 / Sonnet 4.6 / Opus 4.8) have removed
// `temperature` and assistant-prefill — sending either returns a 400. JSON output
// is enforced by the system prompt + robust parsing in aiJson, not by those.

interface AnthropicTextBlock { type: string; text?: string }
interface AnthropicResponse {
  content?: AnthropicTextBlock[]
  error?:   { type?: string; message?: string }
}

const ANTHROPIC_HEADERS = (apiKey: string) => ({
  'x-api-key':                                 apiKey,
  'anthropic-version':                         '2023-06-01',
  'anthropic-dangerous-direct-browser-access': 'true',
  'content-type':                              'application/json',
})

/** POST a prepared request body, surface friendly errors, retry once on transient failures. */
async function postWithRetry(body: string, apiKey: string): Promise<string> {
  const attempt = async (): Promise<{ text: string } | { retry: true; reason: string }> => {
    let res: Response
    try {
      res = await fetch(ANTHROPIC_URL, { method: 'POST', headers: ANTHROPIC_HEADERS(apiKey), body })
    } catch {
      return { retry: true, reason: 'Could not reach Claude (network error). Check your connection.' }
    }

    if (!res.ok) {
      let detail = ''
      try { detail = ((await res.json()) as AnthropicResponse).error?.message ?? '' } catch { /* non-JSON */ }

      if (res.status === 401) throw new Error('Claude API key rejected (401). Check the key in Settings → AI Assistant.')
      if (res.status === 400 && /credit|billing/i.test(detail)) {
        throw new Error('Claude request blocked — your account may be out of credit. Check console.anthropic.com → Billing.')
      }
      if (res.status === 429 || res.status === 529 || res.status >= 500) {
        return { retry: true, reason: res.status === 429
          ? 'Claude rate limit hit (429). Wait a moment and try again.'
          : `Claude is overloaded (${res.status}). Try again in a moment.` }
      }
      throw new Error(`Claude API error ${res.status}${detail ? `: ${detail}` : ''}`)
    }

    const data = await res.json() as AnthropicResponse
    const text = (data.content ?? [])
      .filter(b => b.type === 'text' && typeof b.text === 'string')
      .map(b => b.text as string)
      .join('')
    return { text }
  }

  const first = await attempt()
  if ('text' in first) return first.text || 'No response.'
  await new Promise(r => setTimeout(r, 2000))   // short backoff, then one retry
  const second = await attempt()
  if ('text' in second) return second.text || 'No response.'
  throw new Error(second.reason)
}

export async function aiChat(
  messages: AiMessage[],
  settings: Settings,
  opts: AiChatOptions = {},
): Promise<string> {
  const apiKey = settings.aiApiKey.trim()
  if (!apiKey) {
    throw new Error('No Claude API key set. Open Settings → AI Assistant and paste your key from console.anthropic.com.')
  }

  const model = opts.model && isClaudeModel(opts.model)
    ? opts.model
    : (isClaudeModel(settings.aiModel) ? settings.aiModel : DEFAULT_MODEL)

  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n') + aiLangSuffix()
  const turns  = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  // Cache the system prefix so repeated calls with the same prompt reuse tokens
  // (~0.1× cost on reads). Only engages once the prefix passes the model's
  // minimum cacheable size; below that it's a harmless no-op.
  const systemField = system
    ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
    : undefined

  const body = JSON.stringify({
    model,
    max_tokens: opts.maxTokens ?? 1024,
    ...(systemField ? { system: systemField } : {}),
    messages: turns,
  })

  return postWithRetry(body, apiKey)
}

// ─── aiStream — SSE streaming variant ─────────────────────────────────────────
// Same request as aiChat but with `stream: true`; calls onText with the
// accumulated text after every delta so the UI can render live. Returns the
// full text. Retries once on transient pre-stream failures; a mid-stream
// drop returns what arrived so far (partial output beats a hard error).

export async function aiStream(
  messages: AiMessage[],
  settings: Settings,
  opts: AiChatOptions & { onText: (full: string) => void },
): Promise<string> {
  const apiKey = settings.aiApiKey.trim()
  if (!apiKey) {
    throw new Error('No Claude API key set. Open Settings → AI Assistant and paste your key from console.anthropic.com.')
  }

  const model = opts.model && isClaudeModel(opts.model)
    ? opts.model
    : (isClaudeModel(settings.aiModel) ? settings.aiModel : DEFAULT_MODEL)

  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n') + aiLangSuffix()
  const turns  = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  const body = JSON.stringify({
    model,
    max_tokens: opts.maxTokens ?? 1024,
    stream: true,
    ...(system ? { system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] } : {}),
    messages: turns,
  })

  const open = async (): Promise<Response | { retry: true; reason: string }> => {
    let res: Response
    try {
      res = await fetch(ANTHROPIC_URL, {
        method:  'POST',
        headers: {
          'x-api-key':                                 apiKey,
          'anthropic-version':                         '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
          'content-type':                              'application/json',
        },
        body,
      })
    } catch {
      return { retry: true, reason: 'Could not reach Claude (network error). Check your connection.' }
    }
    if (!res.ok) {
      let detail = ''
      try { detail = ((await res.json()) as AnthropicResponse).error?.message ?? '' } catch { /* non-JSON */ }
      if (res.status === 401) throw new Error('Claude API key rejected (401). Check the key in Settings → AI Assistant.')
      if (res.status === 400 && /credit|billing/i.test(detail)) {
        throw new Error('Claude request blocked — your account may be out of credit. Check console.anthropic.com → Billing.')
      }
      if (res.status === 429 || res.status === 529 || res.status >= 500) {
        return { retry: true, reason: res.status === 429
          ? 'Claude rate limit hit (429). Wait a moment and try again.'
          : `Claude is overloaded (${res.status}). Try again in a moment.` }
      }
      throw new Error(`Claude API error ${res.status}${detail ? `: ${detail}` : ''}`)
    }
    return res
  }

  let res = await open()
  if (!(res instanceof Response)) {
    await new Promise(r => setTimeout(r, 2000))
    const second = await open()
    if (!(second instanceof Response)) throw new Error(second.reason)
    res = second
  }

  if (!res.body) throw new Error('Claude returned no stream body.')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let full = ''
  let streamError: string | null = null

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload) continue
        let ev: { type?: string; delta?: { type?: string; text?: string }; error?: { message?: string } }
        try { ev = JSON.parse(payload) } catch { continue }
        if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && typeof ev.delta.text === 'string') {
          full += ev.delta.text
          opts.onText(full)
        } else if (ev.type === 'error') {
          streamError = ev.error?.message ?? 'Stream error'
        }
      }
    }
  } catch {
    // mid-stream network drop — fall through with whatever arrived
  }

  if (!full && streamError) throw new Error(`Claude stream error: ${streamError}`)
  return full
}

// ─── aiJson — structured output helper ────────────────────────────────────────
// The system prompt instructs JSON-only output; this strips any fences/prose,
// slices the JSON body (object or array), and retries the whole call once if
// parsing still fails. Use for every JSON-contract feature.

export interface AiJsonOptions extends AiChatOptions {
  /** Expected top-level shape — "{" object (default) or "[" array. Parse hint only. */
  prefill?: '{' | '['
}

export async function aiJson<T>(
  messages: AiMessage[],
  settings: Settings,
  opts: AiJsonOptions = {},
): Promise<T> {
  const open  = opts.prefill ?? '{'
  const close = open === '{' ? '}' : ']'

  const once = async (): Promise<T> => parseJsonLoose<T>(
    await aiChat(messages, settings, { model: opts.model, maxTokens: opts.maxTokens }), open, close)

  try {
    return await once()
  } catch (e) {
    // Auth/billing errors shouldn't be retried — surface immediately
    if (e instanceof Error && /401|billing|credit/i.test(e.message)) throw e
    return once()
  }
}

/** Strip fences/prose and slice the first JSON object/array out of a raw model reply. */
function parseJsonLoose<T>(raw: string, open: '{' | '[', close: '}' | ']'): T {
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim()
  const start = cleaned.indexOf(open)
  const end   = cleaned.lastIndexOf(close)
  if (start === -1 || end === -1 || end < start) throw new Error('AI returned no parsable JSON.')
  return JSON.parse(cleaned.slice(start, end + 1)) as T
}

// ─── aiVision — image-aware variant ───────────────────────────────────────────
// Sends one or more base64 images plus a text prompt as a single user turn.
// All current Claude models (Haiku 4.5 / Sonnet 4.6 / Opus 4.8) accept images.

export interface ImageInput {
  base64:    string    // raw base64 (no data: URL prefix)
  mediaType: string    // e.g. 'image/jpeg' | 'image/png' | 'image/webp'
}

export async function aiVision(
  system: string,
  userText: string,
  images: ImageInput[],
  settings: Settings,
  opts: AiChatOptions = {},
): Promise<string> {
  const apiKey = settings.aiApiKey.trim()
  if (!apiKey) {
    throw new Error('No Claude API key set. Open Settings → AI Assistant and paste your key from console.anthropic.com.')
  }
  const model = opts.model && isClaudeModel(opts.model)
    ? opts.model
    : (isClaudeModel(settings.aiModel) ? settings.aiModel : DEFAULT_MODEL)

  // Anthropic recommends images BEFORE the text that asks about them.
  const content = [
    ...images.map(im => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: im.mediaType, data: im.base64 },
    })),
    { type: 'text' as const, text: userText },
  ]

  const body = JSON.stringify({
    model,
    max_tokens: opts.maxTokens ?? 1024,
    ...(system ? { system: [{ type: 'text', text: system + aiLangSuffix(), cache_control: { type: 'ephemeral' } }] } : {}),
    messages: [{ role: 'user', content }],
  })

  return postWithRetry(body, apiKey)
}

/** Vision call that expects JSON back (same loose parsing + one retry as aiJson). */
export async function aiVisionJson<T>(
  system: string,
  userText: string,
  images: ImageInput[],
  settings: Settings,
  opts: AiJsonOptions = {},
): Promise<T> {
  const open  = opts.prefill ?? '{'
  const close = open === '{' ? '}' : ']'
  const once = async (): Promise<T> => parseJsonLoose<T>(
    await aiVision(system, userText, images, settings, { model: opts.model, maxTokens: opts.maxTokens }), open, close)
  try {
    return await once()
  } catch (e) {
    if (e instanceof Error && /401|billing|credit/i.test(e.message)) throw e
    return once()
  }
}
