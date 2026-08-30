import type { ReactNode } from 'react'

// ─── A hub bar — one line of state, the whole surface underneath ──────────────
// The hub used to be a scroll of cards, all open at once, and it read like a
// science project. A bar is the same content with a shut state: a tag, one line
// saying where that thing stands, and everything else one tap away.
//
// Expansion happens IN PLACE. A bar never navigates — that is the whole point of
// putting a module on the hub rather than linking to it. The module keeps its
// own screen in the sidebar for the deep work.
//
// Bars are not uniform on purpose. TODAY passes a rich `summary` because the
// shape of a day is worth a glance; QUEST passes one line because a stage is
// not. That difference carries information, so it is a prop rather than a
// variant.

export function HubBar({
  tag, tone, summary, open, onToggle, children, disabled = false,
}: {
  /** Short uppercase label. The bar's identity in the stack. */
  tag: string
  /** The module's neon. Ties a bar to its icon and its screen. */
  tone: string
  /** Shut state: one line, or a small block for something worth glancing at. */
  summary: ReactNode
  open: boolean
  onToggle: () => void
  children: ReactNode
  /** Nothing to open into — the bar still reports, it just doesn't expand. */
  disabled?: boolean
}) {
  return (
    <section style={{
      marginBottom: 8, borderRadius: 10, overflow: 'hidden',
      background: open ? `${tone}0b` : 'rgba(13,24,48,0.5)',
      border: `1px solid ${open ? `${tone}3a` : 'rgba(255,255,255,0.06)'}`,
      transition: 'border-color 0.15s, background 0.15s',
    }}>
      <button
        onClick={disabled ? undefined : onToggle}
        aria-expanded={disabled ? undefined : open}
        style={{
          width: '100%', textAlign: 'left',
          // 44px is the smallest thing a thumb hits reliably, and the hub is
          // now mostly a column of these.
          minHeight: 44, padding: '10px 13px',
          display: 'flex', alignItems: 'center', gap: 9,
          cursor: disabled ? 'default' : 'pointer',
        }}
      >
        <span style={{
          // Sized so the longest tag (STANDING) fits inside the column instead
          // of running into the line it labels, while every summary still
          // starts at the same x.
          fontFamily: 'var(--font)', fontSize: 9.5, fontWeight: 800,
          letterSpacing: '0.14em', color: `${tone}b0`,
          flexShrink: 0, alignSelf: 'flex-start', paddingTop: 4,
          width: 62, whiteSpace: 'nowrap',
        }}>{tag}</span>

        <div style={{ flex: 1, minWidth: 0 }}>{summary}</div>

        {!disabled && (
          <span aria-hidden="true" style={{
            fontSize: 11, color: open ? `${tone}c0` : 'rgba(148,163,184,0.45)',
            flexShrink: 0, alignSelf: 'flex-start', paddingTop: 2,
            transition: 'color 0.15s',
          }}>{open ? '▴' : '▾'}</span>
        )}
      </button>

      {open && !disabled && (
        <div style={{
          padding: '2px 11px 11px',
          borderTop: `1px solid ${tone}22`,
          animation: 'fadeInPlace 0.16s ease',
        }}>
          {children}
        </div>
      )}
    </section>
  )
}
