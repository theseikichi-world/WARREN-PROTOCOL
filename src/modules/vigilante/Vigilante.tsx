import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { t as tr, plural, getLocale } from '../../i18n'
import { play as playCue } from '../../sound'
import {
  HOLD_BY_ID, buildPhases, specHoldSeconds, clock, holdsAt, holdSecFor,
  TIERS, TIER_ORDER, BOSS_SEC, STEP_SEC, SESSIONS_PER_STAGE, PULLUP_UNLOCK_STAGE,
  maxStage, toNextStage, bossBeaten, stageFrom,
  type Phase,
} from './types'
import {
  loadState, saveState, setSpec, setMusicName, logSession,
  clampSec, clampRounds, clampLeadIn, deriveVigilante, setVoiceOn,
  setTier, currentStage, finishedCount, setHabit,
} from './store'
import { LocalAudio } from './music'
import { installTrainingHabit, DEFAULT_DAYS, type WhenChoice } from './schedule'
import { trackFromList } from '../progression/store'
import { loadState as loadScrap7 } from '../scrap7/store'
import { habitDoneToday } from '../scrap7/store'
import { WEEKDAYS } from '../scrap7/types'
import { PERIOD_LABEL } from '../progression/anchor'
import type { Period } from '../infinity8/store'
import { saveTrack, loadTrack } from './musicStore'
import { speak, silence, cueFor, countdownAt, prepareCue, voiceSupported, type Cue } from './voice'

const NEON = '#6366f1'
const WORK = '#ff3b6b'   // the hold — the colour you learn to dread
const REST = '#4ade80'
const READY = '#facc15'

/** A cue becomes words here, so the corner man speaks whatever language the app is in. */
function say(cue: Cue, nameOf: (id: string) => string): string {
  switch (cue.kind) {
    case 'ready':
      return tr(`Get into position. ${nameOf(cue.holdId)}.`,
                `Займите позицию. ${nameOf(cue.holdId)}.`)
    case 'work':
      return cue.named
        ? tr(`${nameOf(cue.holdId)}. Hold.`, `${nameOf(cue.holdId)}. Держите.`)
        : tr(`Round ${cue.round}. Hold.`,    `Круг ${cue.round}. Держите.`)
    case 'rest':
      return cue.nextHoldId
        ? tr(`Rest. Next: ${nameOf(cue.nextHoldId)}.`, `Отдых. Далее: ${nameOf(cue.nextHoldId)}.`)
        : tr('Rest.', 'Отдых.')
    case 'prepare':
      return tr(`Get set. ${nameOf(cue.holdId)}.`, `Приготовьтесь. ${nameOf(cue.holdId)}.`)
    case 'done':
      return tr('Session complete.', 'Сессия завершена.')
  }
}

/** The card that closes a session. Held on screen until dismissed, not flashed. */
interface Verdict {
  heldSec:   number
  doneWork:  number
  totalWork: number
  finished:  boolean
  /** Stage the session bought, if it bought one. */
  stageUp:   number | null
}

/** Running clock. Driven off wall time, never off a decrementing counter. */
interface Running {
  index:     number      // which phase
  endsAt:    number      // epoch ms this phase ends
  remaining: number      // seconds left, for display
  paused:    boolean
  startedAt: string
  heldSec:   number      // time under tension banked so far
  doneWork:  number
}

export default function Vigilante() {
  const [state, setState] = useState(() => loadState())
  const [run, setRun]     = useState<Running | null>(null)
  const [music, setMusic] = useState<LocalAudio | null>(null)
  const [flash, setFlash] = useState('')
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [marked, setMarked]   = useState(false)
  const [pickDays, setPickDays] = useState<string[]>(DEFAULT_DAYS)
  const [pickWhen, setPickWhen] = useState<WhenChoice>('auto')

  const tick = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  /** Mirrors `run` so the interval can check expiry without a state updater. */
  const runRef = useRef<Running | null>(null)
  /** Last second already counted down, so a 200ms tick says "three" once. */
  const spokenSec = useRef<number | null>(null)
  /** Phase index already told to get set, so the call does not repeat. */
  const preparedAt = useRef<number | null>(null)

  const stage    = useMemo(() => currentStage(state), [state])
  const phases   = useMemo(() => buildPhases(state.spec, stage), [state.spec, stage])
  const summary  = useMemo(() => deriveVigilante(state), [state])
  const finished = useMemo(() => finishedCount(state), [state])
  const owed     = toNextStage(finished, state.spec.tier)
  const atBoss   = bossBeaten(state.spec.tier, stage)

  const persist = useCallback((s: typeof state) => { saveState(s); setState(s) }, [])

  /**
   * Already ticked today? Then the card offers nothing to press.
   *
   * Read on render rather than memoised: it only runs while a verdict is on
   * screen, and it has to reflect a tick made from ORBIT a moment ago — a
   * cached answer here would offer a second tick for the same day.
   */
  const habitDoneAlready = !!verdict && !!state.habitId &&
    (() => { const t = loadScrap7().tasks.find(x => x.id === state.habitId); return !!t && habitDoneToday(t) })()

  /**
   * Tick the habit through the one shared path.
   *
   * trackFromList is what ORBIT's list and the character sheet both call, so a
   * session marked here moves the score, the streak and the XP exactly as it
   * would anywhere else — no second economy, no XP this module mints itself.
   */
  const markDone = useCallback(() => {
    if (!state.habitId) return
    const { gained, levelUp } = trackFromList(state.habitId)
    setMarked(true)
    setState(loadState())
    if (levelUp)     { setFlash(tr(`LEVEL ${levelUp}`, `УРОВЕНЬ ${levelUp}`)); playCue('level') }
    else if (gained) { setFlash(`+${gained} XP`); playCue('xp') }
    else             playCue('check')
    setTimeout(() => setFlash(''), 2600)
  }, [state.habitId])

  const holdName = useCallback(
    (id: string) => { const h = HOLD_BY_ID[id]; return h ? tr(h.name, h.nameRu) : '' }, [])

  /**
   * Speak a cue, ducking the music underneath it.
   *
   * A cue competing with a chorus at full volume is a cue you miss, and missing
   * "next: plank" means holding the wrong position for thirty seconds.
   */
  const voiceRef = useRef(state.voiceOn)
  useEffect(() => { voiceRef.current = state.voiceOn }, [state.voiceOn])

  const announce = useCallback((cue: Cue) => {
    if (!voiceRef.current) return
    music?.setVolume(0.25)
    speak(say(cue, holdName), getLocale())
    window.setTimeout(() => music?.setVolume(1), 1900)
  }, [music, holdName])

  // The one fact both the soundtrack and the clock care about. Depending on
  // `run` directly would re-fire these effects on every tick — tearing down and
  // rebuilding the interval four times a second — so the boolean is the dep.
  const ticking = run !== null && !run.paused
  useEffect(() => { runRef.current = run }, [run])

  // The track you picked last time. Kept in IndexedDB because it is binary and
  // localStorage is shared with every other module's data.
  useEffect(() => {
    let alive = true
    void loadTrack().then(t => {
      if (alive && t) setMusic(new LocalAudio(t.blob, t.name))
    })
    return () => { alive = false }
  }, [])

  /**
   * Hold the screen awake while a session runs.
   *
   * Without this the module does not work on a phone at all: nothing touches the
   * screen during a 30-second wall sit, so it locks, and a locked screen
   * suspends both the interval and the audio. Desktop benefits too — a
   * screensaver mid-plank is the same bug.
   */
  useEffect(() => {
    if (!ticking) return
    let sentinel: WakeLockSentinel | null = null
    let released = false
    void navigator.wakeLock?.request('screen')
      .then(s => { if (released) void s.release(); else sentinel = s })
      .catch(() => { /* unsupported or denied — the timer still runs */ })
    return () => { released = true; void sentinel?.release().catch(() => {}) }
  }, [ticking])

  /**
   * Leaving the app pauses the session.
   *
   * A backgrounded page has its timers throttled and its audio suspended, so
   * letting the clock "keep running" would credit you with a hold you were not
   * in. Pausing is the honest reading: you stopped training when you switched
   * away. Rule 10 — the record reports, it does not flatter.
   */
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== 'hidden') return
      const cur = runRef.current
      if (!cur || cur.paused) return
      const next = { ...cur, paused: true, remaining: (cur.endsAt - Date.now()) / 1000 }
      runRef.current = next
      setRun(next)
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [])

  // Music follows the clock. One effect, so there is exactly one place that can
  // ever get the "is it playing?" question wrong.
  useEffect(() => {
    if (!music) return
    if (ticking) void music.play()
    else void music.pause()
  }, [music, ticking])

  useEffect(() => () => { music?.dispose() }, [music])

  const endSession = useCallback((finished: boolean) => {
    const cur = runRef.current
    if (!cur) return
    runRef.current = null
    setRun(null)
    persist(logSession(loadState(), {
      holdIds:    holdsAt(stage),
      tier:       state.spec.tier,
      stage,
      maxHoldSec: Math.max(...holdsAt(stage)
        .map(id => holdSecFor(state.spec.tier, stage, id))),
      restSec:   state.spec.restSec,
      rounds:    state.spec.rounds,
      doneWork:  cur.doneWork,
      totalWork: holdsAt(stage).length * state.spec.rounds,
      heldSec:   Math.round(cur.heldSec),
      finished,
      startedAt: cur.startedAt,
    }))
    void music?.stop()
    silence()
    setMarked(false)
    setVerdict({
      heldSec: Math.round(cur.heldSec), doneWork: cur.doneWork,
      totalWork: holdsAt(stage).length * state.spec.rounds,
      finished, stageUp: null,
    })
    playCue(finished ? 'level' : 'deny')
  }, [music, persist, state.spec, stage])

  /**
   * Step off the phase at `fromIndex`.
   *
   * Takes the index it is leaving and ignores the call if the session has
   * already moved on. The timer can observe an expired phase on two consecutive
   * ticks, and React may invoke an updater more than once — without this guard
   * a single expiry advanced twice, which silently skipped every REST and ended
   * the session early.
   */
  const advance = useCallback((fromIndex: number) => {
    const cur = runRef.current
    if (!cur || cur.paused || cur.index !== fromIndex) return

    const done     = phases[fromIndex]
    const heldSec  = cur.heldSec  + (done.kind === 'work' ? done.seconds : 0)
    const doneWork = cur.doneWork + (done.kind === 'work' ? 1 : 0)
    const next     = fromIndex + 1

    if (next >= phases.length) {
      runRef.current = null
      setRun(null)
      persist(logSession(loadState(), {
        holdIds:    holdsAt(stage),
        tier:       state.spec.tier,
        stage,
        maxHoldSec: Math.max(...holdsAt(stage)
          .map(id => holdSecFor(state.spec.tier, stage, id))),
        restSec:   state.spec.restSec,
        rounds:    state.spec.rounds,
        doneWork,
        totalWork: holdsAt(stage).length * state.spec.rounds,
        heldSec:   Math.round(heldSec),
        finished:  true,
        startedAt: cur.startedAt,
      }))
      void music?.stop()
      announce({ kind: 'done' })
      const before = stageFrom(finished, state.spec.tier)
      const after  = stageFrom(finished + 1, state.spec.tier)
      setMarked(false)
      setVerdict({
        heldSec: Math.round(heldSec), doneWork,
        totalWork: holdsAt(stage).length * state.spec.rounds,
        finished: true, stageUp: after > before ? after : null,
      })
      playCue('level')
      return
    }

    playCue(phases[next].kind === 'work' ? 'check' : 'tick')
    spokenSec.current = null
    preparedAt.current = null
    const cue = cueFor(phases, next)
    if (cue) announce(cue)
    const stepped: Running = {
      ...cur,
      index: next,
      endsAt: Date.now() + phases[next].seconds * 1000,
      remaining: phases[next].seconds,
      heldSec,
      doneWork,
    }
    runRef.current = stepped
    setRun(stepped)
  }, [phases, music, persist, state.spec, stage, announce, finished])

  // The clock. Remaining is recomputed from wall time every tick, so a
  // backgrounded window or a throttled interval cannot make a 30-second hold
  // quietly become 40.
  useEffect(() => {
    if (!ticking) {
      if (tick.current) { clearInterval(tick.current); tick.current = null }
      return
    }
    tick.current = setInterval(() => {
      const cur = runRef.current
      if (!cur || cur.paused) return
      const left = (cur.endsAt - Date.now()) / 1000
      if (left <= 0) { advance(cur.index); return }
      if (preparedAt.current !== cur.index && voiceRef.current) {
        const prep = prepareCue(phases, cur.index, left)
        if (prep) { preparedAt.current = cur.index; announce(prep) }
      }
      const n = countdownAt(left)
      if (n !== null && spokenSec.current !== n && voiceRef.current) {
        spokenSec.current = n
        // Not an interrupt: a bare number must never cut off the phase cue.
        speak(String(n), getLocale(), false)
      }
      runRef.current = { ...cur, remaining: left }
      setRun(prev => (prev ? { ...prev, remaining: left } : prev))
    }, 200)
    return () => { if (tick.current) clearInterval(tick.current) }
  }, [ticking, advance, phases, announce])

  const start = () => {
    if (!phases.length) return
    playCue('open')
    const first: Running = {
      index: 0,
      endsAt: Date.now() + phases[0].seconds * 1000,
      remaining: phases[0].seconds,
      paused: false,
      startedAt: new Date().toISOString(),
      heldSec: 0,
      doneWork: 0,
    }
    runRef.current = first
    spokenSec.current = null
    setRun(first)
    const cue = cueFor(phases, 0)
    if (cue) announce(cue)
  }

  const togglePause = () => {
    const cur = runRef.current
    if (!cur) return
    const next: Running = cur.paused
      ? { ...cur, paused: false, endsAt: Date.now() + cur.remaining * 1000 }
      : { ...cur, paused: true,  remaining: (cur.endsAt - Date.now()) / 1000 }
    playCue(cur.paused ? 'open' : 'tick')
    if (!cur.paused) silence()          // pausing stops the corner man too
    spokenSec.current = null
    runRef.current = next
    setRun(next)
  }

  const pickMusic = (f: File | undefined) => {
    if (!f) return
    music?.dispose()
    setMusic(new LocalAudio(f, f.name))
    persist(setMusicName(loadState(), f.name))
    void saveTrack(f)          // survives a reload; never blocks the session
  }

  const phase: Phase | null = run ? phases[run.index] : null
  const hold  = phase ? HOLD_BY_ID[phase.holdId] : null
  const isWork  = phase?.kind === 'work'
  const isReady = phase?.kind === 'ready'
  const accent  = isReady ? READY : isWork ? WORK : REST
  const pct = phase ? Math.max(0, Math.min(1, (run!.remaining) / phase.seconds)) : 0

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ flexShrink: 0, padding: '10px 14px 8px',
        borderBottom: `1px solid ${NEON}18` }}>
        <p style={{ fontFamily: 'var(--font)', fontSize: 13, fontWeight: 900,
          letterSpacing: '0.16em', color: NEON, textShadow: `0 0 12px ${NEON}60` }}>
          ⧗ VIGILANTE
        </p>
        <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-2xs)',
          color: 'rgba(148,163,184,0.45)', marginTop: 2 }}>
          {tr('Statics · time under tension', 'Статика · время под нагрузкой')}
        </p>
      </div>

      {flash && (
        <div style={{ position: 'absolute', top: 10, right: 14, zIndex: 40,
          padding: '5px 11px', borderRadius: 7,
          background: 'rgba(4,10,18,0.96)', border: `1px solid ${NEON}45` }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 800,
            letterSpacing: '0.12em', color: NEON }}>{flash}</p>
        </div>
      )}

      {/* ── What the session was worth ──
          Rule 10: it reports, it does not applaud. The numbers ARE the reward —
          "6:00 under tension, one stage bought" lands harder than a well done,
          and unlike a well done it is true whether or not you finished. */}
      {verdict && (
        <div style={{ flexShrink: 0, margin: '10px 14px 0', padding: '11px 13px', borderRadius: 9,
          background: verdict.finished ? `${REST}0e` : 'rgba(148,163,184,0.06)',
          border: `1px solid ${verdict.finished ? REST : 'rgba(148,163,184,0.28)'}` }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 12, fontWeight: 900,
            letterSpacing: '0.14em', color: verdict.finished ? REST : 'rgba(148,163,184,0.75)' }}>
            {verdict.finished
              ? tr('SESSION HELD', 'СЕССИЯ ВЫДЕРЖАНА')
              : tr('SESSION ENDED EARLY', 'СЕССИЯ ПРЕРВАНА')}
          </p>
          <p style={{ fontFamily: 'var(--font)', fontSize: 11, marginTop: 4,
            color: 'rgba(200,215,240,0.8)', lineHeight: 1.6 }}>
            {tr(`${clock(verdict.heldSec)} under tension · ${verdict.doneWork}/${verdict.totalWork} holds`,
                `${clock(verdict.heldSec)} под нагрузкой · ${verdict.doneWork}/${verdict.totalWork} удержаний`)}
            {verdict.stageUp !== null && (
              tr(` · stage ${verdict.stageUp} reached, +${STEP_SEC}s on every position`,
                 ` · этап ${verdict.stageUp}, +${STEP_SEC}с к каждой позиции`))}
          </p>

          {/* The habit is the record that counts. Marking it here goes through
              the same path ORBIT and UPLINKS use, so score, streak and XP move
              together rather than this module keeping a private tally. */}
          {verdict.finished && state.habitId && (
            marked || habitDoneAlready ? (
              <p style={{ fontFamily: 'var(--font)', fontSize: 10.5, marginTop: 7, color: REST }}>
                ✓ {tr('Marked in your habits for today.', 'Отмечено в привычках на сегодня.')}
              </p>
            ) : (
              <button onClick={markDone} style={{ ...btn(REST), marginTop: 8 }}>
                ✓ {tr('MARK DONE IN HABITS', 'ОТМЕТИТЬ В ПРИВЫЧКАХ')}
              </button>
            )
          )}
          {verdict.finished && !state.habitId && (
            <p style={{ fontFamily: 'var(--font)', fontSize: 10.5, marginTop: 7,
              color: 'rgba(148,163,184,0.5)', lineHeight: 1.5 }}>
              {tr('Schedule this below and finishing a session will mark it in your habits.',
                  'Запланируйте ниже — и завершённая сессия будет отмечаться в привычках.')}
            </p>
          )}

          <button onClick={() => setVerdict(null)} style={{ ...btn('rgba(148,163,184,0.45)'), marginTop: 8 }}>
            {tr('DISMISS', 'ЗАКРЫТЬ')}
          </button>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>

        {/* ── Running ── */}
        {run && phase && hold ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>

            <p style={{ fontFamily: 'var(--font)', fontSize: 11, fontWeight: 800,
              letterSpacing: '0.22em', color: accent }}>
              {isReady ? tr('GET INTO POSITION', 'ЗАЙМИТЕ ПОЗИЦИЮ')
                       : isWork ? tr('HOLD', 'ДЕРЖАТЬ') : tr('REST', 'ОТДЫХ')}
            </p>

            {/* The clock */}
            <div style={{ position: 'relative', width: 180, height: 180, flexShrink: 0,
              borderRadius: '50%',
              background: `conic-gradient(${accent} ${pct * 100}%, rgba(255,255,255,0.05) ${pct * 100}%)`,
              transition: 'background 0.2s linear' }}>
              <div style={{ position: 'absolute', inset: 9, borderRadius: '50%',
                background: 'var(--bg-void)', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                <span style={{ fontFamily: 'var(--font)', fontSize: 40, fontWeight: 900,
                  color: accent, textShadow: `0 0 18px ${accent}70`, lineHeight: 1 }}>
                  {Math.ceil(run.remaining)}
                </span>
                <span style={{ fontFamily: 'var(--font)', fontSize: 10,
                  color: 'rgba(148,163,184,0.5)', letterSpacing: '0.1em' }}>
                  {tr('sec', 'сек')}
                </span>
              </div>
            </div>

            <p style={{ fontFamily: 'var(--font)', fontSize: 17, fontWeight: 800,
              color: 'rgba(225,235,255,0.95)' }}>
              {hold.icon} {tr(hold.name, hold.nameRu)}
            </p>
            <p style={{ fontFamily: 'var(--font)', fontSize: 11,
              color: 'rgba(148,163,184,0.6)', textAlign: 'center', lineHeight: 1.55, maxWidth: 320 }}>
              {isWork || isReady
                ? tr(hold.cue, hold.cueRu)
                : tr('Breathe. Next one is coming.', 'Дышите. Следующий подход близко.')}
            </p>

            <p style={{ fontFamily: 'var(--font)', fontSize: 11,
              color: 'rgba(148,163,184,0.4)', letterSpacing: '0.08em' }}>
              {tr(`Round ${phase.round}/${state.spec.rounds}`,
                  `Круг ${phase.round}/${state.spec.rounds}`)}
              {' · '}
              {tr(`${run.index + 1}/${phases.length} steps`,
                  `шаг ${run.index + 1}/${phases.length}`)}
            </p>

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button onClick={togglePause} style={btn(accent)}>
                {run.paused ? `▶ ${tr('RESUME', 'ПРОДОЛЖИТЬ')}` : `❚❚ ${tr('PAUSE', 'ПАУЗА')}`}
              </button>
              <button onClick={() => endSession(false)} style={btn('rgba(148,163,184,0.5)')}>
                ■ {tr('END', 'ЗАВЕРШИТЬ')}
              </button>
            </div>
          </div>
        ) : (
          /* ── Idle: the plan ── */
          <>
            {/* Which way in. Every tier ends at the same boss — the choice is
                where you start, not where you finish. */}
            <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
              {TIER_ORDER.map(t => {
                const on = state.spec.tier === t
                return (
                  <button key={t} onClick={() => persist(setTier(loadState(), t))} style={{
                    flex: 1, padding: '7px 4px', borderRadius: 7, cursor: 'pointer',
                    fontFamily: 'var(--font)', fontSize: 9.5, fontWeight: 800, letterSpacing: '0.06em',
                    color: on ? '#050810' : 'rgba(148,163,184,0.55)',
                    background: on ? NEON : 'transparent',
                    border: `1px solid ${on ? NEON : 'rgba(255,255,255,0.08)'}`,
                  }}>{tr(TIERS[t].name, TIERS[t].nameRu)}</button>
                )
              })}
            </div>

            {/* Where the ladder sits. Bought with finished sessions, never set. */}
            <div style={{ padding: '9px 11px', borderRadius: 8, marginBottom: 12,
              background: atBoss ? `${READY}12` : 'rgba(10,12,30,0.45)',
              border: `1px solid ${atBoss ? READY : NEON}33` }}>
              <p style={{ fontFamily: 'var(--font)', fontSize: 10, fontWeight: 800,
                letterSpacing: '0.14em', color: atBoss ? READY : `${NEON}b0`, marginBottom: 4 }}>
                {atBoss
                  ? tr('◆ FINAL BOSS DOWN — A MINUTE OF EVERYTHING', '◆ БОСС ПОВЕРЖЕН — ПО МИНУТЕ НА КАЖДОЕ')
                  : tr(`STAGE ${stage} / ${maxStage(state.spec.tier)}`,
                       `ЭТАП ${stage} / ${maxStage(state.spec.tier)}`)}
              </p>
              <p style={{ fontFamily: 'var(--font)', fontSize: 10.5,
                color: 'rgba(148,163,184,0.6)', lineHeight: 1.5 }}>
                {atBoss
                  ? tr('Nothing left to add. Hold the line.', 'Добавить больше нечего. Держите planку.')
                  : tr(`${owed} more finished ${owed === 1 ? 'session' : 'sessions'} buys +${STEP_SEC}s on every position.`,
                       `Ещё ${owed} ${plural(owed, 'завершённая сессия', 'завершённые сессии', 'завершённых сессий')} — и +${STEP_SEC}с к каждой позиции.`)}
              </p>
              {/* Three squares: the week's work, as it lands. */}
              <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                {Array.from({ length: SESSIONS_PER_STAGE }, (_, i) => {
                  const done = (finished % SESSIONS_PER_STAGE) > i || atBoss
                  return <div key={i} style={{ flex: 1, height: 4, borderRadius: 2,
                    background: done ? (atBoss ? READY : NEON) : 'rgba(255,255,255,0.07)' }} />
                })}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
              {holdsAt(stage).map(id => {
                const h = HOLD_BY_ID[id]
                if (!h) return null
                const sec = holdSecFor(state.spec.tier, stage, id)
                const maxed = sec >= BOSS_SEC
                const fresh = id === 'pullup-hold' && stage === PULLUP_UNLOCK_STAGE
                return (
                  <div key={id} style={{ display: 'flex', alignItems: 'flex-start', gap: 9,
                    padding: '8px 10px', borderRadius: 8,
                    background: 'rgba(10,12,30,0.45)',
                    border: `1px solid ${fresh ? `${NEON}55` : 'rgba(255,255,255,0.05)'}` }}>
                    <span style={{ fontSize: 15, flexShrink: 0 }}>{h.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)',
                        fontWeight: 700, color: 'rgba(225,235,255,0.9)' }}>
                        {tr(h.name, h.nameRu)}
                        <span style={{ fontSize: 11, marginLeft: 7,
                          color: maxed ? READY : `${NEON}90` }}>
                          {sec}{tr('s', 'с')} × {state.spec.rounds}{maxed ? ' ◆' : ''}
                        </span>
                        {fresh && <span style={{ fontSize: 9.5, marginLeft: 6, color: NEON,
                          letterSpacing: '0.1em' }}>{tr('NEW', 'НОВОЕ')}</span>}
                      </p>
                      <p style={{ fontFamily: 'var(--font)', fontSize: 10.5,
                        color: 'rgba(148,163,184,0.55)', lineHeight: 1.5, marginTop: 2 }}>
                        {tr(h.cue, h.cueRu)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Timings */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <NumField label={tr('REST', 'ОТДЫХ')} suffix={tr('s', 'с')} value={state.spec.restSec}
                onChange={v => persist(setSpec(loadState(), { ...state.spec, restSec: clampSec(v, 45) }))} />
              <NumField label={tr('ROUNDS', 'КРУГИ')} value={state.spec.rounds}
                onChange={v => persist(setSpec(loadState(), { ...state.spec, rounds: clampRounds(v) }))} />
              <NumField label={tr('READY', 'ПОДГОТ.')} suffix={tr('s', 'с')} value={state.spec.leadInSec}
                onChange={v => persist(setSpec(loadState(), { ...state.spec, leadInSec: clampLeadIn(v) }))} />
            </div>

            {/* Music */}
            <div style={{ padding: '9px 11px', borderRadius: 8, marginBottom: 12,
              background: 'rgba(10,12,30,0.45)', border: `1px solid ${NEON}22` }}>
              <p style={{ fontFamily: 'var(--font)', fontSize: 10, fontWeight: 800,
                letterSpacing: '0.14em', color: `${NEON}b0`, marginBottom: 5 }}>
                ♪ {tr('SOUNDTRACK', 'САУНДТРЕК')}
              </p>
              <p style={{ fontFamily: 'var(--font)', fontSize: 10.5,
                color: 'rgba(148,163,184,0.6)', lineHeight: 1.5, marginBottom: 7 }}>
                {music
                  ? tr(`Playing: ${music.label} — starts and stops with the timer.`,
                       `Играет: ${music.label} — запускается и останавливается вместе с таймером.`)
                  : tr('Pick a track and it runs with the timer — plays on START, pauses on PAUSE.',
                       'Выберите трек — он пойдёт вместе с таймером: старт на СТАРТ, пауза на ПАУЗУ.')}
              </p>
              <input ref={fileRef} type="file" accept="audio/*" style={{ display: 'none' }}
                onChange={e => pickMusic(e.target.files?.[0])} />
              <button onClick={() => fileRef.current?.click()} style={btn(NEON)}>
                {music ? tr('CHANGE TRACK', 'СМЕНИТЬ ТРЕК') : tr('CHOOSE TRACK', 'ВЫБРАТЬ ТРЕК')}
              </button>
            </div>

            {/* ── When you train ──
                You say which days and roughly when; the module reads the real
                day and puts it where you actually have room. The habit itself
                is a life-support basic (rule 31), so it is scored, streaked and
                paid for by the same system as everything else. */}
            <div style={{ padding: '9px 11px', borderRadius: 8, marginBottom: 12,
              background: 'rgba(10,12,30,0.45)', border: `1px solid ${NEON}22` }}>
              <p style={{ fontFamily: 'var(--font)', fontSize: 10, fontWeight: 800,
                letterSpacing: '0.14em', color: `${NEON}b0`, marginBottom: 5 }}>
                ⌾ {tr('WHEN YOU TRAIN', 'КОГДА ТРЕНИРОВАТЬСЯ')}
              </p>

              {state.habitId ? (
                <>
                  <p style={{ fontFamily: 'var(--font)', fontSize: 10.5,
                    color: 'rgba(148,163,184,0.65)', lineHeight: 1.5 }}>
                    {tr(`In your habits on ${state.habitDays.map(d => d.toUpperCase()).join(' · ')}. Finishing a session marks it.`,
                        `В привычках: ${state.habitDays.map(d => d.toUpperCase()).join(' · ')}. Завершённая сессия отмечает её.`)}
                  </p>
                  <button onClick={() => persist(setHabit(loadState(), null, []))}
                    style={{ ...btn('rgba(148,163,184,0.45)'), marginTop: 7 }}>
                    {tr('UNLINK', 'ОТВЯЗАТЬ')}
                  </button>
                </>
              ) : (
                <>
                  <p style={{ fontFamily: 'var(--font)', fontSize: 10.5,
                    color: 'rgba(148,163,184,0.6)', lineHeight: 1.5, marginBottom: 7 }}>
                    {tr('Pick your days. AUTO reads today and puts the session where you actually have room.',
                        'Выберите дни. АВТО читает ваш день и ставит сессию туда, где реально есть время.')}
                  </p>
                  <div style={{ display: 'flex', gap: 3, marginBottom: 7 }}>
                    {WEEKDAYS.map(d => {
                      const on = pickDays.includes(d.value)
                      return (
                        <button key={d.value} onClick={() => setPickDays(p =>
                          p.includes(d.value) ? p.filter(x => x !== d.value) : [...p, d.value])}
                          style={{ flex: 1, padding: '5px 0', borderRadius: 5, cursor: 'pointer',
                            fontFamily: 'var(--font)', fontSize: 9.5, fontWeight: 800,
                            color: on ? '#050810' : 'rgba(148,163,184,0.5)',
                            background: on ? NEON : 'transparent',
                            border: `1px solid ${on ? NEON : 'rgba(255,255,255,0.08)'}` }}>
                          {d.label}
                        </button>
                      )
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
                    {(['auto', 'morning', 'midday', 'afternoon', 'evening'] as WhenChoice[]).map(w => {
                      const on = pickWhen === w
                      return (
                        <button key={w} onClick={() => setPickWhen(w)}
                          style={{ flex: 1, padding: '5px 0', borderRadius: 5, cursor: 'pointer',
                            fontFamily: 'var(--font)', fontSize: 9, fontWeight: 800,
                            color: on ? '#050810' : 'rgba(148,163,184,0.5)',
                            background: on ? NEON : 'transparent',
                            border: `1px solid ${on ? NEON : 'rgba(255,255,255,0.08)'}` }}>
                          {w === 'auto' ? tr('AUTO', 'АВТО')
                            : tr(PERIOD_LABEL[w as Period].en, PERIOD_LABEL[w as Period].ru).slice(0, 4)}
                        </button>
                      )
                    })}
                  </div>
                  <button
                    disabled={!pickDays.length}
                    onClick={() => {
                      const mins = Math.round(specHoldSeconds(state.spec, stage) / 60) + 5
                      const { taskId, period } = installTrainingHabit(
                        tr('Statics', 'Статика'), pickDays, pickWhen, mins)
                      if (!taskId) { setFlash(tr('COULD NOT ADD', 'НЕ УДАЛОСЬ')); return }
                      persist(setHabit(loadState(), taskId, pickDays))
                      window.dispatchEvent(new CustomEvent('warren:sync', { detail: { source: 'vigilante' } }))
                      setFlash(tr(`SCHEDULED · ${PERIOD_LABEL[period].en}`,
                                  `ЗАПЛАНИРОВАНО · ${PERIOD_LABEL[period].ru}`))
                      setTimeout(() => setFlash(''), 2600)
                      playCue('open')
                    }}
                    style={{ ...btn(NEON), opacity: pickDays.length ? 1 : 0.4 }}>
                    ✛ {tr('ADD TO MY HABITS', 'ДОБАВИТЬ В ПРИВЫЧКИ')}
                  </button>
                </>
              )}
            </div>

            {/* Spoken cues. Hidden where the engine does not exist rather than
                offering a switch that does nothing. */}
            {voiceSupported() && (
              <div style={{ padding: '9px 11px', borderRadius: 8, marginBottom: 12,
                background: 'rgba(10,12,30,0.45)', border: `1px solid ${NEON}22` }}>
                <p style={{ fontFamily: 'var(--font)', fontSize: 10, fontWeight: 800,
                  letterSpacing: '0.14em', color: `${NEON}b0`, marginBottom: 5 }}>
                  ◗ {tr('SPOKEN CUES', 'ГОЛОСОВЫЕ ПОДСКАЗКИ')}
                </p>
                <p style={{ fontFamily: 'var(--font)', fontSize: 10.5,
                  color: 'rgba(148,163,184,0.6)', lineHeight: 1.5, marginBottom: 7 }}>
                  {tr('The session calls each position and counts you down, so you never turn your head to read the screen.',
                      'Сессия называет каждую позицию и отсчитывает секунды — не нужно поворачивать голову к экрану.')}
                </p>
                <button
                  onClick={() => {
                    const on = !state.voiceOn
                    persist(setVoiceOn(loadState(), on))
                    if (on) speak(tr('Ready.', 'Готов.'), getLocale())
                    else silence()
                  }}
                  style={btn(state.voiceOn ? NEON : 'rgba(148,163,184,0.5)')}>
                  {state.voiceOn ? tr('VOICE ON', 'ГОЛОС ВКЛ') : tr('VOICE OFF', 'ГОЛОС ВЫКЛ')}
                </button>
              </div>
            )}

            <button onClick={start} disabled={!phases.length} style={{
              width: '100%', padding: '13px', borderRadius: 9, cursor: 'pointer',
              fontFamily: 'var(--font)', fontSize: 14, fontWeight: 900, letterSpacing: '0.16em',
              color: '#050810', background: NEON, border: 'none',
              boxShadow: `0 0 22px ${NEON}55`,
            }}>
              ▶ {tr('START', 'СТАРТ')}
            </button>

            <p style={{ fontFamily: 'var(--font)', fontSize: 10,
              color: 'rgba(148,163,184,0.4)', textAlign: 'center', marginTop: 7 }}>
              {tr(`${clock(specHoldSeconds(state.spec, stage))} under tension · ${phases.length} steps`,
                  `${clock(specHoldSeconds(state.spec, stage))} под нагрузкой · ${phases.length} шагов`)}
            </p>

            {/* Record */}
            {state.log.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <p style={{ fontFamily: 'var(--font)', fontSize: 10, fontWeight: 800,
                  letterSpacing: '0.14em', color: 'rgba(148,163,184,0.4)', marginBottom: 6 }}>
                  {tr('RECORD', 'ЗАПИСЬ')} · {tr(
                    `${summary.finished}/${summary.sessions} finished · ${clock(summary.heldSec)} total`,
                    `${summary.finished}/${summary.sessions} завершено · ${clock(summary.heldSec)} всего`)}
                </p>
                {state.log.slice(0, 8).map(r => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 9px', borderRadius: 6, marginBottom: 3,
                    background: 'rgba(10,12,30,0.4)',
                    borderLeft: `2px solid ${r.finished ? REST : 'rgba(148,163,184,0.3)'}` }}>
                    <span style={{ fontFamily: 'var(--font)', fontSize: 10.5,
                      color: 'rgba(148,163,184,0.7)', flex: 1 }}>{r.date}</span>
                    <span style={{ fontFamily: 'var(--font)', fontSize: 10.5,
                      color: r.finished ? REST : 'rgba(148,163,184,0.5)' }}>
                      {r.doneWork}/{r.totalWork} {tr(
                        plural(r.totalWork, 'hold', 'holds', 'holds'),
                        plural(r.totalWork, 'удержание', 'удержания', 'удержаний'))}
                    </span>
                    <span style={{ fontFamily: 'var(--font)', fontSize: 10.5, color: `${NEON}b0` }}>
                      {clock(r.heldSec)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const btn = (accent: string): React.CSSProperties => ({
  padding: '8px 14px', borderRadius: 7, cursor: 'pointer',
  fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 800, letterSpacing: '0.1em',
  color: accent, background: 'transparent', border: `1px solid ${accent}55`,
})

function NumField({ label, value, onChange, suffix }: {
  label: string; value: number; onChange: (v: number) => void; suffix?: string
}) {
  return (
    <div style={{ flex: 1 }}>
      <p style={{ fontFamily: 'var(--font)', fontSize: 9.5, fontWeight: 800,
        letterSpacing: '0.12em', color: 'rgba(148,163,184,0.45)', marginBottom: 3 }}>{label}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <input type="number" value={value} onChange={e => onChange(Number(e.target.value))}
          style={{ width: '100%', padding: '6px 8px', borderRadius: 6,
            fontFamily: 'var(--font)', fontSize: 13, fontWeight: 700,
            color: 'rgba(225,235,255,0.9)', background: 'rgba(10,12,30,0.6)',
            border: '1px solid rgba(255,255,255,0.08)' }} />
        {suffix && <span style={{ fontFamily: 'var(--font)', fontSize: 10,
          color: 'rgba(148,163,184,0.4)' }}>{suffix}</span>}
      </div>
    </div>
  )
}
