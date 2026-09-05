import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { t as tr } from '../../i18n'
import { TIER_META, type NodeTier } from './types'
import { layoutTree, fitScale, NODE_W, NODE_H, BAND_HEAD } from './layout'
import {
  draftToNodes, validateDraft, problemText, blankNode, nodeId,
  type ChainDraft, type DraftNode,
} from './draft'
import { GRANTABLE_TOOLS } from './spine'
import { PERIODS, PERIOD_LABEL } from './anchor'
import { bandColor, bandOf, countdown, daysUntil } from './deadline'
import { loadState as loadScrap7 } from '../scrap7/store'

// ─── THE FORGE — nothing commits until you've read every node ─────────────────
// The guide proposes; this is where the proposal is argued with. A chain leaves
// here only when it is yours: titles, anchors, thresholds, the shape of the tree
// and which chapter each routine belongs to are all editable, and the diagram
// underneath is the exact graph that will commit.
//
// Editing a LIVE uplink runs through the same screen. Routines already carrying
// a habit are marked; dropping one releases the habit rather than deleting it.

const DIM  = 'rgba(148,163,184,0.55)'
const WARN = '#ff6b00'
const GOLD = '#ffd700'

const TIERS: NodeTier[] = [1, 2, 3, 4]

const field: React.CSSProperties = {
  width: '100%', padding: '6px 8px', borderRadius: 6,
  background: 'rgba(2,8,16,0.7)', border: '1px solid rgba(255,255,255,0.09)',
  fontFamily: 'var(--font)', fontSize: 11.5, color: 'rgba(230,242,255,0.92)',
}

const label: React.CSSProperties = {
  fontFamily: 'var(--font)', fontSize: 11, fontWeight: 800,
  letterSpacing: '0.16em', color: 'rgba(148,163,184,0.45)', marginBottom: 4,
}

export function ChainForge({ draft: initial, installedKeys, accent, busy, onCommit, onCancel }: {
  draft:         ChainDraft
  /** Node keys already carrying an ORBIT habit — they can be released, not erased. */
  installedKeys: Set<string>
  accent:        string
  busy?:         boolean
  onCommit:      (draft: ChainDraft) => void
  onCancel:      () => void
}) {
  const [draft, setDraft] = useState<ChainDraft>(initial)
  const [open, setOpen]   = useState<string | null>(null)
  // What is already running, for stacking a new routine onto. Read once: the
  // forge is a modal and nothing installs a habit while it is open.
  const [habits] = useState<{ id: string; text: string }[]>(() => {
    try {
      return loadScrap7().tasks.filter(t => t.taskType === 'habit').map(t => ({ id: t.id, text: t.text }))
    } catch { return [] }
  })

  const problems = useMemo(() => validateDraft(draft), [draft])
  // The preview graph and the band grouping must agree on ids, so both derive
  // from the same goal id — 'draft' for a new uplink, the real one when editing.
  const previewId = draft.goalId ?? 'draft'
  const nodes     = useMemo(() => draftToNodes(draft, previewId), [draft, previewId])
  // Acts are bands. Passing the chapters through is what turns a flat depth grid
  // — the thing that made a proposal read as shapeless — into the story's shape.
  const tree      = useMemo(() => layoutTree(nodes, draft.chapters.map(c => ({
    title: c.title, planned: c.planned === true, nodeIds: c.keys.map(k => nodeId(previewId, k)),
  }))), [nodes, draft.chapters, previewId])

  // Fit the diagram to the panel instead of asking for a wider window.
  const frame = useRef<HTMLDivElement>(null)
  const [avail, setAvail] = useState(0)
  useLayoutEffect(() => { setAvail(frame.current?.clientWidth ?? 0) }, [])
  useEffect(() => {
    const el = frame.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setAvail(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const scale = fitScale(tree.width, avail)
  // Layout reorders nodes by depth, so map the laid-out ids back to draft keys
  const keyOfId  = useMemo(
    () => new Map(nodes.map((n, i) => [n.id, draft.nodes[i].key])), [nodes, draft.nodes])
  const badKeys  = useMemo(
    () => new Set(problems.flatMap(p => 'key' in p ? [p.key] : [])), [problems])

  // ── Node edits ──
  const patchNode = (key: string, patch: Partial<DraftNode>) =>
    setDraft(d => ({ ...d, nodes: d.nodes.map(n => n.key === key ? { ...n, ...patch } : n) }))

  const addNode = (chapterIndex: number) => setDraft(d => {
    const node = blankNode('', d.nodes.map(n => n.key))
    return {
      ...d,
      nodes: [...d.nodes, node],
      chapters: d.chapters.map((c, i) => i === chapterIndex ? { ...c, keys: [...c.keys, node.key] } : c),
    }
  })

  /** Removing a routine also removes every reference to it — a dangling
   *  prerequisite would block the commit on a node the user can no longer see. */
  const removeNode = (key: string) => setDraft(d => ({
    ...d,
    nodes: d.nodes.filter(n => n.key !== key).map(n => ({ ...n, after: n.after.filter(k => k !== key) })),
    chapters: d.chapters.map(c => ({ ...c, keys: c.keys.filter(k => k !== key) })),
  }))

  const moveToChapter = (key: string, index: number) => setDraft(d => ({
    ...d,
    chapters: d.chapters.map((c, i) => ({
      ...c,
      keys: i === index
        ? (c.keys.includes(key) ? c.keys : [...c.keys, key])
        : c.keys.filter(k => k !== key),
    })),
  }))

  const togglePrereq = (key: string, dep: string) => setDraft(d => ({
    ...d,
    nodes: d.nodes.map(n => n.key !== key ? n : {
      ...n,
      after: n.after.includes(dep) ? n.after.filter(k => k !== dep) : [...n.after, dep],
    }),
  }))

  const patchRung = (key: string, i: number, value: string) => setDraft(d => ({
    ...d,
    nodes: d.nodes.map(n => n.key !== key ? n : {
      ...n, ladder: n.ladder.map((r, j) => j === i ? value : r),
    }),
  }))

  const addRung = (key: string) => setDraft(d => ({
    ...d, nodes: d.nodes.map(n => n.key !== key ? n : { ...n, ladder: [...n.ladder, ''] }),
  }))

  const removeRung = (key: string, i: number) => setDraft(d => ({
    ...d, nodes: d.nodes.map(n => n.key !== key ? n : {
      ...n, ladder: n.ladder.length > 1 ? n.ladder.filter((_, j) => j !== i) : n.ladder,
    }),
  }))

  // ── Chapter edits ──
  const patchChapter = (index: number, patch: Partial<ChainDraft['chapters'][number]>) =>
    setDraft(d => ({ ...d, chapters: d.chapters.map((c, i) => i === index ? { ...c, ...patch } : c) }))

  const addChapter = () => setDraft(d => ({
    ...d, chapters: [...d.chapters, { title: `Chapter ${d.chapters.length + 1}`, keys: [], boss: null }],
  }))

  /** A chapter never takes its routines down with it — they fall back one chapter. */
  const removeChapter = (index: number) => setDraft(d => {
    if (d.chapters.length <= 1) return d
    const orphans = d.chapters[index].keys
    const fallback = index === 0 ? 1 : index - 1
    const chapters = d.chapters.map((c, i) => i === fallback ? { ...c, keys: [...c.keys, ...orphans] } : c)
    return { ...d, chapters: chapters.filter((_, i) => i !== index) }
  })

  const editing = !!initial.goalId
  const ready   = problems.length === 0 && !busy

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 80, display: 'flex', flexDirection: 'column',
      background: 'rgba(2,6,12,0.97)', backdropFilter: 'blur(6px)',
    }}>
      {/* Header */}
      <div style={{ flexShrink: 0, padding: '11px 14px', borderBottom: `1px solid ${accent}20` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 900, color: accent,
            letterSpacing: '0.2em', textShadow: `0 0 10px ${accent}80` }}>
            {editing ? tr('EDIT PROTOCOL', 'ПРАВКА ПРОТОКОЛА') : tr('FORGE PROTOCOL', 'КОВКА ПРОТОКОЛА')}
          </p>
          <span style={{ fontFamily: 'var(--font)', fontSize: 11, color: DIM, marginLeft: 'auto' }}>
            {draft.nodes.length} {tr('ROUTINES', 'РУТИН')} · {draft.chapters.length} {tr('CHAPTERS', 'ГЛАВ')}
          </span>
        </div>
        <input value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
          placeholder={tr('UPLINK NAME', 'ИМЯ КАНАЛА')}
          style={{ ...field, marginTop: 8, fontSize: 14.5, fontWeight: 900, letterSpacing: '0.1em',
            color: accent, borderColor: `${accent}35` }} />
        {draft.note && (
          <p style={{ fontFamily: 'var(--font)', fontSize: 10.5, color: 'rgba(200,220,240,0.6)',
            marginTop: 7, lineHeight: 1.6, fontStyle: 'italic' }}>▸ {draft.note}</p>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        {/* The graph as it stands — the same layout the live tree uses */}
        <div ref={frame} style={{ marginBottom: 14 }}>
        {nodes.length > 0 && (
          <div style={{ height: tree.height * scale, marginBottom: 4,
            overflowX: 'auto', overflowY: 'hidden' }}>
            <div style={{ position: 'relative', width: tree.width, height: tree.height,
              transform: `scale(${scale})`, transformOrigin: 'top left',
              margin: scale === 1 ? '0 auto' : undefined }}>
              {/* Act bands — the structure that was in the data and never drawn */}
              {tree.bands.filter(b => b.title).map(b => (
                <div key={b.index} style={{
                  position: 'absolute', left: 0, top: b.y, width: tree.width, height: b.height,
                  borderTop: `1px solid ${b.planned ? 'rgba(148,163,184,0.18)' : `${accent}22`}`,
                  pointerEvents: 'none',
                }}>
                  <span style={{ position: 'absolute', top: 4, left: 0, fontFamily: 'var(--font)',
                    fontSize: 11, fontWeight: 800, letterSpacing: '0.18em',
                    color: b.planned ? 'rgba(148,163,184,0.5)' : `${accent}85` }}>
                    {String(b.index + 1).padStart(2, '0')} {b.title.toUpperCase()}
                  </span>
                  {b.planned && (
                    <span style={{ position: 'absolute', top: BAND_HEAD + 8, left: 0, fontFamily: 'var(--font)',
                      fontSize: 10.5, color: 'rgba(148,163,184,0.4)', letterSpacing: '0.08em' }}>
                      ⊘ {tr('PLANNED — filled when you reach it', 'ЗАПЛАНИРОВАН — заполнится, когда дойдёте')}
                    </span>
                  )}
                </div>
              ))}
              <svg width={tree.width} height={tree.height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                {tree.edges.map(({ from, to }, i) => {
                  const midY = (from.y + NODE_H / 2 + to.y - NODE_H / 2) / 2
                  return (
                    <path key={i} fill="none" stroke={`${accent}70`} strokeWidth={1.3}
                      d={`M ${from.x} ${from.y + NODE_H / 2} L ${from.x} ${midY} L ${to.x} ${midY} L ${to.x} ${to.y - NODE_H / 2}`} />
                  )
                })}
              </svg>
              {tree.placed.map(p => {
                const key = keyOfId.get(p.node.id) ?? ''
                const bad = badKeys.has(key)
                const on  = open === key
                return (
                  <button key={p.node.id} onClick={() => setOpen(on ? null : key)}
                    style={{
                      position: 'absolute', left: p.x - NODE_W / 2, top: p.y - NODE_H / 2,
                      width: NODE_W, height: NODE_H, borderRadius: 10, cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      gap: 3, padding: '6px 8px', textAlign: 'center',
                      background: bad ? `${WARN}12` : `${accent}10`,
                      border: `1px solid ${on ? (bad ? WARN : accent) : `${bad ? WARN : accent}45`}`,
                      boxShadow: on ? `0 0 14px ${(bad ? WARN : accent)}55` : 'none',
                    }}>
                    <span style={{ fontFamily: 'var(--font)', fontSize: 10.5, fontWeight: 700, lineHeight: 1.25,
                      color: 'rgba(230,242,255,0.9)', display: '-webkit-box', WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {p.node.title}
                    </span>
                    <span style={{ fontFamily: 'var(--font)', fontSize: 11, fontWeight: 800,
                      letterSpacing: '0.12em', color: bad ? WARN : `${accent}90` }}>
                      {bad ? tr('NEEDS WORK', 'НЕ ГОТОВО') : TIER_META[p.node.tier].name}
                    </span>
                    {installedKeys.has(key) && (
                      <span style={{ fontFamily: 'var(--font)', fontSize: 11, letterSpacing: '0.1em', color: GOLD }}>
                        ◆ {tr('LIVE', 'АКТИВНА')}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        </div>

        {/* Chapters and their routines */}
        {draft.chapters.map((chapter, ci) => (
          <div key={ci} style={{ marginBottom: 12, padding: '9px 10px', borderRadius: 9,
            background: chapter.planned ? 'rgba(8,16,28,0.28)' : 'rgba(8,16,28,0.5)',
            border: `1px solid ${chapter.planned ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.07)'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 800, color: `${accent}80`,
                letterSpacing: '0.16em', flexShrink: 0 }}>{String(ci + 1).padStart(2, '0')}</span>
              <input value={chapter.title} onChange={e => patchChapter(ci, { title: e.target.value })}
                placeholder={tr('Chapter name', 'Имя главы')}
                style={{ ...field, fontWeight: 800, letterSpacing: '0.06em' }} />
              {draft.chapters.length > 1 && (
                <button onClick={() => removeChapter(ci)} title={tr('remove chapter', 'убрать главу')}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer',
                    color: DIM, fontSize: 13.5, flexShrink: 0, padding: '0 2px' }}>✕</button>
              )}
            </div>

            <div style={{ marginTop: 6 }}>
              <p style={label}>{tr('BREACH — a real, datable event (optional)', 'ПРОРЫВ — реальное событие с датой (необяз.)')}</p>
              <input value={chapter.boss ?? ''} onChange={e => patchChapter(ci, { boss: e.target.value || null })}
                placeholder={tr('e.g. A self-tape shot and submitted', 'напр. Самопроба снята и отправлена')}
                style={field} />
              {/* The date appears only once the event does. An empty breach with
                  a deadline is a date for nothing, and the store drops it anyway. */}
              {chapter.boss?.trim() && (
                <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="date" value={chapter.due ?? ''}
                    onChange={e => patchChapter(ci, { due: e.target.value || null })}
                    style={{ ...field, width: 148, flex: '0 0 auto', colorScheme: 'dark' }} />
                  <span style={{ fontFamily: 'var(--font)', fontSize: 10, letterSpacing: '0.08em',
                    color: chapter.due ? bandColor(bandOf(daysUntil(chapter.due) ?? 0)) : DIM }}>
                    {chapter.due
                      ? tr(countdown(chapter.due)?.en ?? '', countdown(chapter.due)?.ru ?? '')
                      : tr('NO DATE — the schedule check needs one', 'БЕЗ ДАТЫ — без неё нечего сверять')}
                  </span>
                </div>
              )}
            </div>

            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {/* A planned act is empty on purpose. It says so rather than
                  looking like a chapter someone forgot to fill in — and the
                  ROUTINE button below still works, because refusing to let you
                  write it yourself would be worse than the wall it replaces. */}
              {chapter.planned && chapter.keys.length === 0 && (
                <p style={{ fontFamily: 'var(--font)', fontSize: 10.5, lineHeight: 1.6,
                  color: 'rgba(148,163,184,0.5)', padding: '2px 0 4px' }}>
                  ⊘ {tr('PLANNED — its routines are written when you reach this act, against the scores you actually have by then.',
                        'ЗАПЛАНИРОВАН — рутины пишутся, когда вы дойдёте до акта, с учётом реальных показателей.')}
                </p>
              )}
              {chapter.keys.map(key => {
                const node = draft.nodes.find(n => n.key === key)
                if (!node) return null
                return (
                  <NodeEditor key={key} node={node} draft={draft} accent={accent}
                    habits={habits}
                    chapterIndex={ci}
                    live={installedKeys.has(key)}
                    flagged={badKeys.has(key)}
                    expanded={open === key}
                    onToggle={() => setOpen(open === key ? null : key)}
                    onPatch={patch => patchNode(key, patch)}
                    onRemove={() => { removeNode(key); if (open === key) setOpen(null) }}
                    onMoveChapter={i => moveToChapter(key, i)}
                    onTogglePrereq={dep => togglePrereq(key, dep)}
                    onRung={(i, v) => patchRung(key, i, v)}
                    onAddRung={() => addRung(key)}
                    onRemoveRung={i => removeRung(key, i)} />
                )
              })}

              <button onClick={() => addNode(ci)} style={{
                padding: '6px', borderRadius: 6, cursor: 'pointer', background: 'transparent',
                border: `1px dashed ${accent}35`, fontFamily: 'var(--font)', fontSize: 10,
                fontWeight: 700, letterSpacing: '0.12em', color: `${accent}90`,
              }}>+ {tr('ROUTINE', 'РУТИНА')}</button>
            </div>
          </div>
        ))}

        <button onClick={addChapter} style={{
          width: '100%', padding: '7px', borderRadius: 7, cursor: 'pointer', background: 'transparent',
          border: '1px dashed rgba(255,255,255,0.14)', fontFamily: 'var(--font)', fontSize: 10,
          fontWeight: 700, letterSpacing: '0.14em', color: DIM,
        }}>+ {tr('CHAPTER', 'ГЛАВА')}</button>
      </div>

      {/* Footer — what's still wrong, then the commit */}
      <div style={{ flexShrink: 0, padding: '10px 14px', borderTop: `1px solid ${accent}18`,
        background: 'rgba(2,8,14,0.8)' }}>
        {problems.length > 0 && (
          <div style={{ maxHeight: 84, overflowY: 'auto', marginBottom: 8,
            display: 'flex', flexDirection: 'column', gap: 2 }}>
            {problems.slice(0, 8).map((p, i) => {
              const text = problemText(p, draft)
              return (
                <p key={i} style={{ fontFamily: 'var(--font)', fontSize: 10, color: `${WARN}c0` }}>
                  ⊘ {tr(text.en, text.ru)}
                </p>
              )
            })}
            {problems.length > 8 && (
              <p style={{ fontFamily: 'var(--font)', fontSize: 10, color: DIM }}>
                +{problems.length - 8} {tr('more', 'ещё')}
              </p>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={{
            padding: '9px 14px', borderRadius: 8, cursor: 'pointer', background: 'transparent',
            border: '1px solid rgba(255,255,255,0.12)', fontFamily: 'var(--font)', fontSize: 11,
            fontWeight: 700, letterSpacing: '0.12em', color: DIM,
          }}>{tr('DISCARD', 'ОТМЕНА')}</button>

          <button onClick={() => ready && onCommit(draft)} disabled={!ready} style={{
            flex: 1, padding: '9px', borderRadius: 8, cursor: ready ? 'pointer' : 'default',
            fontFamily: 'var(--font)', fontSize: 12, fontWeight: 900, letterSpacing: '0.16em',
            color: ready ? '#02121a' : 'rgba(148,163,184,0.35)',
            background: ready ? `linear-gradient(135deg, ${accent}, ${accent}b0)` : 'transparent',
            border: `1px solid ${ready ? 'transparent' : 'rgba(255,255,255,0.1)'}`,
            boxShadow: ready ? `0 0 18px ${accent}45` : 'none',
          }}>
            {busy ? tr('WORKING…', 'РАБОТА…')
              : editing ? tr('SAVE PROTOCOL', 'СОХРАНИТЬ ПРОТОКОЛ')
              : tr('COMMIT UPLINK', 'СОЗДАТЬ КАНАЛ')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── One routine ──────────────────────────────────────────────────────────────

// ─── The anchor ───────────────────────────────────────────────────────────────
// Three taps, no typing. It used to be one text box carrying an event, a weekday
// set and a clock time at once — and nothing read it: the timeline guessed when
// to schedule a routine by regex-matching keywords in its title, so the sentence
// you wrote was displayed and then thrown away.
//
// Each of the three produces a placement ORBIT can actually obey, which is why
// rule 18 survives intact: "3x a week" is still unsayable here.

function AnchorPicker({ node, accent, habits, onPatch }: {
  node:   DraftNode
  accent: string
  /** Habits already running, for stacking onto. */
  habits: { id: string; text: string }[]
  onPatch: (patch: Partial<DraftNode>) => void
}) {
  const kind = node.anchor?.kind ?? (node.cue.trim() ? 'legacy' : 'none')

  const tab = (on: boolean): React.CSSProperties => ({
    flex: 1, padding: '6px 4px', borderRadius: 6, cursor: 'pointer',
    fontFamily: 'var(--font)', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.1em',
    color: on ? '#02121a' : DIM,
    background: on ? accent : 'transparent',
    border: `1px solid ${on ? accent : 'rgba(255,255,255,0.12)'}`,
  })

  return (
    <div>
      <p style={label}>{tr('ANCHOR — when it happens', 'ЯКОРЬ — когда происходит')}</p>

      <div style={{ display: 'flex', gap: 4 }}>
        <button style={tab(kind === 'after')} disabled={habits.length === 0}
          title={habits.length === 0 ? tr('nothing running to stack onto yet', 'пока не на что опереться') : ''}
          onClick={() => onPatch({ anchor: { kind: 'after', taskId: habits[0]?.id ?? '' } })}>
          {tr('AFTER', 'ПОСЛЕ')}
        </button>
        <button style={tab(kind === 'at')}
          onClick={() => onPatch({ anchor: { kind: 'at', time: '19:00' } })}>
          {tr('AT', 'В')}
        </button>
        <button style={tab(kind === 'period')}
          onClick={() => onPatch({ anchor: { kind: 'period', period: 'morning' } })}>
          {tr('ORBIT PLACES IT', 'ORBIT РЕШИТ')}
        </button>
      </div>

      {node.anchor?.kind === 'after' && (
        <select value={node.anchor.taskId} style={{ ...field, marginTop: 5, appearance: 'none' }}
          onChange={e => onPatch({ anchor: { kind: 'after', taskId: e.target.value } })}>
          {habits.map(h => <option key={h.id} value={h.id}>{h.text}</option>)}
        </select>
      )}

      {node.anchor?.kind === 'at' && (
        <input type="time" value={node.anchor.time} style={{ ...field, marginTop: 5 }}
          onChange={e => onPatch({ anchor: { kind: 'at', time: e.target.value } })} />
      )}

      {node.anchor?.kind === 'period' && (
        <>
          <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
            {PERIODS.map(p => {
              const on = node.anchor?.kind === 'period' && node.anchor.period === p
              return (
                <button key={p} onClick={() => onPatch({ anchor: { kind: 'period', period: p } })}
                  title={PERIOD_LABEL[p].hint}
                  style={{ ...tab(on), flex: 'none', padding: '5px 9px', fontSize: 10 }}>
                  {tr(PERIOD_LABEL[p].en, PERIOD_LABEL[p].ru)}
                </button>
              )
            })}
          </div>
          <p style={{ fontFamily: 'var(--font)', fontSize: 10.5, color: DIM, marginTop: 4, lineHeight: 1.5 }}>
            {tr('ORBIT finds the slot in your real free time, around meals and work.',
                'ORBIT найдёт место в реальном свободном времени, вокруг еды и работы.')}
          </p>
        </>
      )}

      {/* A protocol written before anchors were structured keeps its sentence
          until it is replaced — nothing already running loses its cue. */}
      {kind === 'legacy' && (
        <p style={{ fontFamily: 'var(--font)', fontSize: 10.5, color: DIM, marginTop: 5, lineHeight: 1.5 }}>
          ▸ {node.cue} — {tr('pick one above to let ORBIT schedule it', 'выберите выше, чтобы ORBIT его расставил')}
        </p>
      )}
      {kind === 'none' && (
        <p style={{ fontFamily: 'var(--font)', fontSize: 10.5, color: `${WARN}c0`, marginTop: 5 }}>
          ⊘ {tr('a routine without an anchor does not automate', 'рутина без якоря не автоматизируется')}
        </p>
      )}

      <div style={{ marginTop: 7 }}>
        <p style={label}>{tr('HOW LONG — minutes', 'СКОЛЬКО — минут')}</p>
        <input type="number" min={5} max={240} step={5} value={node.minutes ?? 20}
          onChange={e => onPatch({ minutes: Math.max(5, Math.min(240, Number(e.target.value) || 20)) })}
          style={{ ...field, width: 90 }} />
      </div>
    </div>
  )
}

function NodeEditor({
  node, draft, accent, habits, chapterIndex, live, flagged, expanded,
  onToggle, onPatch, onRemove, onMoveChapter, onTogglePrereq, onRung, onAddRung, onRemoveRung,
}: {
  node:           DraftNode
  draft:          ChainDraft
  accent:         string
  habits:         { id: string; text: string }[]
  chapterIndex:   number
  live:           boolean
  flagged:        boolean
  expanded:       boolean
  onToggle:       () => void
  onPatch:        (patch: Partial<DraftNode>) => void
  onRemove:       () => void
  onMoveChapter:  (index: number) => void
  onTogglePrereq: (dep: string) => void
  onRung:         (i: number, value: string) => void
  onAddRung:      () => void
  onRemoveRung:   (i: number) => void
}) {
  const [confirmRemove, setConfirmRemove] = useState(false)
  const tier = TIER_META[node.tier]

  const chip = (on: boolean): React.CSSProperties => ({
    padding: '3px 7px', borderRadius: 5, cursor: 'pointer', fontFamily: 'var(--font)',
    fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em',
    color: on ? '#02121a' : DIM,
    background: on ? accent : 'transparent',
    border: `1px solid ${on ? accent : 'rgba(255,255,255,0.12)'}`,
  })

  return (
    <div style={{ borderRadius: 7, background: 'rgba(3,10,20,0.6)',
      border: `1px solid ${flagged ? `${WARN}45` : 'rgba(255,255,255,0.07)'}` }}>
      {/* Collapsed row */}
      <button onClick={onToggle} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 7, padding: '7px 9px',
        background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
      }}>
        <span style={{ fontSize: 10.5, color: expanded ? accent : DIM, flexShrink: 0 }}>{expanded ? '▾' : '▸'}</span>
        <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 700,
          color: 'rgba(230,242,255,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.title.trim() || tr('untitled routine', 'рутина без имени')}
        </span>
        {live && <span style={{ fontFamily: 'var(--font)', fontSize: 11, color: GOLD, flexShrink: 0 }}>◆</span>}
        <span style={{ fontFamily: 'var(--font)', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
          color: `${accent}80`, flexShrink: 0 }}>{tier.name}</span>
      </button>

      {expanded && (
        <div style={{ padding: '0 9px 9px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <p style={label}>{tr('ROUTINE', 'РУТИНА')}</p>
            <input value={node.title} onChange={e => onPatch({ title: e.target.value })}
              placeholder={tr('Reading aloud', 'Чтение вслух')} style={field} />
          </div>

          <AnchorPicker node={node} accent={accent} habits={habits} onPatch={onPatch} />

          <div>
            <p style={label}>{tr('COMPLEXITY', 'СЛОЖНОСТЬ')}</p>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {TIERS.map(t => (
                <button key={t} onClick={() => onPatch({ tier: t })} title={TIER_META[t].profile}
                  style={chip(node.tier === t)}>{TIER_META[t].name}</button>
              ))}
            </div>
            <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: DIM, marginTop: 4 }}>
              {tier.profile} · ≈{tier.baselineDays}{tr('d to automatic', 'д до автоматизма')}
            </p>
          </div>

          <div>
            <p style={label}>{tr('THRESHOLDS — smallest first', 'ПОРОГИ — от малого')}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {node.ladder.map((rung, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: DIM, width: 12, flexShrink: 0 }}>
                    {i + 1}
                  </span>
                  <input value={rung} onChange={e => onRung(i, e.target.value)}
                    placeholder={tr('30 min', '30 мин')} style={field} />
                  {node.ladder.length > 1 && (
                    <button onClick={() => onRemoveRung(i)} style={{ background: 'transparent', border: 'none',
                      cursor: 'pointer', color: DIM, fontSize: 12.5, flexShrink: 0 }}>✕</button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={onAddRung} style={{ ...chip(false), marginTop: 5 }}>+ {tr('RUNG', 'СТУПЕНЬ')}</button>
          </div>

          <div>
            <p style={label}>{tr('REQUIRES — automatic first', 'ТРЕБУЕТ — сначала на автомат')}</p>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {draft.nodes.filter(n => n.key !== node.key).map(n => (
                <button key={n.key} onClick={() => onTogglePrereq(n.key)} style={chip(node.after.includes(n.key))}>
                  {n.title.trim() || n.key}
                </button>
              ))}
              {draft.nodes.length <= 1 && (
                <span style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: DIM }}>
                  {tr('nothing else to require yet', 'пока нечего требовать')}
                </span>
              )}
            </div>
          </div>

          <div>
            <p style={label}>{tr('GRANTS INSTRUMENT', 'ДАЁТ ИНСТРУМЕНТ')}</p>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <button onClick={() => onPatch({ toolId: null })} style={chip(node.toolId === null)}>
                {tr('NONE', 'НЕТ')}
              </button>
              {GRANTABLE_TOOLS.map(t => (
                <button key={t} onClick={() => onPatch({ toolId: node.toolId === t ? null : t })}
                  style={chip(node.toolId === t)}>{t.toUpperCase()}</button>
              ))}
            </div>
          </div>

          <div>
            <p style={label}>{tr('CHAPTER', 'ГЛАВА')}</p>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {draft.chapters.map((c, i) => (
                <button key={i} onClick={() => onMoveChapter(i)} style={chip(i === chapterIndex)}>
                  {String(i + 1).padStart(2, '0')} {c.title.trim() || '—'}
                </button>
              ))}
            </div>
          </div>

          {/* Removal. A live routine's habit outlives the chain it was part of. */}
          {!confirmRemove ? (
            <button onClick={() => setConfirmRemove(true)} style={{
              alignSelf: 'flex-start', padding: '4px 8px', borderRadius: 5, cursor: 'pointer',
              background: 'transparent', border: `1px solid ${WARN}30`, fontFamily: 'var(--font)',
              fontSize: 11.5, fontWeight: 700, letterSpacing: '0.1em', color: `${WARN}b0`,
            }}>✕ {tr('REMOVE', 'УДАЛИТЬ')}</button>
          ) : (
            <div style={{ padding: '7px 9px', borderRadius: 6, background: `${WARN}0e`,
              border: `1px solid ${WARN}35` }}>
              <p style={{ fontFamily: 'var(--font)', fontSize: 10, color: `${WARN}d0`, lineHeight: 1.6 }}>
                {live
                  ? tr('This routine has a habit with real history. Removing it moves the habit to LIFE SUPPORT — score and streak intact. Nothing is deleted.',
                       'У этой рутины есть привычка с реальной историей. Удаление переместит её в ЖИЗНЕОБЕСПЕЧЕНИЕ — счёт и серия сохранятся. Ничего не удаляется.')
                  : tr('Remove this routine from the protocol?', 'Убрать рутину из протокола?')}
              </p>
              <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                <button onClick={onRemove} style={{ ...chip(false), color: WARN, borderColor: `${WARN}55` }}>
                  {live ? tr('RELEASE IT', 'ОТПУСТИТЬ') : tr('REMOVE', 'УДАЛИТЬ')}
                </button>
                <button onClick={() => setConfirmRemove(false)} style={chip(false)}>
                  {tr('KEEP', 'ОСТАВИТЬ')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
