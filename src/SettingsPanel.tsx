import { useState, useEffect } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart'
import { type Settings, ACCENT_PRESETS, CLAUDE_MODELS, DEFAULT_MODEL, AI_TASKS, modelForTask, saveSettings, applySettings, isTauri } from './settings'
import { downloadBackup, exportAllJson, importBackup, resetProgress, resetKeys } from './backup'
import {
  syncOnce, deviceLabel, localFingerprint, saveMark, snapshotLocal, lastStatus,
  lastSnapshot, restoreSnapshot,
  pushRemote, applyRemote, type SyncSettings, type RemoteRecord,
} from './sync'
import { useLocale, setLocale, t } from './i18n'
import { forgetTours } from './tour'
import { chronotype, CHRONOTYPE_LABEL, type Gender } from './profile'
import { play as playCue } from './sound'

const conflictBtn = (color: string): React.CSSProperties => ({
  flex: 1, padding: '7px 4px', borderRadius: 6, cursor: 'pointer',
  fontFamily: 'var(--font)', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em',
  color, background: 'transparent', border: `1px solid ${color}55`,
})

const GENDER_OPTIONS: { value: Gender; en: string; ru: string }[] = [
  { value: 'male',   en: 'MALE',   ru: 'МУЖСКОЙ' },
  { value: 'female', en: 'FEMALE', ru: 'ЖЕНСКИЙ' },
  { value: 'other',  en: 'OTHER',  ru: 'ДРУГОЕ' },
]

// ─── Toggle switch ────────────────────────────────────────────────────────────
function Toggle({ on, onChange, accent }: { on: boolean; onChange: (v: boolean) => void; accent: string }) {
  return (
    <button
      onClick={() => onChange(!on)}
      style={{
        width: 36, height: 20, borderRadius: 10, flexShrink: 0,
        background: on ? `${accent}30` : 'rgba(255,255,255,0.06)',
        border: `1px solid ${on ? `${accent}60` : 'rgba(255,255,255,0.1)'}`,
        position: 'relative', transition: 'all 0.2s', cursor: 'pointer',
      }}
    >
      <div style={{
        position: 'absolute', top: 2,
        left: on ? 18 : 2,
        width: 14, height: 14, borderRadius: 7,
        background: on ? accent : 'rgba(148,163,184,0.4)',
        boxShadow: on ? `0 0 6px ${accent}` : 'none',
        transition: 'all 0.2s',
      }} />
    </button>
  )
}

// ─── Section header ───────────────────────────────────────────────────────────
function Section({ label }: { label: string }) {
  return (
    <p style={{
      fontSize: 10.5, fontWeight: 700, letterSpacing: '0.2em',
      textTransform: 'uppercase', color: 'rgba(148,163,184,0.4)',
      margin: '18px 0 10px', fontFamily: 'var(--font)',
    }}>{label}</p>
  )
}

// ─── Row ──────────────────────────────────────────────────────────────────────
function Row({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <div>
        <p style={{ fontSize: 12.5, color: 'rgba(220,240,255,0.8)', fontFamily: 'var(--font)', letterSpacing: '0.04em' }}>
          {label}
        </p>
        {sub && <p style={{ fontSize: 10.5, color: 'rgba(148,163,184,0.4)', fontFamily: 'var(--font)', marginTop: 1 }}>{sub}</p>}
      </div>
      {children}
    </div>
  )
}

// ─── Settings panel ───────────────────────────────────────────────────────────
interface Props {
  settings: Settings
  onClose: () => void
  onChange: (s: Settings) => void
}

export default function SettingsPanel({ settings, onClose, onChange }: Props) {
  const locale = useLocale()
  const [visible, setVisible] = useState(false)
  const [autostartLoading, setAutostartLoading] = useState(false)
  const [backupMsg, setBackupMsg] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [resetArmed, setResetArmed] = useState(false)
  const [syncBusy, setSyncBusy] = useState(false)
  const [syncMsg, setSyncMsg]   = useState('')
  const [conflict, setConflict] = useState<RemoteRecord | null>(null)

  const syncCfg = (): SyncSettings =>
    ({ url: settings.syncUrl, passphrase: settings.syncPassphrase, bypass: settings.syncBypass })

  const snapshot = lastSnapshot()

  /** Put back whatever the last pull replaced. Confirmed, because it cuts both ways. */
  const undoPull = () => {
    if (!snapshot) return
    if (!window.confirm(t(
      'Restore the snapshot taken before the last sync? Anything done since will be replaced.',
      'Восстановить снимок, сделанный перед последней синхронизацией? Всё, что сделано после, будет заменено.'))) return
    try {
      restoreSnapshot()
      window.location.reload()
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e))
    }
  }

  /** The same round the automatic runs take — only the reporting differs. */
  const runSync = async () => {
    setSyncBusy(true); setSyncMsg(''); setConflict(null)
    try {
      const out = await syncOnce(syncCfg(), deviceLabel())
      if (out.action === 'in-sync') setSyncMsg(`✓ ${t('Already in sync', 'Уже синхронизировано')}`)
      else if (out.action === 'push') setSyncMsg(`✓ ${t('Pushed from this device', 'Отправлено с этого устройства')}`)
      else if (out.action === 'pull') afterPull(out.pulled ?? 0)
      else if (out.remote) setConflict(out.remote)
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e))
    }
    setSyncBusy(false)
  }

  /** A pull replaced localStorage under a running app — reload before it writes back. */
  const afterPull = (n: number) => {
    setSyncMsg(`✓ ${t('Pulled ' + n + ' records — reloading…', 'Получено: ' + n + ' — перезагрузка…')}`)
    setTimeout(() => window.location.reload(), 900)
  }

  /**
   * Resolving a conflict is the one place that overrides the decision, so it is
   * also the one place that always snapshots first — whichever side loses here
   * is still on this device, recoverable from RESTORE SNAPSHOT.
   */
  const resolve = async (choice: 'push' | 'pull') => {
    if (!conflict) return
    setSyncBusy(true)
    try {
      snapshotLocal()
      const cfg = syncCfg()
      if (choice === 'push') {
        const meta = await pushRemote(cfg, deviceLabel(), conflict.updatedAt)
        saveMark({ updatedAt: meta.updatedAt, fingerprint: await localFingerprint() })
        setSyncMsg(`✓ ${t('This device won — the other will pull it next', 'Это устройство победило')}`)
      } else {
        const n = await applyRemote(cfg, conflict)
        saveMark({ updatedAt: conflict.updatedAt, fingerprint: await localFingerprint() })
        afterPull(n)
      }
      setConflict(null)
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e))
    }
    setSyncBusy(false)
  }

  /** How many stored records the reset is about to take, counted at arm time. */
  const resetCount = () =>
    resetKeys(Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) ?? '')).length

  // Slide-in animation
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const close = () => {
    setVisible(false)
    setTimeout(onClose, 250)
  }

  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch }
    saveSettings(next)
    applySettings(next)
    onChange(next)
  }

  const handleAlwaysOnTop = async (v: boolean) => {
    await getCurrentWindow().setAlwaysOnTop(v)
    update({ alwaysOnTop: v })
  }

  const handleAutostart = async (v: boolean) => {
    setAutostartLoading(true)
    try {
      if (v) await enable()
      else    await disable()
      update({ startOnStartup: v })
    } catch (e) {
      console.warn('Autostart error:', e)
    } finally {
      setAutostartLoading(false)
    }
  }

  // Sync autostart state from OS on mount (desktop only)
  useEffect(() => {
    if (!isTauri()) return
    isEnabled().then(enabled => {
      if (enabled !== settings.startOnStartup) update({ startOnStartup: enabled })
    }).catch(() => {})
  }, [])

  const acc = settings.accentColor

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={close}
        style={{
          position: 'absolute', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.3)',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.25s',
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0,
        width: '100%', zIndex: 101,
        background: 'rgba(6,11,22,0.92)',
        backdropFilter: 'blur(20px)',
        borderLeft: `1px solid ${acc}15`,
        transform: visible ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex', flexDirection: 'column',
        boxShadow: `-8px 0 30px rgba(0,0,0,0.5)`,
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 16.5 }}>⚙️</span>
            <p style={{
              fontSize: 12.5, fontWeight: 700, letterSpacing: '0.18em',
              color: acc, textShadow: `0 0 8px ${acc}`,
              fontFamily: 'var(--font)', textTransform: 'uppercase',
            }}>{t('Settings', 'Настройки')}</p>
          </div>
          <button
            onClick={close}
            style={{
              width: 22, height: 22, borderRadius: 5, fontSize: 14.5,
              color: 'rgba(148,163,184,0.4)',
              border: '1px solid rgba(255,255,255,0.07)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#ff4444'; e.currentTarget.style.borderColor = '#ff444440' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(148,163,184,0.4)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)' }}
          >×</button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 20px' }}>

          {/* ── Language ── */}
          <Section label={t('Language', 'Язык')} />
          <Row label={t('App language', 'Язык приложения')}
            sub={t('Module names stay; everything else is translated', 'Названия модулей остаются; остальное переводится')}>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['en', 'ru'] as const).map(l => {
                const on = locale === l
                return (
                  <button key={l} onClick={() => setLocale(l)} style={{
                    padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
                    fontFamily: 'var(--font)', fontSize: 13.5, fontWeight: 800, letterSpacing: '0.06em',
                    color: on ? acc : 'rgba(148,163,184,0.45)',
                    border: `1px solid ${on ? acc : 'rgba(255,255,255,0.08)'}`,
                    background: on ? `${acc}18` : 'transparent', transition: 'all 0.12s',
                  }}>{l === 'en' ? 'EN' : 'RU'}</button>
                )
              })}
            </div>
          </Row>

          {/* ── Appearance ── */}
          <Section label={t('Appearance', 'Оформление')} />

          {/* Accent color */}
          <p style={{ fontSize: 11.5, color: 'rgba(148,163,184,0.5)', fontFamily: 'var(--font)', marginBottom: 8, letterSpacing: '0.06em' }}>
            Accent color
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {ACCENT_PRESETS.map(preset => (
              <button
                key={preset.value}
                onClick={() => update({ accentColor: preset.value })}
                title={preset.name}
                style={{
                  width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                  background: `${preset.value}20`,
                  border: settings.accentColor === preset.value
                    ? `2px solid ${preset.value}`
                    : '2px solid rgba(255,255,255,0.08)',
                  boxShadow: settings.accentColor === preset.value
                    ? `0 0 10px ${preset.value}50`
                    : 'none',
                  transition: 'all 0.15s', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <div style={{
                  width: 12, height: 12, borderRadius: 4,
                  background: preset.value,
                  boxShadow: `0 0 6px ${preset.value}`,
                }} />
              </button>
            ))}
          </div>

          {/* Opacity */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <p style={{ fontSize: 11.5, color: 'rgba(148,163,184,0.5)', fontFamily: 'var(--font)', letterSpacing: '0.06em' }}>
                Window opacity
              </p>
              <p style={{ fontSize: 11.5, color: acc, fontFamily: 'var(--font)', fontWeight: 700 }}>
                {Math.round(settings.opacity * 100)}%
              </p>
            </div>
            <input
              type="range" min={45} max={100} step={1}
              value={Math.round(settings.opacity * 100)}
              onChange={e => update({ opacity: Number(e.target.value) / 100 })}
              style={{
                width: '100%', height: 4, cursor: 'pointer',
                accentColor: acc, appearance: 'none',
                background: `linear-gradient(90deg, ${acc}60 ${settings.opacity * 100}%, rgba(255,255,255,0.08) ${settings.opacity * 100}%)`,
                borderRadius: 2, outline: 'none',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: 10, color: 'rgba(148,163,184,0.3)', fontFamily: 'var(--font)' }}>45%</span>
              <span style={{ fontSize: 10, color: 'rgba(148,163,184,0.3)', fontFamily: 'var(--font)' }}>100%</span>
            </div>
          </div>

          {/* ── Behavior (desktop-only window controls) ── */}
          {isTauri() && <>
          <Section label={t('Behavior', 'Поведение')} />

          <Row label={t('Always on top', 'Поверх всех окон')}
            sub={t('Keep Warren above other windows', 'Warren остаётся поверх остальных окон')}>
            <Toggle on={settings.alwaysOnTop} onChange={handleAlwaysOnTop} accent={acc} />
          </Row>

          <Row label={t('Start on startup', 'Запуск при старте')}
            sub={t('Launch Warren when Windows starts', 'Открывать Warren вместе с Windows')}>
            <Toggle
              on={settings.startOnStartup}
              onChange={autostartLoading ? () => {} : handleAutostart}
              accent={acc}
            />
          </Row>
          </>}

          <Row label={t('Show intro animation', 'Заставка при запуске')}
            sub={t('Matrix boot screen on launch', 'Экран загрузки в стиле «Матрицы»')}>
            <Toggle on={settings.showIntro} onChange={v => update({ showIntro: v })} accent={acc} />
          </Row>

          {/* Changing either of these plays a cue, because the only useful way
              to set a volume is to hear it where you are sitting. */}
          <Row label={t('Sound', 'Звук')}
            sub={t('Quiet synthesised cues — a tap, a reward, a threshold crossed',
                   'Тихие синтезированные сигналы — нажатие, награда, новый уровень')}>
            <Toggle on={settings.sounds} onChange={v => { update({ sounds: v }); if (v) playCue('open') }} accent={acc} />
          </Row>

          {settings.sounds && (
            <Row label={t('Volume', 'Громкость')} sub={`${settings.soundVolume}%`}>
              <input type="range" min={0} max={100} step={5} value={settings.soundVolume}
                onChange={e => update({ soundVolume: Number(e.target.value) })}
                onMouseUp={() => playCue('check')}
                onTouchEnd={() => playCue('check')}
                style={{ width: 130, accentColor: acc }} />
            </Row>
          )}

          <Row
            label={t('Open every module', 'Открыть все модули')}
            sub={t('Ignore level locks. Quests and XP still run — this only unlocks the doors.',
                   'Игнорировать уровни. Квесты и опыт работают — открываются только двери.')}>
            <Toggle on={settings.unlockAll} onChange={v => update({ unlockAll: v })} accent={acc} />
          </Row>

          <Row label={t('Replay the guided tours', 'Показать обучение заново')}
            sub={t('Step-by-step walkthrough on every screen, from the top', 'Пошаговое объяснение на каждом экране, с начала')}>
            <button onClick={() => {
              forgetTours()
              setBackupMsg('✓ Replaying the tours — reloading…')
              setTimeout(() => window.location.reload(), 700)
            }}
              style={{ padding: '5px 11px', borderRadius: 6, cursor: 'pointer',
                fontFamily: 'var(--font)', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em',
                color: acc, background: 'transparent', border: `1px solid ${acc}40` }}>
              ↻ {t('REPLAY', 'ЗАНОВО')}
            </button>
          </Row>

          {/* "Boot into Big Screen" lived here. Warren OS is dormant
              (WARREN_OS_ENABLED in App.tsx), so the toggle controlled nothing a
              user could reach. The setting itself is kept, not deleted — it
              comes back with the surface it belongs to. */}

          {/* ── Profile ── */}
          {/* Collected once at first run (see Onboarding.tsx). Editable here
              because a typo in your own name should not be permanent, and the
              hours genuinely change when a job or a baby does. */}
          <Section label={t('Profile', 'Профиль')} />

          <p style={{ fontSize: 11.5, color: 'rgba(148,163,184,0.5)', fontFamily: 'var(--font)', marginBottom: 6, letterSpacing: '0.06em' }}>
            {t('Display name', 'Отображаемое имя')}
          </p>
          <input
            type="text"
            value={settings.displayName}
            onChange={e => update({ displayName: e.target.value })}
            placeholder={t('Leave empty to use system username', 'Оставьте пустым — возьмём имя из системы')}
            maxLength={32}
            style={{
              width: '100%', padding: '8px 10px',
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid rgba(255,255,255,0.08)`,
              borderRadius: 6, outline: 'none',
              fontFamily: 'var(--font)', fontSize: 12.5,
              color: 'rgba(220,240,255,0.8)',
              letterSpacing: '0.06em',
              transition: 'border-color 0.15s',
              userSelect: 'text', WebkitUserSelect: 'text',
              boxSizing: 'border-box',
            }}
            onFocus={e => e.target.style.borderColor = `${acc}50`}
            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
          />

          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            {GENDER_OPTIONS.map(g => {
              const on = settings.gender === g.value
              return (
                <button key={g.value} onClick={() => update({ gender: on ? '' : g.value })}
                  style={{ flex: 1, padding: '7px 4px', borderRadius: 6, cursor: 'pointer',
                    fontFamily: 'var(--font)', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em',
                    color: on ? '#02121a' : 'rgba(148,163,184,0.55)',
                    background: on ? acc : 'transparent',
                    border: `1px solid ${on ? acc : 'rgba(255,255,255,0.1)'}` }}>
                  {t(g.en, g.ru)}
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 10.5, color: 'rgba(148,163,184,0.5)', fontFamily: 'var(--font)', marginBottom: 5, letterSpacing: '0.08em' }}>
                {t('I WAKE AT', 'ПОДЪЁМ В')}
              </p>
              <input type="time" value={settings.wakeTime} onChange={e => update({ wakeTime: e.target.value })}
                style={{ width: '100%', padding: '7px 9px', borderRadius: 6, boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                  fontFamily: 'var(--font)', fontSize: 12.5, color: 'rgba(220,240,255,0.8)', outline: 'none' }} />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 10.5, color: 'rgba(148,163,184,0.5)', fontFamily: 'var(--font)', marginBottom: 5, letterSpacing: '0.08em' }}>
                {t('I SLEEP AT', 'ОТБОЙ В')}
              </p>
              <input type="time" value={settings.sleepTime} onChange={e => update({ sleepTime: e.target.value })}
                style={{ width: '100%', padding: '7px 9px', borderRadius: 6, boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                  fontFamily: 'var(--font)', fontSize: 12.5, color: 'rgba(220,240,255,0.8)', outline: 'none' }} />
            </div>
          </div>

          <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-2xs)', color: 'rgba(148,163,184,0.45)',
            lineHeight: 1.6, marginTop: 8 }}>
            <strong style={{ color: acc }}>
              {t(CHRONOTYPE_LABEL[chronotype(settings.sleepTime, settings.wakeTime)].en,
                 CHRONOTYPE_LABEL[chronotype(settings.sleepTime, settings.wakeTime)].ru)}
            </strong>
            {' — '}
            {t(CHRONOTYPE_LABEL[chronotype(settings.sleepTime, settings.wakeTime)].note,
               CHRONOTYPE_LABEL[chronotype(settings.sleepTime, settings.wakeTime)].noteRu)}
            {' '}
            {t('The guide anchors every routine cue inside these hours.',
               'Гид ставит якоря рутин внутри этих часов.')}
          </p>

          {/* ── AI ── */}
          <Section label={t('AI Assistant', 'ИИ-ассистент')} />

          <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-2xs)', color: 'rgba(148,163,184,0.45)',
            lineHeight: 1.6, marginBottom: 10, letterSpacing: '0.03em' }}>
            Warren is powered by <strong style={{ color: acc }}>Claude</strong>. Paste your API key
            from <strong style={{ color: 'rgba(220,240,255,0.7)' }}>console.anthropic.com</strong> → API Keys.
          </p>

          {/* Status */}
          {!settings.aiApiKey ? (
            <div style={{ padding: '10px 12px', borderRadius: 7, marginBottom: 12,
              background: 'rgba(255,107,0,0.07)', border: '1px solid rgba(255,107,0,0.3)' }}>
              <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', color: '#ff6b00',
                fontWeight: 700, marginBottom: 4 }}>⚠ {t('NO API KEY', 'НЕТ API-КЛЮЧА')}</p>
              <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-2xs)',
                color: 'rgba(255,107,0,0.6)', lineHeight: 1.6 }}>
                {t('AI features (dream analysis, A.R.D.O, Solaris deliveries) need a Claude key. Paste it below — it stays on this machine.',
                   'Функциям ИИ (разбор мечты, A.R.D.O, поставки SOLARIS) нужен ключ Claude. Вставьте его ниже — он не покинет этот компьютер.')}
              </p>
            </div>
          ) : (
            <div style={{ padding: '7px 12px', borderRadius: 6, marginBottom: 10,
              background: 'rgba(57,255,20,0.05)', border: '1px solid rgba(57,255,20,0.18)' }}>
              <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', color: '#39ff14', fontWeight: 700 }}>
                <span className="pulse">●</span> Claude connected · {
                  CLAUDE_MODELS.find(m => m.id === settings.aiModel)?.label ?? settings.aiModel
                }
              </p>
            </div>
          )}

          {/* API Key */}
          <p style={{ fontSize: 'var(--fs-2xs)', color: 'rgba(148,163,184,0.5)', fontFamily: 'var(--font)', marginBottom: 5, letterSpacing: '0.06em' }}>
            Claude API Key
          </p>
          <input type="password" value={settings.aiApiKey} onChange={e => update({ aiApiKey: e.target.value.trim() })}
            placeholder="sk-ant-..."
            style={{ width: '100%', padding: '7px 10px', borderRadius: 5, marginBottom: 14,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              outline: 'none', fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)',
              color: 'rgba(220,240,255,0.8)',
              userSelect: 'text', WebkitUserSelect: 'text',
            }}
            onFocus={e => e.target.style.borderColor = `${acc}50`}
            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
          />

          {/* Model picker */}
          <p style={{ fontSize: 'var(--fs-2xs)', color: 'rgba(148,163,184,0.5)', fontFamily: 'var(--font)', marginBottom: 3, letterSpacing: '0.06em' }}>
            Default model
          </p>
          <p style={{ fontSize: 'var(--fs-2xs)', color: 'rgba(148,163,184,0.3)', fontFamily: 'var(--font)', marginBottom: 6, lineHeight: 1.4 }}>
            Fallback when a task below has no specific model.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 16 }}>
            {CLAUDE_MODELS.map(m => {
              const on = (settings.aiModel || DEFAULT_MODEL) === m.id
              return (
                <button key={m.id} onClick={() => update({ aiModel: m.id })}
                  style={{
                    padding: '8px 10px', borderRadius: 6, textAlign: 'left', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: on ? `${acc}0c` : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${on ? `${acc}35` : 'rgba(255,255,255,0.06)'}`,
                    transition: 'all 0.15s',
                  }}>
                  <span style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', color: on ? acc : 'rgba(148,163,184,0.5)' }}>
                    {on ? '◉' : '○'}
                  </span>
                  <span style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: on ? 700 : 400,
                    color: on ? acc : 'rgba(148,163,184,0.7)', letterSpacing: '0.04em', flex: 1 }}>
                    {m.label}
                  </span>
                  <span style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-2xs)', color: 'rgba(148,163,184,0.35)' }}>
                    {m.sub}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Per-task routing — only meaningful once a key is set */}
          {!!settings.aiApiKey && (
            <>
              <p style={{ fontSize: 'var(--fs-2xs)', color: 'rgba(148,163,184,0.5)', fontFamily: 'var(--font)', marginBottom: 3, letterSpacing: '0.06em' }}>
                Per-task models
              </p>
              <p style={{ fontSize: 'var(--fs-2xs)', color: 'rgba(148,163,184,0.3)', fontFamily: 'var(--font)', marginBottom: 8, lineHeight: 1.4 }}>
                Route each feature to the cheapest model that does it well.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                {AI_TASKS.map(task => {
                  const current = modelForTask(settings, task.id)
                  return (
                    <div key={task.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 10px', borderRadius: 6,
                      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700,
                          color: 'rgba(220,240,255,0.75)', letterSpacing: '0.04em' }}>{task.label}</p>
                        <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-2xs)',
                          color: 'rgba(148,163,184,0.4)', lineHeight: 1.4, marginTop: 1 }}>{task.desc}</p>
                      </div>
                      <select
                        value={current}
                        onChange={e => update({ taskModels: { ...settings.taskModels, [task.id]: e.target.value } })}
                        style={{
                          flexShrink: 0, padding: '5px 6px', borderRadius: 5, cursor: 'pointer',
                          background: 'rgba(0,0,0,0.4)', border: `1px solid ${acc}30`, outline: 'none',
                          fontFamily: 'var(--font)', fontSize: 'var(--fs-2xs)', color: acc,
                        }}
                      >
                        {CLAUDE_MODELS.map(m => (
                          <option key={m.id} value={m.id} style={{ background: '#0a0f1a', color: '#dce8ff' }}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* ── Data sources (Galactic Pictures) ── */}
          <Section label={t('Data Sources', 'Источники данных')} />
          <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-2xs)', color: 'rgba(148,163,184,0.45)',
            lineHeight: 1.6, marginBottom: 10, letterSpacing: '0.03em' }}>
            Used by <strong style={{ color: '#ff6b00' }}>Galactic Pictures</strong> for movies, shows & games. Both are free.
          </p>
          {([
            { key: 'tmdbApiKey' as const, label: 'TMDB API Key', hint: 'themoviedb.org/settings/api — movies, TV, posters, episodes' },
            { key: 'rawgApiKey' as const, label: 'RAWG API Key', hint: 'rawg.io/apidocs — games with Metacritic scores' },
          ]).map(({ key, label, hint }) => (
            <div key={key} style={{ marginBottom: 12 }}>
              <p style={{ fontSize: 'var(--fs-2xs)', color: 'rgba(148,163,184,0.5)', fontFamily: 'var(--font)', marginBottom: 4, letterSpacing: '0.06em' }}>
                {label} {settings[key] ? <span style={{ color: '#39ff14' }}>●</span> : null}
              </p>
              <input type="password" value={settings[key]} onChange={e => update({ [key]: e.target.value.trim() } as Partial<Settings>)}
                placeholder="paste key…"
                style={{ width: '100%', padding: '7px 10px', borderRadius: 5,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                  outline: 'none', fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)',
                  color: 'rgba(220,240,255,0.8)', userSelect: 'text', WebkitUserSelect: 'text' }}
                onFocus={e => e.target.style.borderColor = `${acc}50`}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
              />
              <p style={{ fontSize: 'var(--fs-2xs)', color: 'rgba(148,163,184,0.3)', fontFamily: 'var(--font)', marginTop: 3, lineHeight: 1.4 }}>{hint}</p>
            </div>
          ))}

          {/* ── Backup ── */}
          <Section label={t('Backup', 'Резервная копия')} />
          <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-2xs)', color: 'rgba(148,163,184,0.45)',
            lineHeight: 1.6, marginBottom: 10 }}>
            {t('All Warren data lives on this machine. Export a backup file regularly — habits, goals, texts, journal, library, everything. API keys are never included in backups.',
               'Все данные Warren хранятся на этой машине. Регулярно выгружайте резервную копию — привычки, цели, тексты, журнал, библиотека, всё. API-ключи в копию никогда не попадают.')}
          </p>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <button onClick={() => { try { downloadBackup(); setBackupMsg('✓ Backup downloaded') } catch { setBackupMsg('Download failed — use Copy') } }}
              style={{ flex: 1, padding: '8px', borderRadius: 6, cursor: 'pointer',
                fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.08em',
                color: acc, border: `1px solid ${acc}40`, background: `${acc}0c` }}>
              ⬇ EXPORT FILE</button>
            <button onClick={async () => {
              try { await navigator.clipboard.writeText(exportAllJson()); setBackupMsg('✓ Copied to clipboard') }
              catch { setBackupMsg('Clipboard blocked — use Export File') }
            }}
              style={{ flex: 1, padding: '8px', borderRadius: 6, cursor: 'pointer',
                fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.08em',
                color: 'rgba(220,240,255,0.6)', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent' }}>
              ⧉ COPY JSON</button>
            <button onClick={() => { setImportOpen(v => !v); setBackupMsg('') }}
              style={{ flex: 1, padding: '8px', borderRadius: 6, cursor: 'pointer',
                fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.08em',
                color: importOpen ? '#ff6b00' : 'rgba(220,240,255,0.6)',
                border: `1px solid ${importOpen ? 'rgba(255,107,0,0.4)' : 'rgba(255,255,255,0.1)'}`,
                background: importOpen ? 'rgba(255,107,0,0.08)' : 'transparent' }}>
              ⬆ IMPORT</button>
          </div>
          {backupMsg && (
            <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-2xs)',
              color: backupMsg.startsWith('✓') ? '#39ff14' : '#ff6b00', marginBottom: 8 }}>{backupMsg}</p>
          )}
          {importOpen && (
            <div style={{ marginBottom: 12 }}>
              <textarea value={importText} onChange={e => setImportText(e.target.value)} rows={4}
                placeholder='Paste a Warren backup JSON here…'
                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, resize: 'none',
                  background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,107,0,0.25)', outline: 'none',
                  fontFamily: 'var(--font)', fontSize: 'var(--fs-2xs)', color: 'rgba(220,240,255,0.8)',
                  boxSizing: 'border-box', userSelect: 'text', WebkitUserSelect: 'text' }}/>
              <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-2xs)', color: 'rgba(255,107,0,0.6)',
                margin: '4px 0 6px', lineHeight: 1.5 }}>
                ⚠ Restoring overwrites current data for every key in the backup, then reloads.
              </p>
              <button disabled={!importText.trim()} onClick={() => {
                try {
                  const n = importBackup(importText)
                  setBackupMsg(`✓ Restored ${n} keys — reloading…`)
                  setTimeout(() => window.location.reload(), 800)
                } catch (e) {
                  setBackupMsg(e instanceof Error ? e.message : 'Import failed')
                }
              }}
                style={{ width: '100%', padding: '8px', borderRadius: 6,
                  cursor: importText.trim() ? 'pointer' : 'default',
                  fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 800, letterSpacing: '0.1em',
                  color: importText.trim() ? '#ff6b00' : 'rgba(148,163,184,0.3)',
                  border: `1px solid ${importText.trim() ? 'rgba(255,107,0,0.45)' : 'rgba(255,255,255,0.06)'}`,
                  background: importText.trim() ? 'rgba(255,107,0,0.1)' : 'transparent' }}>
                RESTORE & RELOAD</button>
            </div>
          )}

          {/* ── Sync ── */}
          {/* One blob, encrypted here, stored somewhere that cannot read it.
              The conflict case is a question on purpose - see sync.ts. */}
          <Section label={t('Sync across devices', 'Синхронизация')} />
          <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: 'rgba(148,163,184,0.45)',
            lineHeight: 1.6, marginBottom: 10 }}>
            {t('Same passphrase on two devices = same data, API keys included. It is encrypted before it leaves, so the server stores something it cannot read. The passphrase is the only thing protecting it — make it long. Exported backup files still carry no keys.',
               'Одинаковая фраза на двух устройствах = одни данные, включая API-ключи. Шифруется перед отправкой — сервер хранит то, что не может прочитать. Фраза — единственная защита, сделайте её длинной. В файлах резервных копий ключей по-прежнему нет.')}
          </p>

          <Row label={t('Enable sync', 'Включить')}
            sub={t('Pulls on launch, pushes when you leave',
                   'Забирает при запуске, отправляет при выходе')}>
            <Toggle on={settings.syncEnabled} onChange={v => update({ syncEnabled: v })} accent={acc} />
          </Row>

          {([
            { key: 'syncUrl' as const, label: t('Endpoint', 'Адрес'), ph: 'https://warren-black.vercel.app' },
            { key: 'syncPassphrase' as const, label: t('Passphrase', 'Секретная фраза'), ph: t('the same on every device', 'одинаковая везде') },
            { key: 'syncBypass' as const, label: t('Protection bypass token', 'Токен обхода'), ph: t('only if deployment protection is on', 'если включена защита') },
          ]).map(f => (
            <div key={f.key} style={{ marginBottom: 9 }}>
              <p style={{ fontSize: 11.5, color: 'rgba(148,163,184,0.5)', fontFamily: 'var(--font)',
                marginBottom: 5, letterSpacing: '0.06em' }}>{f.label}</p>
              <input
                type={f.key === 'syncUrl' ? 'text' : 'password'}
                value={settings[f.key]}
                onChange={e => update({ [f.key]: e.target.value } as Partial<Settings>)}
                placeholder={f.ph}
                style={{ width: '100%', padding: '8px 10px', boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 6, outline: 'none', fontFamily: 'var(--font)', fontSize: 12.5,
                  color: 'rgba(220,240,255,0.8)', letterSpacing: '0.06em',
                  userSelect: 'text', WebkitUserSelect: 'text' }} />
            </div>
          ))}

          <button onClick={runSync} disabled={syncBusy || !settings.syncUrl || !settings.syncPassphrase}
            style={{ width: '100%', padding: '9px', borderRadius: 6, marginTop: 2,
              cursor: syncBusy ? 'default' : 'pointer',
              fontFamily: 'var(--font)', fontSize: 12.5, fontWeight: 700, letterSpacing: '0.1em',
              color: acc, border: `1px solid ${acc}40`, background: `${acc}0c` }}>
            {syncBusy ? t('SYNCING…', 'СИНХРОНИЗАЦИЯ…') : `⇅ ${t('SYNC NOW', 'СИНХРОНИЗИРОВАТЬ')}`}
          </button>

          {!syncMsg && !conflict && lastStatus() && (
            <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, marginTop: 8, lineHeight: 1.6,
              color: lastStatus()!.action === 'error' || lastStatus()!.action === 'conflict'
                ? '#ff6b00' : 'rgba(148,163,184,0.55)' }}>
              {new Date(lastStatus()!.at).toLocaleString()} — {lastStatus()!.message}
            </p>
          )}

          {syncMsg && (
            <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, marginTop: 8, lineHeight: 1.6,
              color: syncMsg.startsWith('✓') ? '#39ff14' : '#ff6b00' }}>{syncMsg}</p>
          )}

          {conflict && (
            <div style={{ marginTop: 10, padding: '11px 12px', borderRadius: 8,
              background: 'rgba(255,107,0,0.07)', border: '1px solid rgba(255,107,0,0.4)' }}>
              <p style={{ fontFamily: 'var(--font)', fontSize: 12, fontWeight: 800, color: '#ff9d4d' }}>
                {t('BOTH SIDES CHANGED', 'ИЗМЕНИЛИСЬ ОБЕ')}
              </p>
              <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, lineHeight: 1.6, marginTop: 6,
                color: 'rgba(215,232,248,0.8)' }}>
                {t('The room was last written by ' + conflict.device + '. This device has changes too, so one of them wins — whichever you do not pick is kept as a local snapshot you can restore.',
                   'В комнату последним писал ' + conflict.device + '. Здесь тоже есть изменения — второе останется локальным снимком.')}
              </p>
              <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
                <button onClick={() => resolve('push')} style={conflictBtn(acc)}>
                  {t('KEEP THIS DEVICE', 'ОСТАВИТЬ ЭТО')}
                </button>
                <button onClick={() => resolve('pull')} style={conflictBtn('#ff6b00')}>
                  {t('TAKE THE OTHER', 'ВЗЯТЬ ДРУГОЕ')}
                </button>
                <button onClick={() => { setConflict(null); setSyncMsg('') }} style={conflictBtn('rgba(148,163,184,0.6)')}>
                  {t('CANCEL', 'ОТМЕНА')}
                </button>
              </div>
            </div>
          )}

          {/* The way back. Every pull snapshots first, so a sync that took the
              wrong side is never the end of the story — this is what makes the
              conflict dialog safe to answer quickly. */}
          {snapshot && (
            <button onClick={undoPull} style={{ width: '100%', padding: '8px', borderRadius: 6,
              marginTop: 9, cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 11.5,
              fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(148,163,184,0.75)',
              border: '1px solid rgba(148,163,184,0.25)', background: 'transparent' }}>
              ↩ {t('RESTORE SNAPSHOT', 'ВОССТАНОВИТЬ СНИМОК')} · {new Date(snapshot.at).toLocaleString()}
            </button>
          )}

          {/* ── Start over ── */}
          {/* The one irreversible control in the app, so it is armed in two
              steps and states the count it is about to delete. */}
          <Section label={t('Start over', 'Начать заново')} />
          <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-2xs)', color: 'rgba(148,163,184,0.45)',
            lineHeight: 1.6, marginBottom: 10 }}>
            {t('Wipes the whole record — uplinks, routines and their automatism, XP, quests, dreams, journal, kitchen, texts, library — and your profile with it: name, gender and hours all go, so Warren asks who you are again on the next load. Only the API key and appearance survive. Export a backup first; there is no undo.',
               'Стирает всю запись — каналы, рутины и их автоматизм, опыт, задания, мечты, журнал, кухню, тексты, библиотеку — и профиль вместе с ней: имя, пол и часы исчезнут, при следующем запуске Warren спросит заново. Останутся только API-ключ и оформление. Сначала выгрузите копию — отменить нельзя.')}
          </p>

          {!resetArmed ? (
            <button onClick={() => setResetArmed(true)}
              style={{ width: '100%', padding: '8px', borderRadius: 6, cursor: 'pointer',
                fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.1em',
                color: 'rgba(255,0,51,0.75)', border: '1px solid rgba(255,0,51,0.3)', background: 'transparent' }}>
              ⚠ {t('RESET EVERYTHING', 'СБРОСИТЬ ВСЁ')}</button>
          ) : (
            <div style={{ padding: '10px 12px', borderRadius: 8,
              background: 'rgba(255,0,51,0.06)', border: '1px solid rgba(255,0,51,0.3)' }}>
              <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', color: '#ff4444',
                lineHeight: 1.6, marginBottom: 8 }}>
                {t(`This deletes ${resetCount()} stored records and reloads Warren empty. It cannot be undone.`,
                   `Будет удалено записей: ${resetCount()}. Warren перезапустится пустым. Отменить нельзя.`)}
              </p>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => {
                  const n = resetProgress()
                  setBackupMsg(`✓ ${n} keys cleared — reloading…`)
                  setTimeout(() => window.location.reload(), 700)
                }}
                  style={{ flex: 1, padding: '8px', borderRadius: 6, cursor: 'pointer',
                    fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 800, letterSpacing: '0.1em',
                    color: '#ff0033', border: '1px solid rgba(255,0,51,0.5)', background: 'rgba(255,0,51,0.12)' }}>
                  {t('YES, ERASE IT ALL', 'ДА, СТЕРЕТЬ ВСЁ')}</button>
                <button onClick={() => setResetArmed(false)}
                  style={{ flex: 1, padding: '8px', borderRadius: 6, cursor: 'pointer',
                    fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.1em',
                    color: 'rgba(220,240,255,0.6)', border: '1px solid rgba(255,255,255,0.12)', background: 'transparent' }}>
                  {t('KEEP MY DATA', 'ОСТАВИТЬ')}</button>
              </div>
            </div>
          )}

          {/* ── About ── */}
          <Section label={t('About', 'О программе')} />
          <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p style={{ fontSize: 11.5, color: acc, fontFamily: 'var(--font)', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 4 }}>
              WARREN v0.1.0
            </p>
            <p style={{ fontSize: 10.5, color: 'rgba(148,163,184,0.35)', fontFamily: 'var(--font)', lineHeight: 1.6 }}>
              Personal life hub · Tauri v2 + React
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
