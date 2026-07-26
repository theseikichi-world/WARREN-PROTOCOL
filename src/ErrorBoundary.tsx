import React from 'react'
import { downloadBackup } from './backup'
import { t } from './i18n'

// Last line of defence: a render crash (bad state, corrupted localStorage entry)
// must never leave the user staring at a white screen with their data trapped
// inside. Show what happened, offer a reload — and a backup download so the
// data has an exit even while the app is down.

interface State { error: Error | null }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children

    const btn: React.CSSProperties = {
      padding: '10px 22px', borderRadius: 7, cursor: 'pointer',
      fontFamily: 'var(--font)', fontSize: 11, fontWeight: 800, letterSpacing: '0.1em',
      color: '#00f5ff', border: '1px solid rgba(0,245,255,0.4)',
      background: 'rgba(0,245,255,0.08)',
    }

    return (
      <div style={{
        height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 14, padding: 30, textAlign: 'center',
        background: 'rgba(6,11,22,0.97)',
      }}>
        <span style={{ fontSize: 34 }}>🛠</span>
        <p style={{ fontFamily: 'var(--font)', fontSize: 14, fontWeight: 900, color: '#00f5ff',
          letterSpacing: '0.14em' }}>{t('SYSTEM FAULT', 'СБОЙ СИСТЕМЫ')}</p>
        <p style={{ fontFamily: 'var(--font)', fontSize: 10, color: 'rgba(148,163,184,0.7)',
          lineHeight: 1.7, maxWidth: 320 }}>
          {t('Warren hit an unexpected error. Your data is safe on this machine — reload to recover, or download a backup first.',
             'Warren столкнулся с неожиданной ошибкой. Ваши данные на этой машине целы — перезагрузитесь или сначала скачайте резервную копию.')}
        </p>
        <p style={{ fontFamily: 'var(--font)', fontSize: 8, color: 'rgba(255,68,68,0.6)',
          maxWidth: 340, wordBreak: 'break-word' }}>{this.state.error.message}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={btn} onClick={() => window.location.reload()}>
            ↻ {t('RELOAD', 'ПЕРЕЗАГРУЗИТЬ')}</button>
          <button style={{ ...btn, color: '#ffd700', borderColor: 'rgba(255,215,0,0.4)',
            background: 'rgba(255,215,0,0.08)' }}
            onClick={() => { try { downloadBackup() } catch { /* storage itself broken */ } }}>
            ⬇ {t('BACKUP DATA', 'СОХРАНИТЬ ДАННЫЕ')}</button>
        </div>
      </div>
    )
  }
}
