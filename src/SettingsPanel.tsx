import { useState, useEffect } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart'
import { type Settings, ACCENT_PRESETS, CLAUDE_MODELS, DEFAULT_MODEL, AI_TASKS, modelForTask, saveSettings, applySettings } from './settings'
import { downloadBackup, exportAllJson, importBackup } from './backup'

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
      fontSize: 8, fontWeight: 700, letterSpacing: '0.2em',
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
        <p style={{ fontSize: 10, color: 'rgba(220,240,255,0.8)', fontFamily: 'var(--font)', letterSpacing: '0.04em' }}>
          {label}
        </p>
        {sub && <p style={{ fontSize: 8, color: 'rgba(148,163,184,0.4)', fontFamily: 'var(--font)', marginTop: 1 }}>{sub}</p>}
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
  const [visible, setVisible] = useState(false)
  const [autostartLoading, setAutostartLoading] = useState(false)
  const [backupMsg, setBackupMsg] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')

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

  // Sync autostart state from OS on mount
  useEffect(() => {
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
            <span style={{ fontSize: 14 }}>⚙️</span>
            <p style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.18em',
              color: acc, textShadow: `0 0 8px ${acc}`,
              fontFamily: 'var(--font)', textTransform: 'uppercase',
            }}>Settings</p>
          </div>
          <button
            onClick={close}
            style={{
              width: 22, height: 22, borderRadius: 5, fontSize: 12,
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

          {/* ── Appearance ── */}
          <Section label="Appearance" />

          {/* Accent color */}
          <p style={{ fontSize: 9, color: 'rgba(148,163,184,0.5)', fontFamily: 'var(--font)', marginBottom: 8, letterSpacing: '0.06em' }}>
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
              <p style={{ fontSize: 9, color: 'rgba(148,163,184,0.5)', fontFamily: 'var(--font)', letterSpacing: '0.06em' }}>
                Window opacity
              </p>
              <p style={{ fontSize: 9, color: acc, fontFamily: 'var(--font)', fontWeight: 700 }}>
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
              <span style={{ fontSize: 7.5, color: 'rgba(148,163,184,0.3)', fontFamily: 'var(--font)' }}>45%</span>
              <span style={{ fontSize: 7.5, color: 'rgba(148,163,184,0.3)', fontFamily: 'var(--font)' }}>100%</span>
            </div>
          </div>

          {/* ── Behavior ── */}
          <Section label="Behavior" />

          <Row label="Always on top" sub="Keep Warren above other windows">
            <Toggle on={settings.alwaysOnTop} onChange={handleAlwaysOnTop} accent={acc} />
          </Row>

          <Row label="Start on startup" sub="Launch Warren when Windows starts">
            <Toggle
              on={settings.startOnStartup}
              onChange={autostartLoading ? () => {} : handleAutostart}
              accent={acc}
            />
          </Row>

          <Row label="Show intro animation" sub="Matrix boot screen on launch">
            <Toggle on={settings.showIntro} onChange={v => update({ showIntro: v })} accent={acc} />
          </Row>

          {/* ── Profile ── */}
          <Section label="Profile" />

          <p style={{ fontSize: 9, color: 'rgba(148,163,184,0.5)', fontFamily: 'var(--font)', marginBottom: 6, letterSpacing: '0.06em' }}>
            Display name
          </p>
          <input
            type="text"
            value={settings.displayName}
            onChange={e => update({ displayName: e.target.value })}
            placeholder="Leave empty to use system username"
            maxLength={32}
            style={{
              width: '100%', padding: '8px 10px',
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid rgba(255,255,255,0.08)`,
              borderRadius: 6, outline: 'none',
              fontFamily: 'var(--font)', fontSize: 10,
              color: 'rgba(220,240,255,0.8)',
              letterSpacing: '0.06em',
              transition: 'border-color 0.15s',
              userSelect: 'text', WebkitUserSelect: 'text',
            }}
            onFocus={e => e.target.style.borderColor = `${acc}50`}
            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
          />

          {/* ── AI ── */}
          <Section label="AI Assistant" />

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
                fontWeight: 700, marginBottom: 4 }}>⚠ NO API KEY</p>
              <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-2xs)',
                color: 'rgba(255,107,0,0.6)', lineHeight: 1.6 }}>
                AI features (L.O.G analysis, A.R.D.O, Solaris deliveries) need a Claude key.
                Paste it below — it stays on this machine.
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
          <Section label="Data Sources" />
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
          <Section label="Backup" />
          <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-2xs)', color: 'rgba(148,163,184,0.45)',
            lineHeight: 1.6, marginBottom: 10 }}>
            All Warren data lives on this machine. Export a backup file regularly —
            habits, goals, texts, journal, library, everything.
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

          {/* ── About ── */}
          <Section label="About" />
          <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p style={{ fontSize: 9, color: acc, fontFamily: 'var(--font)', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 4 }}>
              WARREN v0.1.0
            </p>
            <p style={{ fontSize: 8, color: 'rgba(148,163,184,0.35)', fontFamily: 'var(--font)', lineHeight: 1.6 }}>
              Personal life hub · Tauri v2 + React
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
