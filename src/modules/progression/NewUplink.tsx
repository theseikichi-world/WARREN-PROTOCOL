import { useCallback, useEffect, useRef, useState } from 'react'
import { t as tr } from '../../i18n'
import { loadSettings } from '../../settings'
import { loadLogState, saveLogState, setDreamRead, setDreamInterview } from '../log/store'
import type { Dream } from '../log/types'
import { loadProgression, saveProgression, syncChain, commitDraft } from './store'
import { blankDraft, type ChainDraft } from './draft'
import {
  askInterview, readDream, readToDraft, normalizeRead,
  type Interview, type DreamRead,
} from './spine'
import { matchShape, shapeToRead } from './shapes'
import { operatorRecord, recordBrief } from './record'
import { loadState as loadScrap7 } from '../scrap7/store'
import { ChainForge } from './ChainForge'
import { InterviewPanel } from './InterviewPanel'

// ─── Where an uplink comes from ───────────────────────────────────────────────
// Dreams are unlimited; bandwidth is two. This is the narrowing, and it is a
// decision the user makes three ways:
//
//   FROM A DREAM   the guide reads a dream from PATHFINDER and proposes a chain
//   FROM A TEMPLATE  the two reference chains, now a starting point you edit
//   BLANK          nothing proposed, nothing assumed
//
// Every path lands in the same forge, and nothing exists until it commits there.

const DIM  = 'rgba(148,163,184,0.55)'
const WARN = '#ff6b00'

type Stage =
  | { kind: 'picker' }
  | { kind: 'asking';    dream: Dream }
  | { kind: 'interview'; dream: Dream; interview: Interview }
  | { kind: 'proposing'; dream: Dream }
  | { kind: 'forge';     draft: ChainDraft }

/**
 * The guide's read, or the shape's when there is no guide to ask.
 *
 * A dream matched to a shape always has a spine: real acts, real pressure, and
 * the datable proofs that end them. What it does not have is routines — those
 * are specific to one person's week, and inventing generic ones would be
 * filling the screen rather than helping. You write them in the forge, or the
 * guide does once it has a key.
 *
 * A dream matching no shape and no key is the one case with nothing to offer,
 * and it says so rather than opening an empty editor.
 */
async function readOrShape(
  d: Dream, interview: Interview | null, record: string,
): Promise<DreamRead> {
  try {
    return await readDream(d, { interview, record })
  } catch (e) {
    const shape = matchShape(d)
    if (!shape) throw e
    return normalizeRead(shapeToRead(shape, d), d)
  }
}

export function NewUplink({ accent, dream, onClose, onCommitted }: {
  accent: string
  /** Skip the picker and go straight to proposing for this dream. */
  dream?: Dream | null
  onClose: () => void
  onCommitted: (goalId: string, title: string) => void
}) {
  const [stage, setStage] = useState<Stage>(() => dream ? { kind: 'proposing', dream } : { kind: 'picker' })
  const [error, setError] = useState('')

  /** Real tracking, not self-report — what stuck, what is being dragged, what stopped. */
  const record = useCallback(() => recordBrief(operatorRecord(loadScrap7().tasks)), [])

  /** Stage two: the spine, written with everything the guide now knows. */
  const propose = useCallback(async (d: Dream, interview: Interview | null) => {
    setError('')
    setStage({ kind: 'proposing', dream: d })
    try {
      const read = await readOrShape(d, interview, record())
      // One read, both surfaces. The spine goes to the forge and the same read
      // is persisted on the dream, so the shelf in UPLINKS holds the tasks,
      // basics and proofs the protocol has no room for. They used to be separate
      // calls that never met, and only one was connected to anything.
      saveLogState(setDreamRead(loadLogState(), d.id, read))
      window.dispatchEvent(new CustomEvent('warren:sync', { detail: { source: 'uplinks' } }))
      // Habits already running, so a proposed "straight after reading aloud"
      // resolves to that actual routine rather than staying as prose.
      const habits = loadScrap7().tasks
        .filter(t => t.taskType === 'habit')
        .map(t => ({ id: t.id, text: t.text }))
      setStage({ kind: 'forge', draft: readToDraft(read, d, habits) })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStage({ kind: 'picker' })
    }
  }, [record])

  /**
   * Stage one: the guide asks. It reads the dream and the record first, so the
   * questions are about this dream specifically and can name a routine that
   * already died rather than asking in general.
   *
   * A failure here is not fatal — the interview is what makes the spine sharper,
   * not what makes it possible, so the plan is still written without it.
   */
  const begin = useCallback(async (d: Dream) => {
    setError('')
    // No key means no interview to have. Going straight to the shape skips two
    // calls that would only fail, and lands you on a real spine either way.
    if (!loadSettings().aiApiKey) { void propose(d, null); return }
    setStage({ kind: 'asking', dream: d })
    try {
      const interview = await askInterview(d, record())
      if (interview.questions.length === 0) { void propose(d, null); return }
      saveLogState(setDreamInterview(loadLogState(), d.id, interview))
      setStage({ kind: 'interview', dream: d, interview })
    } catch {
      void propose(d, null)
    }
  }, [propose, record])

  /** Answers are kept before the spine is written, so a re-read never re-asks. */
  const answered = useCallback((d: Dream, interview: Interview, answers: Record<string, string>) => {
    const filled: Interview = { ...interview, answers, answeredAt: new Date().toISOString() }
    saveLogState(setDreamInterview(loadLogState(), d.id, filled))
    void propose(d, filled)
  }, [propose])

  // Entering with a dream starts the call itself — the picker never renders.
  //
  // Guarded by dream id rather than a bare effect: StrictMode double-invokes
  // effects in development, and this one spends money. Same family as rule 37 —
  // an effect that starts real work must not start it twice.
  const started = useRef<string | null>(null)
  useEffect(() => {
    if (!dream || started.current === dream.id) return
    started.current = dream.id
    void begin(dream)
  }, [dream, begin])

  const commit = (draft: ChainDraft) => {
    const res = commitDraft(loadProgression(), draft)
    saveProgression(syncChain(res.state))
    window.dispatchEvent(new CustomEvent('warren:sync', { detail: { source: 'uplinks' } }))
    onCommitted(res.goalId, draft.title.trim())
  }

  if (stage.kind === 'forge') {
    return <ChainForge draft={stage.draft} installedKeys={new Set()} accent={accent}
      onCommit={commit} onCancel={dream ? onClose : () => setStage({ kind: 'picker' })} />
  }

  if (stage.kind === 'interview') {
    return <InterviewPanel interview={stage.interview} accent={accent} dreamTitle={stage.dream.title}
      onDone={answers => answered(stage.dream, stage.interview, answers)}
      onCancel={onClose} />
  }

  if (stage.kind === 'asking' || stage.kind === 'proposing') {
    return <Working accent={accent} title={stage.dream.title} phase={stage.kind} onCancel={onClose} />
  }

  return <Picker accent={accent} error={error} onClose={onClose}
    onDream={begin}
    onDraft={draft => setStage({ kind: 'forge', draft })} />
}

// ─── The picker ───────────────────────────────────────────────────────────────

function Picker({ accent, error, onClose, onDream, onDraft }: {
  accent:  string
  error:   string
  onClose: () => void
  onDream: (d: Dream) => void
  onDraft: (draft: ChainDraft) => void
}) {
  const [dreams] = useState<Dream[]>(() => loadLogState().dreams)
  const [taken]  = useState<Set<string>>(() =>
    new Set(loadProgression().goals.map(g => g.sourceDreamId).filter((id): id is string => !!id)))
  const hasKey = !!loadSettings().aiApiKey

  const section: React.CSSProperties = {
    fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 800,
    letterSpacing: '0.2em', color: `${accent}80`, margin: '16px 0 7px',
  }
  const card: React.CSSProperties = {
    width: '100%', textAlign: 'left', padding: '9px 11px', borderRadius: 8, cursor: 'pointer',
    background: 'rgba(8,16,28,0.55)', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 5,
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', flexDirection: 'column',
      background: 'rgba(2,6,12,0.97)', backdropFilter: 'blur(6px)' }}>
      <div style={{ flexShrink: 0, padding: '11px 14px', borderBottom: `1px solid ${accent}20`,
        display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 900, color: accent,
            letterSpacing: '0.2em', textShadow: `0 0 10px ${accent}80` }}>{tr('NEW UPLINK', 'НОВЫЙ КАНАЛ')}</p>
          <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: DIM, marginTop: 3 }}>
            {tr('Dreams are unlimited. Bandwidth is two.', 'Мечты бесконечны. Каналов — два.')}
          </p>
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer',
          color: DIM, fontSize: 15.5 }}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 14px 16px' }}>
        {error && (
          <p style={{ fontFamily: 'var(--font)', fontSize: 10, color: WARN, marginTop: 12,
            padding: '7px 9px', borderRadius: 6, background: `${WARN}0e`, border: `1px solid ${WARN}35` }}>
            ⊘ {error}
          </p>
        )}

        <p style={section}>{tr('FROM A DREAM', 'ИЗ МЕЧТЫ')}</p>
        {dreams.length === 0 && (
          <p style={{ fontFamily: 'var(--font)', fontSize: 10.5, color: DIM, lineHeight: 1.6 }}>
            {tr('No dreams yet. Write one on the DREAMS tab first — the guide reads it to propose a protocol.',
                'Мечт пока нет. Запишите одну во вкладке МЕЧТЫ — гид прочтёт её и предложит протокол.')}
          </p>
        )}
        {dreams.map(d => {
          const promoted = taken.has(d.id)
          return (
            <div key={d.id} style={{ ...card, opacity: promoted ? 0.5 : 1, cursor: 'default' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font)', fontSize: 12, fontWeight: 800,
                  color: 'rgba(230,242,255,0.9)', overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap' }}>{d.title}</span>
                <span style={{ fontFamily: 'var(--font)', fontSize: 11, color: DIM, flexShrink: 0 }}>
                  {d.category} · {d.missions.length}{tr('m', 'м')}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 5, marginTop: 7 }}>
                {promoted ? (
                  <span style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: `${accent}90` }}>
                    ◆ {tr('already an uplink', 'уже канал')}
                  </span>
                ) : (
                  <>
                    <button onClick={() => onDream(d)} disabled={!hasKey} style={{
                      padding: '5px 10px', borderRadius: 6, cursor: hasKey ? 'pointer' : 'default',
                      fontFamily: 'var(--font)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                      color: hasKey ? '#02121a' : 'rgba(148,163,184,0.3)',
                      background: hasKey ? accent : 'transparent',
                      border: `1px solid ${hasKey ? accent : 'rgba(255,255,255,0.1)'}`,
                    }}>◈ {tr('GUIDE PROPOSES', 'ГИД ПРЕДЛОЖИТ')}</button>
                    <button onClick={() => onDraft({
                      ...blankDraft(d.title.toUpperCase()), sourceDreamId: d.id,
                    })} style={{
                      padding: '5px 10px', borderRadius: 6, cursor: 'pointer', background: 'transparent',
                      border: '1px solid rgba(255,255,255,0.12)', fontFamily: 'var(--font)', fontSize: 10,
                      fontWeight: 700, letterSpacing: '0.1em', color: DIM,
                    }}>{tr('BY HAND', 'ВРУЧНУЮ')}</button>
                  </>
                )}
              </div>
            </div>
          )
        })}
        {dreams.length > 0 && !hasKey && (
          <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: DIM, marginTop: 4 }}>
            {tr('No API key in Settings — the guide can\'t propose. Building by hand works either way.',
                'В настройках нет API-ключа — гид не сможет предложить. Вручную работает всегда.')}
          </p>
        )}

        {/* A template path used to sit here, offering two hand-written chains.
            An uplink comes from a dream now: someone else's goals were never
            going to be yours, and a blank protocol with no dream behind it is
            a goal you never actually chose. Both paths are gone on purpose. */}
      </div>
    </div>
  )
}

// ─── Waiting on the guide ─────────────────────────────────────────────────────

function Working({ accent, title, phase, onCancel }: {
  accent: string
  title:  string
  /** Two calls happen before the forge, and they are waiting for different things. */
  phase:  'asking' | 'proposing'
  onCancel: () => void
}) {
  const asking = phase === 'asking'
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24,
      background: 'rgba(2,6,12,0.97)', backdropFilter: 'blur(6px)' }}>
      <p style={{ fontFamily: 'var(--font)', fontSize: 12.5, fontWeight: 900, color: accent,
        letterSpacing: '0.2em', textShadow: `0 0 12px ${accent}`, animation: 'pulse 1.8s ease-in-out infinite' }}>
        {asking ? tr('THE GUIDE IS READING', 'ГИД ЧИТАЕТ') : tr('THE GUIDE IS PLANNING', 'ГИД СОСТАВЛЯЕТ ПЛАН')}
      </p>
      <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: 'rgba(230,242,255,0.8)', textAlign: 'center' }}>
        {title}
      </p>
      <p style={{ fontFamily: 'var(--font)', fontSize: 10, color: DIM, textAlign: 'center', maxWidth: 280,
        lineHeight: 1.7 }}>
        {asking
          ? tr('It reads the dream and your record first, then asks for what it still needs. A plan written on guesses is a plan you cannot run.',
               'Он читает мечту и вашу историю, затем спросит недостающее. План на догадках — план, который не выполнить.')
          : tr('It lays out the acts, and fills the first one. Nothing is created until you have read every routine and committed it yourself.',
               'Он разложит акты и заполнит первый. Ничего не создаётся, пока вы не прочтёте каждую рутину и не подтвердите сами.')}
      </p>
      <button onClick={onCancel} style={{ marginTop: 6, padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
        background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', fontFamily: 'var(--font)',
        fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em', color: DIM }}>
        {tr('CANCEL', 'ОТМЕНА')}
      </button>
    </div>
  )
}
