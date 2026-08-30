import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { t } from '../i18n'

// ─── A hub card that is really a minimized window ─────────────────────────────
// The card on the hub and the module's own screen are the same window in two
// states. Tapping the card maximizes it over the hub; minimizing puts it back.
// Nothing navigates — you never leave the hub, which is the point of the module
// being on the hub at all.
//
// The growth is a FLIP: the overlay is born at the card's exact rectangle and
// then animated out to fill the surface, so the card visibly becomes the window
// rather than a panel appearing on top of it.
//
// It anchors to the nearest `.fade-in` — every module root carries one, and its
// forwards-filled transform makes it the containing block for fixed children.
// So "fills the screen" means "fills the hub's own box", which keeps the title
// bar and the sidebar in place and needs no safe-area maths of its own.

interface Inset { top: number; left: number; right: number; bottom: number }

const SHUT: Inset = { top: 0, left: 0, right: 0, bottom: 0 }
const EASE = 'cubic-bezier(0.22, 0.9, 0.24, 1)'
const MS   = 320

export function HubWindow({ tone, label, minimized, children }: {
  /** The module's neon, so the window is visibly the thing the card was. */
  tone: string
  /** Named on the window's own bar, once it is open. */
  label: string
  /** How it looks on the hub. */
  minimized: ReactNode
  /** The module. Rendered only while open. */
  children: ReactNode
}) {
  const holder = useRef<HTMLDivElement>(null)
  const [open,  setOpen]  = useState(false)
  const [from,  setFrom]  = useState<Inset>(SHUT)
  const [grown, setGrown] = useState(false)

  const reduced = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  const maximize = () => {
    const card = holder.current
    const host = card?.closest('.fade-in') as HTMLElement | null
    if (card && host) {
      const c = host.getBoundingClientRect()
      const r = card.getBoundingClientRect()
      setFrom({
        top:    r.top    - c.top,
        left:   r.left   - c.left,
        right:  c.right  - r.right,
        bottom: c.bottom - r.bottom,
      })
    } else {
      setFrom(SHUT)
    }
    setOpen(true)
  }

  // Leaving the starting rectangle has to happen AFTER the browser has painted
  // it, or there is nothing to animate from. Two frames does that — but a frame
  // callback never runs while the tab is hidden, which would strand the window
  // at card size, so a timer backs it up. Whichever lands first wins; setting
  // it twice costs nothing.
  useEffect(() => {
    if (!open) return
    if (reduced) { setGrown(true); return }
    let a = 0, b = 0
    a = requestAnimationFrame(() => { b = requestAnimationFrame(() => setGrown(true)) })
    const t = setTimeout(() => setGrown(true), 80)
    return () => { cancelAnimationFrame(a); cancelAnimationFrame(b); clearTimeout(t) }
  }, [open, reduced])

  const minimize = useCallback(() => {
    if (reduced) { setOpen(false); return }
    setGrown(false)
    setTimeout(() => setOpen(false), MS)
  }, [reduced])

  // Escape on a desktop; the button is the only way in on a phone.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') minimize() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, minimize])

  const edge = grown ? SHUT : from

  return (
    <div ref={holder}>
      <button onClick={maximize} aria-expanded={open} style={{
        display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
      }}>
        {minimized}
      </button>

      {open && (
        <div role="dialog" aria-label={label} style={{
          position: 'fixed', zIndex: 70,
          top: edge.top, left: edge.left, right: edge.right, bottom: edge.bottom,
          borderRadius: grown ? 0 : 10,
          overflow: 'hidden', overscrollBehavior: 'contain',
          display: 'flex', flexDirection: 'column',
          // Fully opaque. The module inside paints no ground of its own, so
          // even a 2% bleed let the hub's headings ghost through the window.
          background: '#040a12',
          border: `1px solid ${tone}${grown ? '2a' : '55'}`,
          boxShadow: `0 24px 60px rgba(0,0,0,0.6), 0 0 40px ${tone}18`,
          transition: reduced ? 'none'
            : `top ${MS}ms ${EASE}, left ${MS}ms ${EASE}, right ${MS}ms ${EASE}, bottom ${MS}ms ${EASE}, border-radius ${MS}ms ${EASE}`,
        }}>
          {/* The window's own bar. Minimize sits where a window's does. */}
          <div style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
            padding: '0 6px 0 13px', height: 34,
            borderBottom: `1px solid ${tone}20`, background: `${tone}0a`,
          }}>
            <span style={{
              fontFamily: 'var(--font)', fontSize: 9.5, fontWeight: 800,
              letterSpacing: '0.18em', color: `${tone}b0`,
            }}>{label}</span>
            <div style={{ flex: 1 }} />
            <button onClick={minimize} title={t('Minimize', 'Свернуть')} style={{
              width: 38, height: 26, borderRadius: 6, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: `${tone}90`, border: `1px solid ${tone}28`, background: `${tone}0c`,
              fontFamily: 'var(--font)', fontSize: 14, lineHeight: 1,
            }}>─</button>
          </div>

          {/* The module fades in behind the growing frame rather than being
              scaled with it, which would smear its type for a third of a second. */}
          <div style={{
            flex: 1, minHeight: 0, overflow: 'hidden',
            opacity: grown ? 1 : 0,
            transition: reduced ? 'none' : `opacity ${MS * 0.7}ms ease ${MS * 0.3}ms`,
          }}>
            {children}
          </div>
        </div>
      )}
    </div>
  )
}
