import { useEffect, useLayoutEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { t as tr } from './i18n'
import { markTourSeen, hasSeenTour, tourForPath, type Tour, type TourStep } from './tour'

// ─── The tour, drawn ──────────────────────────────────────────────────────────
// A dimmed page with a hole cut where the step is pointing, and a card beside
// it. The hole is four divs rather than an SVG mask: it keeps the highlighted
// control genuinely clickable, and it degrades to a plain dim when a step has
// no anchor or the anchor isn't on screen yet.

const CYAN = '#00f5ff'
const PAD  = 6

interface Box { top: number; left: number; width: number; height: number }

/**
 * Where a step is pointing, or null if it isn't pointing anywhere real.
 *
 * A collapsed element counts as absent: BANDWIDTH renders nothing while both
 * slots are empty, leaving a full-width strip of zero height, and the overlay
 * cheerfully outlined it. A highlight around nothing is worse than no highlight.
 */
const MIN_ANCHOR = 8

function boxFor(anchor?: string): Box | null {
  if (!anchor) return null
  const el = document.querySelector(`[data-tour="${anchor}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width < MIN_ANCHOR || r.height < MIN_ANCHOR) return null
  return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 }
}

/** Steps worth showing here and now: an anchored step whose anchor is missing is dropped. */
function liveSteps(steps: TourStep[]): TourStep[] {
  return steps.filter(s => !s.anchor || boxFor(s.anchor) !== null)
}

export function TourOverlay({ tour, onDone }: { tour: Tour; onDone: () => void }) {
  const [i, setI] = useState(0)
  const [box, setBox] = useState<Box | null>(null)
  // Fixed at mount: the steps that can actually point at something right now
  const [steps] = useState<TourStep[]>(() => liveSteps(tour.steps))
  const step: TourStep | undefined = steps[i]

  // Re-measure on every step, and again after a scroll settles
  useLayoutEffect(() => {
    if (!step) return
    const el = step.anchor ? document.querySelector(`[data-tour="${step.anchor}"]`) : null
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const measure = () => setBox(boxFor(step.anchor))
    measure()
    const id = setTimeout(measure, 380)
    window.addEventListener('resize', measure)
    return () => { clearTimeout(id); window.removeEventListener('resize', measure) }
  }, [i, step])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDone()
      if (e.key === 'Enter' || e.key === 'ArrowRight') setI(v => v + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDone])

  useEffect(() => { if (i >= steps.length) onDone() }, [i, steps.length, onDone])
  if (!step) return null

  const last = i === steps.length - 1
  const dim  = 'rgba(2,6,12,0.82)'

  // Card goes below the hole when there's room, otherwise above it
  const below = box ? box.top + box.height + 12 : 0
  const cardTop = box
    ? (below + 150 < window.innerHeight ? below : Math.max(12, box.top - 158))
    : Math.max(12, window.innerHeight / 2 - 80)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 88 }}>
      {/* The cut-out: four panels around the anchor, so it stays clickable */}
      {box ? (
        <>
          <div style={{ position: 'fixed', left: 0, top: 0, right: 0, height: Math.max(0, box.top), background: dim }} />
          <div style={{ position: 'fixed', left: 0, top: box.top + box.height, right: 0, bottom: 0, background: dim }} />
          <div style={{ position: 'fixed', left: 0, top: box.top, width: Math.max(0, box.left), height: box.height, background: dim }} />
          <div style={{ position: 'fixed', left: box.left + box.width, top: box.top, right: 0, height: box.height, background: dim }} />
          <div style={{ position: 'fixed', left: box.left, top: box.top, width: box.width, height: box.height,
            borderRadius: 10, border: `2px solid ${CYAN}`, boxShadow: `0 0 0 1px ${CYAN}40, 0 0 26px ${CYAN}70`,
            pointerEvents: 'none', transition: 'all 0.28s cubic-bezier(0.4,0,0.2,1)' }} />
        </>
      ) : (
        <div style={{ position: 'fixed', inset: 0, background: dim }} />
      )}

      {/* The card */}
      <div style={{
        position: 'fixed', left: '50%', transform: 'translateX(-50%)', top: cardTop,
        width: 'min(340px, calc(100vw - 28px))', padding: '13px 15px', borderRadius: 11,
        background: 'rgba(6,14,26,0.98)', border: `1px solid ${CYAN}45`,
        boxShadow: `0 10px 34px rgba(0,0,0,0.6), 0 0 20px ${CYAN}20`,
        transition: 'top 0.28s cubic-bezier(0.4,0,0.2,1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
          <span style={{ fontFamily: 'var(--font)', fontSize: 6.5, fontWeight: 800,
            letterSpacing: '0.22em', color: `${CYAN}70` }}>
            {i + 1} / {steps.length}
          </span>
          <div style={{ display: 'flex', gap: 3, marginLeft: 'auto' }}>
            {steps.map((_, n) => (
              <div key={n} style={{ width: n === i ? 12 : 5, height: 3, borderRadius: 2,
                background: n <= i ? CYAN : 'rgba(255,255,255,0.14)', transition: 'all 0.2s' }} />
            ))}
          </div>
        </div>

        <p style={{ fontFamily: 'var(--font)', fontSize: 11, fontWeight: 900, letterSpacing: '0.1em',
          color: CYAN, textShadow: `0 0 10px ${CYAN}50` }}>
          {tr(step.title, step.titleRu)}
        </p>
        <p style={{ fontFamily: 'var(--font)', fontSize: 8.5, lineHeight: 1.7, marginTop: 6,
          color: 'rgba(215,232,248,0.82)' }}>
          {tr(step.body, step.bodyRu)}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12 }}>
          <button onClick={onDone} style={{
            padding: '6px 11px', borderRadius: 6, cursor: 'pointer', background: 'transparent',
            border: '1px solid rgba(255,255,255,0.12)', fontFamily: 'var(--font)', fontSize: 7.5,
            fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(148,163,184,0.6)',
          }}>{tr('SKIP', 'ПРОПУСТИТЬ')}</button>

          {i > 0 && (
            <button onClick={() => setI(v => v - 1)} style={{
              padding: '6px 11px', borderRadius: 6, cursor: 'pointer', background: 'transparent',
              border: '1px solid rgba(255,255,255,0.12)', fontFamily: 'var(--font)', fontSize: 7.5,
              fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(148,163,184,0.6)',
            }}>{tr('BACK', 'НАЗАД')}</button>
          )}

          <button onClick={() => (last ? onDone() : setI(v => v + 1))} style={{
            flex: 1, padding: '8px', borderRadius: 7, cursor: 'pointer',
            fontFamily: 'var(--font)', fontSize: 9, fontWeight: 900, letterSpacing: '0.16em',
            color: '#02121a', background: `linear-gradient(135deg, ${CYAN}, ${CYAN}b0)`,
            border: 'none', boxShadow: `0 0 16px ${CYAN}45`,
          }}>{last ? tr('GOT IT', 'ПОНЯТНО') : tr('NEXT', 'ДАЛЬШЕ')}</button>
        </div>
      </div>
    </div>
  )
}

/** Started this session, whether or not it was finished — belt to the braces below. */
const startedThisSession = new Set<string>()

/**
 * Runs the tour for whatever surface you're on, ONCE, and never while something
 * more important is on screen. Mounting it is the whole integration — a module
 * needs no code of its own beyond `data-tour` attributes.
 *
 * Seen is marked when it STARTS, not when it finishes. It used to be marked on
 * completion, so walking away mid-tour left it unseen and it ambushed you again
 * on the next visit — which reads as a bug, not a courtesy. Settings has an
 * explicit REPLAY for when you actually want it back.
 */
export function RouteTour({ enabled }: { enabled: boolean }) {
  const location = useLocation()
  const [active, setActive] = useState<Tour | null>(null)

  useEffect(() => {
    if (!enabled) { setActive(null); return }
    const tour = tourForPath(location.pathname)
    if (!tour || hasSeenTour(tour.id) || startedThisSession.has(tour.id)) { setActive(null); return }
    // The hub tour is the first welcome, and nothing else runs before it. Opening
    // a module early used to stack a second tour on top of an unfinished one.
    if (tour.id !== 'hub' && !hasSeenTour('hub')) { setActive(null); return }
    // Let the screen paint before measuring anything on it
    const id = setTimeout(() => {
      startedThisSession.add(tour.id)
      markTourSeen(tour.id)
      setActive(tour)
    }, 420)
    return () => clearTimeout(id)
  }, [location.pathname, enabled])

  if (!active) return null
  return <TourOverlay tour={active} onDone={() => setActive(null)} />
}
