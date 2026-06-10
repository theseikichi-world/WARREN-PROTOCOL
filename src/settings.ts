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
  { id: 'solaris.delivery', label: 'SOLARIS delivery', desc: 'Personalised meal planning (JSON)',    defaultModel: 'claude-sonnet-4-6' },
  { id: 'log.analysis',     label: 'L.O.G analysis',   desc: 'Deep goal breakdown — missions/tasks', defaultModel: 'claude-opus-4-8'   },
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
  /** Sampling temperature. Use 0 for structured/JSON output (aiJson sets this). */
  temperature?: number
  /** Assistant prefill — forces the reply to continue from this text (e.g. "{" for JSON). */
  prefill?:   string
}

interface AnthropicTextBlock { type: string; text?: string }
interface AnthropicResponse {
  content?: AnthropicTextBlock[]
  error?:   { type?: string; message?: string }
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

  const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n')
  const turns  = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  // Assistant prefill: the reply is forced to continue from this text.
  // Standard technique for guaranteed-structure output (e.g. prefill "{" for JSON).
  if (opts.prefill) turns.push({ role: 'assistant', content: opts.prefill })

  // Cache the system prefix so repeated calls with the same prompt reuse tokens
  // (~0.1× cost on reads). Only engages once the prefix passes the model's
  // minimum cacheable size; below that it's a harmless no-op.
  const systemField = system
    ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
    : undefined

  const body = JSON.stringify({
    model,
    max_tokens: opts.maxTokens ?? 1024,
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    ...(systemField ? { system: systemField } : {}),
    messages: turns,
  })

  const attempt = async (): Promise<{ text: string } | { retry: true; reason: string }> => {
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
      try {
        const errBody = await res.json() as AnthropicResponse
        detail = errBody.error?.message ?? ''
      } catch { /* non-JSON error body */ }

      if (res.status === 401) throw new Error('Claude API key rejected (401). Check the key in Settings → AI Assistant.')
      if (res.status === 400 && /credit|billing/i.test(detail)) {
        throw new Error('Claude request blocked — your account may be out of credit. Check console.anthropic.com → Billing.')
      }
      // Transient: rate limit / overloaded / server hiccup → retry once
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
    return { text: (opts.prefill ?? '') + text }
  }

  const first = await attempt()
  if ('text' in first) return first.text || 'No response.'

  // One retry with a short backoff for transient failures
  await new Promise(r => setTimeout(r, 2000))
  const second = await attempt()
  if ('text' in second) return second.text || 'No response.'
  throw new Error(second.reason)
}

// ─── aiJson — structured output helper ────────────────────────────────────────
// Prefills the assistant turn with "{" (or "[") so the model MUST continue
// valid JSON, runs at temperature 0, extracts the JSON body, and retries the
// whole call once if parsing still fails. Use for every JSON-contract feature.

export interface AiJsonOptions extends AiChatOptions {
  /** "{"  for object responses (default), "[" for array responses. */
  prefill?: '{' | '['
}

export async function aiJson<T>(
  messages: AiMessage[],
  settings: Settings,
  opts: AiJsonOptions = {},
): Promise<T> {
  const prefill = opts.prefill ?? '{'
  const close   = prefill === '{' ? '}' : ']'

  const once = async (): Promise<T> => {
    const raw = await aiChat(messages, settings, {
      ...opts, prefill, temperature: opts.temperature ?? 0,
    })
    const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim()
    const start = cleaned.indexOf(prefill)
    const end   = cleaned.lastIndexOf(close)
    if (start === -1 || end === -1 || end < start) throw new Error('AI returned no parsable JSON.')
    return JSON.parse(cleaned.slice(start, end + 1)) as T
  }

  try {
    return await once()
  } catch (e) {
    // Auth/billing errors shouldn't be retried — surface immediately
    if (e instanceof Error && /401|billing|credit/i.test(e.message)) throw e
    return once()
  }
}
