import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  type JournalState, type JournalEntry, type Sticker,
  loadJournal, saveJournal, deleteEntry,
  journalStreak, allStickers, todayKey, fmtStardate, fmtDay,
} from './store'
import { aiJson, loadSettings, modelForTask, type AiMessage } from '../../settings'

const NEON   = '#ffd700'   // captain's gold
const NEON_D = 'rgba(255,215,0,0.1)'
const FONT   = 'var(--font)'
const CARD   = 'rgba(18,14,3,0.92)'   // opaque over transparent window
const RAISED = 'rgba(26,21,6,0.95)'
const FAINT  = 'rgba(255,215,0,0.08)'

// ─── AI enhancement ───────────────────────────────────────────────────────────
const ENHANCE_SYSTEM = `You are the wise owl first-officer of a starship, reviewing the captain's personal journal entry.
Respond in the SAME LANGUAGE the entry is written in (Russian → Russian, English → English).

Return ONLY a JSON object, no fences, no prose outside it:
{
  "polished": "the entry rewritten with better flow, grammar and vividness — keep the author's voice, events, feelings and meaning EXACTLY; fix errors, improve rhythm; similar length",
  "stickers": [{ "emoji": "🌟", "label": "1-3 word caption" }],
  "mood": { "label": "one-word mood", "emoji": "😊", "color": "#hexcolor matching the mood" },
  "themes": ["theme1", "theme2"],
  "reflection": "2-4 warm, insightful sentences from the first-officer: what stands out, a pattern noticed, a gentle thought or question. Supportive, never preachy."
}

STICKERS: 3-5 playful stickers that capture moments/objects/feelings from THIS entry — like physical stickers in a paper journal. Specific beats generic (🥟 'first dumplings' > 🙂 'nice day').
THEMES: 2-4 short tags. Keep "label"/"themes" in the entry's language too.`

interface EnhanceResult {
  polished: string
  stickers: Sticker[]
  mood: { label: string; emoji: string; color: string }
  themes: string[]
  reflection: string
}

async function enhanceEntry(raw: string): Promise<EnhanceResult> {
  const settings = loadSettings()
  const msgs: AiMessage[] = [
    { role: 'system', content: ENHANCE_SYSTEM },
    { role: 'user', content: raw },
  ]
  interface ParsedEnhance {
    polished?: unknown
    stickers?: unknown
    mood?: { label?: unknown; emoji?: unknown; color?: string }
    themes?: unknown
    reflection?: unknown
  }
  // temperature 0.7: enhancement is creative writing, not strict extraction
  const p = await aiJson<ParsedEnhance>(msgs, settings,
    { model: modelForTask(settings, 'journal.enhance'), maxTokens: 1600, temperature: 0.7 })
  return {
    polished: typeof p.polished === 'string' && p.polished.trim() ? p.polished : raw,
    stickers: Array.isArray(p.stickers)
      ? p.stickers.filter((x: Sticker) => x?.emoji).slice(0, 5)
          .map((x: Sticker) => ({ emoji: String(x.emoji), label: String(x.label ?? '') }))
      : [],
    mood: p.mood?.emoji
      ? { label: String(p.mood.label ?? ''), emoji: String(p.mood.emoji),
          color: /^#[0-9a-f]{3,8}$/i.test(String(p.mood.color ?? '')) ? String(p.mood.color) : NEON }
      : { label: '', emoji: '📖', color: NEON },
    themes: Array.isArray(p.themes) ? p.themes.slice(0, 4).map(String) : [],
    reflection: typeof p.reflection === 'string' ? p.reflection : '',
  }
}

// ─── Sticker chip — styled like a physical sticker ────────────────────────────
function StickerChip({ s, i, size = 'md' }: { s: Sticker; i: number; size?: 'sm' | 'md' }) {
  const rotations = [-8, 6, -4, 9, -6, 3]
  const rot = rotations[i % rotations.length]
  const big = size === 'md'
  return (
    <div title={s.label} style={{
      display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 1,
      padding: big ? '5px 7px 3px' : '3px 5px 2px', borderRadius: 9,
      background: 'rgba(250,246,230,0.95)',
      border: '2px solid rgba(255,255,255,0.9)',
      boxShadow: '0 2px 6px rgba(0,0,0,0.45), inset 0 0 4px rgba(0,0,0,0.06)',
      transform: `rotate(${rot}deg)`,
      cursor: 'default', userSelect: 'none',
      transition: 'transform 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = `rotate(${rot}deg) scale(1.15)` }}
      onMouseLeave={e => { e.currentTarget.style.transform = `rotate(${rot}deg)` }}>
      <span style={{ fontSize: big ? 16 : 13, lineHeight: 1 }}>{s.emoji}</span>
      {big && s.label && (
        <span style={{ fontFamily: FONT, fontSize: 5.5, fontWeight: 800, color: '#3a3320',
          letterSpacing: '0.04em', maxWidth: 52, overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', textTransform: 'uppercase' }}>{s.label}</span>
      )}
    </div>
  )
}

// ─── Composer ─────────────────────────────────────────────────────────────────
function Composer({ initial, onSeal, onCancel, enhancing }: {
  initial?: string
  onSeal: (text: string, enhance: boolean) => void
  onCancel: () => void
  enhancing: boolean
}) {
  const [text, setText] = useState(initial ?? '')
  const can = text.trim().length >= 3 && !enhancing

  return (
    <div className="fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', flexShrink: 0, borderBottom: `1px solid ${NEON}18`,
        display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onCancel} style={{ fontFamily: FONT, fontSize: 11, color: `${NEON}55`,
          letterSpacing: '0.1em', cursor: 'pointer' }}>← BACK</button>
        <div>
          <p style={{ fontFamily: FONT, fontSize: 9, fontWeight: 900, color: NEON,
            letterSpacing: '0.2em', textShadow: `0 0 8px ${NEON}` }}>{fmtStardate(todayKey())}</p>
          <p style={{ fontFamily: FONT, fontSize: 6.5, color: `${NEON}45`, letterSpacing: '0.1em' }}>
            {fmtDay(todayKey()).toUpperCase()}</p>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '12px 14px', gap: 10, overflow: 'hidden' }}>
        <textarea value={text} onChange={e => setText(e.target.value)} autoFocus
          placeholder={"Captain's journal. Tell the story of your day —\nwhat happened, what you felt, what you're thinking about…"}
          style={{
            flex: 1, width: '100%', padding: '12px 14px', borderRadius: 10, resize: 'none',
            background: 'rgba(0,0,0,0.45)', border: `1px solid ${NEON}22`, outline: 'none',
            fontFamily: FONT, fontSize: 12, lineHeight: 1.8, color: 'rgba(255,248,220,0.92)',
            letterSpacing: '0.02em', boxSizing: 'border-box',
            userSelect: 'text', WebkitUserSelect: 'text',
          }}
          onFocus={e => e.target.style.borderColor = `${NEON}50`}
          onBlur={e => e.target.style.borderColor = `${NEON}22`}
        />
        <p style={{ fontFamily: FONT, fontSize: 7, color: 'rgba(148,163,184,0.4)', letterSpacing: '0.05em', flexShrink: 0 }}>
          {text.trim().length} chars · your original words are always kept
        </p>

        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button disabled={!can} onClick={() => onSeal(text.trim(), true)} style={{
            flex: 2, padding: '11px', borderRadius: 8, cursor: can ? 'pointer' : 'default',
            fontFamily: FONT, fontSize: 'var(--fs-sm)', fontWeight: 800, letterSpacing: '0.1em',
            color: can ? '#1a1503' : 'rgba(148,163,184,0.3)',
            background: can ? `linear-gradient(135deg, ${NEON}, #ffb700)` : 'rgba(255,255,255,0.04)',
            border: 'none', boxShadow: can ? `0 4px 18px ${NEON}40` : 'none', transition: 'all 0.2s',
          }}>
            {enhancing ? '🦉 ENHANCING…' : '✨ ENHANCE & SEAL'}
          </button>
          <button disabled={!can} onClick={() => onSeal(text.trim(), false)} style={{
            flex: 1, padding: '11px', borderRadius: 8, cursor: can ? 'pointer' : 'default',
            fontFamily: FONT, fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.08em',
            color: can ? `${NEON}90` : 'rgba(148,163,184,0.25)',
            background: 'transparent', border: `1px solid ${can ? `${NEON}35` : 'rgba(255,255,255,0.05)'}`,
            transition: 'all 0.15s',
          }}>SEAL AS-IS</button>
        </div>
      </div>
    </div>
  )
}

// ─── Entry card ───────────────────────────────────────────────────────────────
function EntryCard({ entry, onUpdate, onDelete, onEnhance, enhancingId }: {
  entry: JournalEntry
  onUpdate: (id: string, patch: Partial<JournalEntry>) => void
  onDelete: (id: string) => void
  onEnhance: (entry: JournalEntry) => void
  enhancingId: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  const [hov, setHov] = useState(false)
  const enhancing = enhancingId === entry.id
  const hasAI = !!entry.polished
  const showPolished = hasAI && entry.view === 'polished'
  const text = showPolished ? entry.polished! : entry.raw
  const moodColor = entry.mood?.color ?? NEON
  const preview = text.length > 220 && !expanded ? text.slice(0, 220) + '…' : text

  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        margin: '6px 10px', borderRadius: 12, overflow: 'visible', position: 'relative',
        background: CARD, border: `1px solid ${hov || expanded ? `${moodColor}40` : `${NEON}14`}`,
        boxShadow: expanded ? `0 4px 24px rgba(0,0,0,0.5), 0 0 18px ${moodColor}12` : 'none',
        transition: 'all 0.2s',
      }}>
      {/* Stickers — strewn across the top edge like a paper journal */}
      {(entry.stickers?.length ?? 0) > 0 && (
        <div style={{ position: 'absolute', top: -10, right: 10, display: 'flex', gap: 4, zIndex: 3 }}>
          {entry.stickers!.map((s, i) => <StickerChip key={i} s={s} i={i} size={expanded ? 'md' : 'sm'}/>)}
        </div>
      )}

      <div style={{ padding: '12px 14px 10px', cursor: 'pointer' }} onClick={() => setExpanded(v => !v)}>
        {/* Date row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          {entry.mood?.emoji && (
            <span title={entry.mood.label} style={{ fontSize: 15,
              filter: `drop-shadow(0 0 6px ${moodColor}70)` }}>{entry.mood.emoji}</span>
          )}
          <div style={{ flex: 1 }}>
            <p style={{ fontFamily: FONT, fontSize: 8.5, fontWeight: 800, color: NEON,
              letterSpacing: '0.16em' }}>{fmtStardate(entry.date)}</p>
            <p style={{ fontFamily: FONT, fontSize: 6.5, color: 'rgba(148,163,184,0.45)',
              letterSpacing: '0.08em', marginTop: 1 }}>
              {fmtDay(entry.date).toUpperCase()}
              {entry.mood?.label ? ` · ${entry.mood.label.toUpperCase()}` : ''}
            </p>
          </div>
          {/* Raw/Polished toggle */}
          {hasAI && (
            <div onClick={e => e.stopPropagation()} style={{ display: 'flex', borderRadius: 6, overflow: 'hidden',
              border: `1px solid ${NEON}25`, flexShrink: 0 }}>
              {([['raw', 'RAW'], ['polished', '✨']] as const).map(([v, l]) => (
                <button key={v} onClick={() => onUpdate(entry.id, { view: v })} style={{
                  padding: '3px 8px', fontFamily: FONT, fontSize: 7, fontWeight: 700, cursor: 'pointer',
                  letterSpacing: '0.06em',
                  color: entry.view === v ? NEON : 'rgba(148,163,184,0.35)',
                  background: entry.view === v ? NEON_D : 'transparent',
                }}>{l}</button>
              ))}
            </div>
          )}
        </div>

        {/* Text */}
        <p style={{ fontFamily: FONT, fontSize: 10.5, lineHeight: 1.8, whiteSpace: 'pre-wrap',
          color: showPolished ? 'rgba(255,248,220,0.92)' : 'rgba(235,230,210,0.8)',
          letterSpacing: '0.02em' }}>{preview}</p>

        {/* Themes */}
        {expanded && (entry.themes?.length ?? 0) > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 9 }}>
            {entry.themes!.map(t => (
              <span key={t} style={{ fontFamily: FONT, fontSize: 7, fontWeight: 700, color: `${moodColor}cc`,
                letterSpacing: '0.08em', padding: '2px 7px', borderRadius: 4,
                border: `1px solid ${moodColor}30`, background: `${moodColor}0c` }}>#{t}</span>
            ))}
          </div>
        )}
      </div>

      {/* Captain's debrief */}
      {expanded && entry.reflection && (
        <div style={{ margin: '0 14px 10px', padding: '9px 12px', borderRadius: 9,
          background: RAISED, border: `1px solid ${NEON}1c`, borderLeft: `3px solid ${NEON}60` }}>
          <p style={{ fontFamily: FONT, fontSize: 7, fontWeight: 800, color: `${NEON}80`,
            letterSpacing: '0.18em', marginBottom: 5 }}>🦉 FIRST-OFFICER'S DEBRIEF</p>
          <p style={{ fontFamily: FONT, fontSize: 9.5, lineHeight: 1.7, color: 'rgba(255,240,200,0.7)',
            fontStyle: 'italic' }}>{entry.reflection}</p>
        </div>
      )}

      {/* Actions */}
      {expanded && (
        <div style={{ padding: '8px 14px 12px', display: 'flex', gap: 6, alignItems: 'center',
          borderTop: `1px solid ${FAINT}` }}>
          {!hasAI && (
            <button disabled={enhancing} onClick={() => onEnhance(entry)} style={{
              padding: '5px 12px', borderRadius: 6, cursor: enhancing ? 'default' : 'pointer',
              fontFamily: FONT, fontSize: 8, fontWeight: 800, letterSpacing: '0.08em',
              color: '#1a1503', background: `linear-gradient(135deg, ${NEON}, #ffb700)`,
              border: 'none', boxShadow: `0 2px 10px ${NEON}35`,
            }}>{enhancing ? '🦉 ENHANCING…' : '✨ ENHANCE'}</button>
          )}
          {hasAI && (
            <button disabled={enhancing} onClick={() => onEnhance(entry)} title="Re-run enhancement" style={{
              padding: '5px 10px', borderRadius: 6, cursor: enhancing ? 'default' : 'pointer',
              fontFamily: FONT, fontSize: 8, fontWeight: 700, letterSpacing: '0.06em',
              color: `${NEON}80`, background: 'transparent', border: `1px solid ${NEON}30`,
            }}>{enhancing ? '🦉 …' : '↻ RE-ENHANCE'}</button>
          )}
          <div style={{ flex: 1 }}/>
          <button onClick={() => onDelete(entry.id)} style={{
            fontFamily: FONT, fontSize: 8, color: 'rgba(248,113,113,0.45)', cursor: 'pointer',
            background: 'none', border: 'none', transition: 'color 0.12s' }}
            onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(248,113,113,0.45)'}>burn page</button>
        </div>
      )}
    </div>
  )
}

// ─── Sticker collection sheet ─────────────────────────────────────────────────
function StickerBook({ stickers, onClose }: { stickers: Sticker[]; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxHeight: '70%', overflowY: 'auto',
        background: 'rgba(20,16,4,0.98)', borderTop: `1px solid ${NEON}35`,
        borderTopLeftRadius: 14, borderTopRightRadius: 14, padding: '16px', backdropFilter: 'blur(20px)' }}>
        <p style={{ fontFamily: FONT, fontSize: 9, fontWeight: 900, color: NEON,
          letterSpacing: '0.2em', marginBottom: 4 }}>🎟 STICKER COLLECTION</p>
        <p style={{ fontFamily: FONT, fontSize: 7.5, color: `${NEON}50`, letterSpacing: '0.06em', marginBottom: 14 }}>
          {stickers.length} collected — one for every moment you wrote down
        </p>
        {stickers.length === 0 ? (
          <p style={{ fontFamily: FONT, fontSize: 9, color: 'rgba(148,163,184,0.4)', textAlign: 'center', padding: '20px 0' }}>
            Write and enhance entries to earn stickers ✨</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: '6px 2px 12px' }}>
            {stickers.map((s, i) => <StickerChip key={s.emoji + i} s={s} i={i} size="md"/>)}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main module ──────────────────────────────────────────────────────────────
export default function Journal() {
  const [state, setState] = useState<JournalState>(() => loadJournal())
  const [screen, setScreen] = useState<'log' | 'compose'>('log')
  const [enhancingId, setEnhancingId] = useState<string | null>(null)
  const [composeBusy, setComposeBusy] = useState(false)
  const [error, setError] = useState('')
  const [showStickers, setShowStickers] = useState(false)

  useEffect(() => { saveJournal(state) }, [state])

  const streak = useMemo(() => journalStreak(state), [state])
  const collection = useMemo(() => allStickers(state), [state])
  const hasToday = state.entries.some(e => e.date === todayKey())

  const runEnhance = useCallback(async (id: string, raw: string) => {
    setEnhancingId(id); setError('')
    try {
      const r = await enhanceEntry(raw)
      setState(prev => ({
        entries: prev.entries.map(e => e.id === id ? {
          ...e, polished: r.polished, stickers: r.stickers, mood: r.mood,
          themes: r.themes, reflection: r.reflection,
          enhancedAt: new Date().toISOString(), view: 'polished' as const,
        } : e),
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enhancement failed. Check AI settings.')
    } finally { setEnhancingId(null) }
  }, [])

  const seal = useCallback(async (text: string, enhance: boolean) => {
    const id = crypto.randomUUID()
    const entry = { id, date: todayKey(), createdAt: new Date().toISOString(), raw: text, view: 'raw' as const }
    setState(prev => ({ entries: [entry, ...prev.entries] }))
    if (!enhance) { setScreen('log'); return }
    setComposeBusy(true)
    await runEnhance(id, text)
    setComposeBusy(false)
    setScreen('log')
  }, [runEnhance])

  if (screen === 'compose') {
    return <Composer enhancing={composeBusy}
      onSeal={seal} onCancel={() => setScreen('log')}/>
  }

  return (
    <div className="fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '8px 14px', flexShrink: 0, borderBottom: `1px solid ${NEON}14`,
        background: 'rgba(14,11,2,0.7)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 20, filter: `drop-shadow(0 0 8px ${NEON})` }}>🦉</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: FONT, fontSize: 11, fontWeight: 900, color: NEON,
            letterSpacing: '0.18em', textShadow: `0 0 12px ${NEON}` }}>CAPTAIN'S JOURNAL</p>
          <p style={{ fontFamily: FONT, fontSize: 6.5, color: `${NEON}45`, letterSpacing: '0.12em' }}>
            PERSONAL LOG · WISE HOOT, FIRST OFFICER
          </p>
        </div>
        {streak > 0 && (
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ fontFamily: FONT, fontSize: 13, fontWeight: 900, color: '#ff6b00', lineHeight: 1 }}>{streak}🔥</p>
            <p style={{ fontFamily: FONT, fontSize: 6, color: 'rgba(255,107,0,0.6)', letterSpacing: '0.1em' }}>DAY LOG</p>
          </div>
        )}
        <button onClick={() => setShowStickers(true)} title="Sticker collection" style={{
          height: 28, padding: '0 9px', borderRadius: 7, fontSize: 12, flexShrink: 0,
          color: `${NEON}80`, border: `1px solid ${NEON}25`, background: 'transparent', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4, fontFamily: FONT }}>
          🎟<span style={{ fontSize: 8, fontWeight: 800 }}>{collection.length}</span>
        </button>
        <button onClick={() => setScreen('compose')} style={{
          width: 28, height: 28, borderRadius: 7, fontSize: 15, fontWeight: 700, flexShrink: 0,
          color: NEON, border: `1px solid ${NEON}30`, background: NEON_D, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,215,0,0.2)'}
          onMouseLeave={e => e.currentTarget.style.background = NEON_D}>+</button>
      </div>

      {/* Today CTA */}
      {!hasToday && (
        <button onClick={() => setScreen('compose')} style={{
          margin: '8px 10px 2px', padding: '11px 14px', borderRadius: 9, cursor: 'pointer', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 10,
          background: `linear-gradient(90deg, ${NEON}12, rgba(255,183,0,0.06))`,
          border: `1px solid ${NEON}30`, transition: 'border-color 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.borderColor = `${NEON}55`}
          onMouseLeave={e => e.currentTarget.style.borderColor = `${NEON}30`}>
          <span style={{ fontSize: 16 }}>✍️</span>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <p style={{ fontFamily: FONT, fontSize: 9, fontWeight: 800, color: NEON, letterSpacing: '0.12em' }}>
              TODAY'S PAGE IS BLANK</p>
            <p style={{ fontFamily: FONT, fontSize: 7, color: `${NEON}55`, letterSpacing: '0.04em', marginTop: 1 }}>
              Tell the story of {fmtDay(todayKey())} — the owl is listening</p>
          </div>
          <span style={{ fontFamily: FONT, fontSize: 11, color: `${NEON}60` }}>→</span>
        </button>
      )}

      {error && (
        <div style={{ margin: '6px 10px 0', padding: '8px 10px', borderRadius: 7, flexShrink: 0,
          background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.25)' }}>
          <p style={{ fontFamily: FONT, fontSize: 8.5, color: '#f87171' }}>{error}</p>
        </div>
      )}

      {/* Entries */}
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 8, paddingBottom: 16 }}>
        {state.entries.length === 0 && (
          <div style={{ padding: '40px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 30, marginBottom: 12, filter: `drop-shadow(0 0 12px ${NEON})` }}>🦉</div>
            <p style={{ fontFamily: FONT, fontSize: 'var(--fs-md)', color: `${NEON}30`, marginBottom: 6 }}>
              THE JOURNAL IS EMPTY</p>
            <p style={{ fontFamily: FONT, fontSize: 'var(--fs-xs)', color: `${NEON}20`,
              lineHeight: 1.8, letterSpacing: '0.06em' }}>
              Write your first log. The owl will polish your words,<br/>
              award stickers, and share a thought back.</p>
          </div>
        )}
        {state.entries.map(e => (
          <EntryCard key={e.id} entry={e}
            onUpdate={(id, patch) => setState(prev => ({ entries: prev.entries.map(x => x.id === id ? { ...x, ...patch } : x) }))}
            onDelete={id => setState(prev => deleteEntry(prev, id))}
            onEnhance={en => runEnhance(en.id, en.raw)}
            enhancingId={enhancingId}/>
        ))}
      </div>

      {showStickers && <StickerBook stickers={collection} onClose={() => setShowStickers(false)}/>}
    </div>
  )
}
