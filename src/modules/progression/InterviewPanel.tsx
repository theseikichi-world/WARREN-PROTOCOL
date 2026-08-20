import { useEffect, useRef, useState } from 'react'
import { t as tr } from '../../i18n'
import type { Interview } from './spine'

// ─── THE INTERVIEW — the guide asks before it plans ───────────────────────────
// The guide used to know two things about the person it was writing a life plan
// for: what time they wake up, and what time they sleep. Everything else it
// invented. It would propose a weekly coach to someone with no money for one and
// a 5am rehearsal to someone who works nights, and the failure would look like a
// failure of will.
//
// This is not character creation. Nothing here is a class, an alignment or a
// personality; every question is about a FACT the plan turns on, the guide wrote
// the questions for THIS dream after reading it, and each one carries its own
// reason so answering never feels like paperwork.
//
// One question at a time, and every one is skippable. An interview you cannot
// leave is a form with a costume on.

const DIM = 'rgba(148,163,184,0.55)'

export function InterviewPanel({ interview, accent, dreamTitle, onDone, onCancel }: {
  interview:  Interview
  accent:     string
  dreamTitle: string
  /** The answers, keyed by question. Skipped questions are simply absent. */
  onDone:     (answers: Record<string, string>) => void
  onCancel:   () => void
}) {
  const [i, setI]             = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>(interview.answers ?? {})
  const [draft, setDraft]     = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  const q     = interview.questions[i]
  const last  = i >= interview.questions.length - 1
  const total = interview.questions.length

  // Each question arrives with the cursor already in the box and whatever was
  // typed for it last time, so going back never costs an answer.
  useEffect(() => {
    setDraft(q ? (answers[q.key] ?? '') : '')
    const t = setTimeout(() => ref.current?.focus(), 60)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, q?.key])

  if (!q) { onDone(answers); return null }

  const commit = (value: string): Record<string, string> => {
    const next = { ...answers }
    if (value.trim()) next[q.key] = value.trim()
    else delete next[q.key]           // skipping clears rather than storing ''
    setAnswers(next)
    return next
  }

  const advance = (value: string) => {
    const next = commit(value)
    if (last) onDone(next)
    else setI(i + 1)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', flexDirection: 'column',
      background: 'rgba(2,6,12,0.97)', backdropFilter: 'blur(6px)' }}>

      {/* Header */}
      <div style={{ flexShrink: 0, padding: '11px 14px', borderBottom: `1px solid ${accent}20`,
        display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 900, color: accent,
            letterSpacing: '0.2em', textShadow: `0 0 10px ${accent}80` }}>
            {tr('THE GUIDE IS ASKING', 'ГИД СПРАШИВАЕТ')}
          </p>
          <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: DIM, marginTop: 3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dreamTitle}</p>
        </div>
        <span style={{ fontFamily: 'var(--font)', fontSize: 11, color: DIM, flexShrink: 0,
          letterSpacing: '0.12em' }}>{i + 1} / {total}</span>
        <button onClick={onCancel} style={{ background: 'transparent', border: 'none',
          cursor: 'pointer', color: DIM, fontSize: 15.5 }}>✕</button>
      </div>

      {/* Progress — one pip per question, filled where an answer exists */}
      <div style={{ flexShrink: 0, display: 'flex', gap: 3, padding: '8px 14px 0' }}>
        {interview.questions.map((x, n) => (
          <div key={x.key} style={{
            flex: 1, height: 2, borderRadius: 1,
            background: n === i ? accent
              : answers[x.key] ? `${accent}70`
              : 'rgba(255,255,255,0.09)',
            boxShadow: n === i ? `0 0 6px ${accent}` : 'none',
            transition: 'background 0.2s',
          }} />
        ))}
      </div>

      {/* The question */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>
        <div style={{ maxWidth: 460, margin: '0 auto' }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 14.5, fontWeight: 700, lineHeight: 1.5,
            color: 'rgba(230,242,255,0.94)', letterSpacing: '0.02em' }}>
            {q.question}
          </p>

          {q.why && (
            <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, lineHeight: 1.7, marginTop: 9,
              color: 'rgba(200,215,240,0.5)', fontStyle: 'italic',
              borderLeft: `2px solid ${accent}30`, paddingLeft: 9 }}>
              {q.why}
            </p>
          )}

          <textarea
            ref={ref}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              // Enter sends, Shift+Enter breaks the line. Escape leaves entirely.
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); advance(draft) }
              if (e.key === 'Escape') onCancel()
            }}
            rows={3}
            placeholder={q.hint || tr('your answer', 'ваш ответ')}
            style={{
              width: '100%', marginTop: 14, padding: '10px 12px', borderRadius: 8, resize: 'none',
              background: 'rgba(2,8,16,0.7)', border: `1px solid ${accent}35`, outline: 'none',
              fontFamily: 'var(--font)', fontSize: 12.5, lineHeight: 1.6,
              color: 'rgba(230,242,255,0.92)', letterSpacing: '0.02em',
            }}
            onFocus={e => e.target.style.borderColor = `${accent}70`}
            onBlur={e => e.target.style.borderColor = `${accent}35`}
          />

          <p style={{ fontFamily: 'var(--font)', fontSize: 10.5, color: 'rgba(148,163,184,0.35)',
            marginTop: 6, letterSpacing: '0.04em' }}>
            {tr('Enter to answer · Shift+Enter for a new line', 'Enter — ответить · Shift+Enter — новая строка')}
          </p>

          {/* An honest "no" is a real answer and worth as much as a number. */}
          <p style={{ fontFamily: 'var(--font)', fontSize: 11, color: 'rgba(148,163,184,0.4)',
            marginTop: 12, lineHeight: 1.6 }}>
            {tr('"None", "no idea" and "I have tried and it did not work" are all useful answers. A guess you do not mean is not.',
                '«Нет», «не знаю» и «пробовал, не вышло» — полезные ответы. Выдумка — нет.')}
          </p>
        </div>
      </div>

      {/* Footer */}
      <div style={{ flexShrink: 0, padding: '10px 14px', borderTop: `1px solid ${accent}18`,
        background: 'rgba(2,8,14,0.8)', display: 'flex', alignItems: 'center', gap: 8 }}>
        {i > 0 && (
          <button onClick={() => { commit(draft); setI(i - 1) }} style={{
            padding: '8px 12px', borderRadius: 7, cursor: 'pointer', background: 'transparent',
            border: '1px solid rgba(255,255,255,0.12)', fontFamily: 'var(--font)', fontSize: 10.5,
            fontWeight: 700, letterSpacing: '0.12em', color: DIM,
          }}>← {tr('BACK', 'НАЗАД')}</button>
        )}
        <button onClick={() => advance('')} style={{
          padding: '8px 12px', borderRadius: 7, cursor: 'pointer', background: 'transparent',
          border: '1px solid rgba(255,255,255,0.12)', fontFamily: 'var(--font)', fontSize: 10.5,
          fontWeight: 700, letterSpacing: '0.12em', color: DIM,
        }}>{tr('SKIP', 'ПРОПУСТИТЬ')}</button>

        <button onClick={() => advance(draft)} style={{
          flex: 1, padding: '9px', borderRadius: 7, cursor: 'pointer', border: 'none',
          fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 900, letterSpacing: '0.14em',
          color: '#02121a', background: `linear-gradient(135deg, ${accent}, ${accent}b0)`,
          boxShadow: `0 0 16px ${accent}40`,
        }}>
          {last ? `◈ ${tr('WRITE THE SPINE', 'ПИСАТЬ ОСТОВ')}` : tr('NEXT', 'ДАЛЬШЕ')}
        </button>
      </div>
    </div>
  )
}
