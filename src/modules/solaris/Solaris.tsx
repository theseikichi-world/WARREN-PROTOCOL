import { useState, useMemo, useCallback } from 'react'
import {
  type SolarisProfile, type Sex, type ActivityLevel, type Goal, type MealSlot,
  type Targets, type Member,
  ACTIVITY_META, GOAL_META, SLOT_META, SLOT_ORDER, MEMBER_EMOJI, CUP_ML,
  computeTargets, computeBmi, recommendedWaterMl, sumDay, todayKey,
} from './types'
import {
  loadSolarisState, saveSolarisState, type SolarisState,
  activeMember, addMember, updateMemberProfile, renameMember, removeMember, setActiveMember,
  getDay, addEntry, removeEntry, getStreak, getWater, addWater, type NewFoodData,
} from './store'
import { loadSettings, aiJson, modelForTask } from '../../settings'

const NEON     = '#ffb13c'   // solar gold
const NEON_DIM = 'rgba(255,177,60,0.1)'
const SOLAR    = '#ff7a45'   // warm orange
const AQUA     = '#38bdf8'   // water blue

// ─── Macro palette ─────────────────────────────────────────────────────────────
const MACRO = {
  protein: { color: '#ff5470', label: 'PROTEIN' },
  carbs:   { color: '#4ade80', label: 'CARBS'   },
  fat:     { color: '#ffb13c', label: 'FAT'     },
}

// A member's identity + vitals, as edited in the form.
interface MemberDraft { name: string; emoji: string; profile: SolarisProfile }

// ─── Orbital calorie ring (SVG) ────────────────────────────────────────────────
function OrbitRing({ consumed, target }: { consumed: number; target: number }) {
  const R = 52, STROKE = 9, C = 2 * Math.PI * R
  const pct  = target > 0 ? Math.min(1.2, consumed / target) : 0
  const over = consumed > target
  const remaining = target - consumed
  const dash = C * Math.min(1, pct)
  const ringColor = over ? '#ff5470' : pct > 0.85 ? '#4ade80' : NEON

  return (
    <div style={{ position: 'relative', width: 140, height: 140, flexShrink: 0 }}>
      <svg width="140" height="140" viewBox="0 0 140 140" style={{ transform: 'rotate(-90deg)' }}>
        <defs>
          <linearGradient id="solRing" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"  stopColor={SOLAR} />
            <stop offset="100%" stopColor={ringColor} />
          </linearGradient>
        </defs>
        {/* track */}
        <circle cx="70" cy="70" r={R} fill="none" stroke="rgba(255,177,60,0.08)" strokeWidth={STROKE} />
        {/* dotted orbit */}
        <circle cx="70" cy="70" r={R + 9} fill="none" stroke="rgba(255,177,60,0.12)"
          strokeWidth="0.6" strokeDasharray="1.5,4" />
        {/* progress */}
        <circle cx="70" cy="70" r={R} fill="none" stroke="url(#solRing)" strokeWidth={STROKE}
          strokeLinecap="round" strokeDasharray={`${dash} ${C}`}
          style={{ filter: `drop-shadow(0 0 6px ${ringColor}90)`, transition: 'stroke-dasharray 0.6s ease' }} />
      </svg>
      {/* planet core */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <p style={{ fontFamily: 'var(--font)', fontSize: 26, fontWeight: 900, lineHeight: 1,
          color: over ? '#ff5470' : NEON, textShadow: `0 0 14px ${ringColor}80` }}>
          {Math.abs(Math.round(remaining))}
        </p>
        <p style={{ fontFamily: 'var(--font)', fontSize: 7, letterSpacing: '0.12em',
          color: over ? 'rgba(255,84,112,0.6)' : `${NEON}60`, marginTop: 2 }}>
          {over ? 'KCAL OVER' : 'KCAL LEFT'}
        </p>
        <p style={{ fontFamily: 'var(--font)', fontSize: 7, letterSpacing: '0.06em',
          color: 'rgba(148,163,184,0.4)', marginTop: 4 }}>
          {Math.round(consumed)} / {target}
        </p>
      </div>
    </div>
  )
}

// ─── Macro bar ─────────────────────────────────────────────────────────────────
function MacroBar({ kind, consumed, target }: {
  kind: keyof typeof MACRO; consumed: number; target: number
}) {
  const { color, label } = MACRO[kind]
  const pct = target > 0 ? Math.min(100, (consumed / target) * 100) : 0
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontFamily: 'var(--font)', fontSize: 7, fontWeight: 700,
          color, letterSpacing: '0.1em' }}>{label}</span>
        <span style={{ fontFamily: 'var(--font)', fontSize: 7,
          color: 'rgba(148,163,184,0.5)' }}>{Math.round(consumed)}/{target}g</span>
      </div>
      <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color,
          boxShadow: `0 0 6px ${color}70`, borderRadius: 2, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  )
}

// ─── BMI chip ──────────────────────────────────────────────────────────────────
function BmiChip({ profile, showAdvice }: { profile: SolarisProfile; showAdvice?: boolean }) {
  const info = computeBmi(profile)
  if (!info.bmi) return null
  const mismatch = profile.goal !== info.advise
  return (
    <div title={`Healthy weight for your height: ${info.healthyKg[0]}–${info.healthyKg[1]} kg`}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '3px 8px', borderRadius: 6, background: `${info.color}14`, border: `1px solid ${info.color}40` }}>
        <span style={{ fontFamily: 'var(--font)', fontSize: 9, fontWeight: 900, color: info.color }}>{info.bmi}</span>
        <span style={{ fontFamily: 'var(--font)', fontSize: 7, fontWeight: 700, letterSpacing: '0.1em',
          color: info.color }}>BMI · {info.label.toUpperCase()}</span>
      </div>
      {showAdvice && mismatch && (
        <p style={{ fontFamily: 'var(--font)', fontSize: 7, color: 'rgba(148,163,184,0.6)',
          letterSpacing: '0.03em', marginTop: 4, lineHeight: 1.5 }}>
          Healthy range {info.healthyKg[0]}–{info.healthyKg[1]} kg · station suggests a{' '}
          <span style={{ color: GOAL_META[info.advise].color, fontWeight: 700 }}>{GOAL_META[info.advise].label}</span> goal
        </p>
      )}
    </div>
  )
}

// ─── Water meter ───────────────────────────────────────────────────────────────
function WaterMeter({ consumedMl, targetMl, onAdd }: {
  consumedMl: number; targetMl: number; onAdd: (deltaMl: number) => void
}) {
  const pct  = targetMl > 0 ? Math.min(1, consumedMl / targetMl) : 0
  const cups = Math.round(consumedMl / CUP_ML)
  const done = consumedMl >= targetMl && targetMl > 0
  return (
    <div style={{ margin: '0 14px 8px', padding: '10px 12px', borderRadius: 9,
      background: `${AQUA}08`, border: `1px solid ${AQUA}22` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13 }}>💧</span>
        <p style={{ fontFamily: 'var(--font)', fontSize: 8, fontWeight: 700, color: AQUA,
          letterSpacing: '0.14em', flex: 1 }}>HYDRATION</p>
        <span style={{ fontFamily: 'var(--font)', fontSize: 9, fontWeight: 800, color: done ? '#4ade80' : AQUA }}>
          {(consumedMl / 1000).toFixed(consumedMl % 1000 === 0 ? 0 : 1)}/{(targetMl / 1000).toFixed(1)} L
        </span>
        <span style={{ fontFamily: 'var(--font)', fontSize: 7, color: `${AQUA}70` }}>{cups} cups</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => onAdd(-CUP_ML)} title="Remove a cup" style={waterBtn}>−</button>
        <div style={{ flex: 1, height: 8, borderRadius: 4, overflow: 'hidden',
          background: 'rgba(56,189,248,0.1)', position: 'relative' }}>
          <div style={{ height: '100%', width: `${pct * 100}%`,
            background: done ? '#4ade80' : `linear-gradient(90deg, ${AQUA}, #7dd3fc)`,
            boxShadow: `0 0 8px ${done ? '#4ade80' : AQUA}80`, borderRadius: 4, transition: 'width 0.4s ease' }} />
        </div>
        <button onClick={() => onAdd(CUP_ML)} title="Add a cup (250 ml)" style={{ ...waterBtn, color: AQUA, borderColor: `${AQUA}45` }}>+</button>
      </div>
    </div>
  )
}
const waterBtn: React.CSSProperties = {
  width: 26, height: 26, borderRadius: 7, fontSize: 15, fontWeight: 700, flexShrink: 0,
  color: `${AQUA}90`, border: `1px solid ${AQUA}28`, background: 'rgba(56,189,248,0.06)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

// ─── Member switcher ───────────────────────────────────────────────────────────
function MemberSwitcher({ members, activeId, onSwitch, onAdd }: {
  members: Member[]; activeId: string | null
  onSwitch: (id: string) => void; onAdd: () => void
}) {
  return (
    <div style={{ display: 'flex', gap: 6, padding: '8px 14px', overflowX: 'auto',
      borderBottom: `1px solid ${NEON}10` }}>
      {members.map(m => {
        const on = m.id === activeId
        const t = computeTargets(m.profile)
        const consumed = sumDay(m.days[todayKey()]).calories
        const left = Math.max(0, t.calories - consumed)
        return (
          <button key={m.id} onClick={() => onSwitch(m.id)} style={{
            display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0,
            padding: '5px 10px 5px 7px', borderRadius: 9, cursor: 'pointer',
            border: `1px solid ${on ? `${NEON}55` : 'rgba(255,255,255,0.07)'}`,
            background: on ? NEON_DIM : 'transparent', transition: 'all 0.15s',
          }}>
            <span style={{ fontSize: 17, filter: on ? `drop-shadow(0 0 5px ${NEON}90)` : 'none' }}>{m.emoji}</span>
            <div style={{ textAlign: 'left' }}>
              <p style={{ fontFamily: 'var(--font)', fontSize: 9, fontWeight: 800,
                color: on ? NEON : 'rgba(255,240,220,0.7)', letterSpacing: '0.04em' }}>{m.name}</p>
              <p style={{ fontFamily: 'var(--font)', fontSize: 6.5,
                color: on ? `${NEON}70` : 'rgba(148,163,184,0.4)', letterSpacing: '0.04em' }}>{left} kcal left</p>
            </div>
          </button>
        )
      })}
      <button onClick={onAdd} title="Add crew member" style={{
        flexShrink: 0, width: 34, borderRadius: 9, cursor: 'pointer',
        fontFamily: 'var(--font)', fontSize: 16, fontWeight: 300, color: `${NEON}80`,
        border: `1px dashed ${NEON}30`, background: 'transparent', transition: 'all 0.15s',
      }}
        onMouseEnter={e => e.currentTarget.style.background = NEON_DIM}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >+</button>
    </div>
  )
}

// ─── Profile / calibration form (identity + vitals) ────────────────────────────
function ProfileForm({ initial, isFirst, onSave, onCancel, onDelete }: {
  initial: MemberDraft | null
  isFirst?: boolean
  onSave:  (d: MemberDraft) => void
  onCancel?: () => void
  onDelete?: () => void
}) {
  const [name, setName]         = useState(initial?.name ?? '')
  const [emoji, setEmoji]       = useState(initial?.emoji ?? MEMBER_EMOJI[0])
  const [weightKg, setWeight]   = useState(String(initial?.profile.weightKg ?? ''))
  const [heightCm, setHeight]   = useState(String(initial?.profile.heightCm ?? ''))
  const [age, setAge]           = useState(String(initial?.profile.age ?? ''))
  const [sex, setSex]           = useState<Sex>(initial?.profile.sex ?? 'male')
  const [activity, setActivity] = useState<ActivityLevel>(initial?.profile.activity ?? 'standard')
  const [goal, setGoal]         = useState<Goal>(initial?.profile.goal ?? 'maintain')
  const [diet, setDiet]         = useState(initial?.profile.diet ?? '')

  const w = parseFloat(weightKg), h = parseFloat(heightCm), a = parseFloat(age)
  const valid = name.trim() !== '' && w > 0 && h > 0 && a > 0

  const draftProfile: SolarisProfile = { weightKg: w, heightCm: h, age: a, sex, activity, goal, diet }
  const preview: Targets | null = w > 0 && h > 0 && a > 0 ? computeTargets(draftProfile) : null

  const inp: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: 5,
    background: 'rgba(0,0,0,0.5)', border: `1px solid ${NEON}20`, outline: 'none',
    fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', color: 'rgba(255,240,220,0.9)',
    transition: 'border-color 0.15s',
  }
  const chip = (on: boolean): React.CSSProperties => ({
    padding: '5px 10px', borderRadius: 5, cursor: 'pointer',
    fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.06em',
    color: on ? NEON : 'rgba(148,163,184,0.4)',
    border: `1px solid ${on ? `${NEON}45` : 'rgba(255,255,255,0.06)'}`,
    background: on ? NEON_DIM : 'transparent', transition: 'all 0.12s',
  })

  return (
    <div className="fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${NEON}18`,
        display: 'flex', alignItems: 'center', gap: 10 }}>
        {onCancel && (
          <button onClick={onCancel} style={{ fontFamily: 'var(--font)', fontSize: 11, color: `${NEON}55`,
            letterSpacing: '0.1em' }}>← BACK</button>
        )}
        <p style={{ fontFamily: 'var(--font)', fontSize: 9, fontWeight: 900,
          color: NEON, letterSpacing: '0.18em', textShadow: `0 0 8px ${NEON}` }}>
          {isFirst ? 'CREW CALIBRATION' : initial ? 'EDIT CREW MEMBER' : 'NEW CREW MEMBER'}
        </p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', color: `${NEON}60`,
          lineHeight: 1.7, letterSpacing: '0.03em' }}>
          The station calibrates every meal to <em>this</em> body. Enter the vitals — Solaris
          computes a personal energy budget, macro split, BMI and water target.
        </p>

        {/* identity: avatar + name */}
        <div>
          <p style={{ fontFamily: 'var(--font)', fontSize: 7, color: `${NEON}50`,
            letterSpacing: '0.12em', marginBottom: 6 }}>CREW IDENTITY</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Name *"
              style={{ ...inp, flex: 1 }} autoFocus
              onFocus={e => e.target.style.borderColor = `${NEON}55`}
              onBlur={e => e.target.style.borderColor = `${NEON}20`} />
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
            {MEMBER_EMOJI.map(em => (
              <button key={em} onClick={() => setEmoji(em)} style={{
                width: 32, height: 32, borderRadius: 7, fontSize: 16, cursor: 'pointer',
                border: `1px solid ${emoji === em ? `${NEON}55` : 'rgba(255,255,255,0.06)'}`,
                background: emoji === em ? NEON_DIM : 'transparent', transition: 'all 0.12s',
              }}>{em}</button>
            ))}
          </div>
        </div>

        {/* vitals */}
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { v: weightKg, set: setWeight, ph: 'Weight', unit: 'kg' },
            { v: heightCm, set: setHeight, ph: 'Height', unit: 'cm' },
            { v: age,      set: setAge,    ph: 'Age',    unit: 'yr' },
          ].map(({ v, set, ph, unit }) => (
            <div key={ph} style={{ flex: 1 }}>
              <p style={{ fontFamily: 'var(--font)', fontSize: 7, color: `${NEON}50`,
                letterSpacing: '0.12em', marginBottom: 5 }}>{ph.toUpperCase()} ({unit})</p>
              <input type="number" value={v} onChange={e => set(e.target.value)} placeholder={ph}
                style={inp}
                onFocus={e => e.target.style.borderColor = `${NEON}55`}
                onBlur={e => e.target.style.borderColor = `${NEON}20`} />
            </div>
          ))}
        </div>

        {/* sex */}
        <div>
          <p style={{ fontFamily: 'var(--font)', fontSize: 7, color: `${NEON}50`,
            letterSpacing: '0.12em', marginBottom: 6 }}>BIOMETRIC</p>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['male', 'female'] as Sex[]).map(s => (
              <button key={s} onClick={() => setSex(s)} style={chip(sex === s)}>
                {s === 'male' ? '♂ MALE' : '♀ FEMALE'}
              </button>
            ))}
          </div>
        </div>

        {/* activity */}
        <div>
          <p style={{ fontFamily: 'var(--font)', fontSize: 7, color: `${NEON}50`,
            letterSpacing: '0.12em', marginBottom: 6 }}>ACTIVITY LEVEL</p>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {(Object.keys(ACTIVITY_META) as ActivityLevel[]).map(lvl => (
              <button key={lvl} onClick={() => setActivity(lvl)} title={ACTIVITY_META[lvl].sub}
                style={chip(activity === lvl)}>{ACTIVITY_META[lvl].label}</button>
            ))}
          </div>
        </div>

        {/* goal */}
        <div>
          <p style={{ fontFamily: 'var(--font)', fontSize: 7, color: `${NEON}50`,
            letterSpacing: '0.12em', marginBottom: 6 }}>MISSION GOAL</p>
          <div style={{ display: 'flex', gap: 6 }}>
            {(Object.keys(GOAL_META) as Goal[]).map(g => {
              const meta = GOAL_META[g]; const on = goal === g
              return (
                <button key={g} onClick={() => setGoal(g)} style={{
                  flex: 1, padding: '8px 6px', borderRadius: 6, cursor: 'pointer',
                  fontFamily: 'var(--font)', fontWeight: 700, letterSpacing: '0.06em',
                  color: on ? meta.color : 'rgba(148,163,184,0.4)',
                  border: `1px solid ${on ? `${meta.color}50` : 'rgba(255,255,255,0.06)'}`,
                  background: on ? `${meta.color}12` : 'transparent', transition: 'all 0.12s',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                }}>
                  <span style={{ fontSize: 'var(--fs-xs)' }}>{meta.label}</span>
                  <span style={{ fontSize: 6.5, opacity: 0.7 }}>{meta.sub}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* diet preference */}
        <div>
          <p style={{ fontFamily: 'var(--font)', fontSize: 7, color: `${NEON}50`,
            letterSpacing: '0.12em', marginBottom: 6 }}>DIETARY PREFERENCE (OPTIONAL)</p>
          <input value={diet} onChange={e => setDiet(e.target.value)}
            placeholder="e.g. vegetarian, no dairy, high protein…" style={inp}
            onFocus={e => e.target.style.borderColor = `${NEON}55`}
            onBlur={e => e.target.style.borderColor = `${NEON}20`} />
        </div>

        {/* live preview */}
        {preview && (
          <div style={{ padding: '12px 14px', borderRadius: 10,
            background: `${NEON}06`, border: `1px solid ${NEON}22` }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
              <p style={{ fontFamily: 'var(--font)', fontSize: 7.5, fontWeight: 700,
                color: NEON, letterSpacing: '0.18em', flex: 1 }}>DAILY RATION</p>
              <BmiChip profile={draftProfile} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 }}>
              <span style={{ fontFamily: 'var(--font)', fontSize: 28, fontWeight: 900,
                color: NEON, textShadow: `0 0 12px ${NEON}70`, lineHeight: 1 }}>{preview.calories}</span>
              <span style={{ fontFamily: 'var(--font)', fontSize: 9, color: `${NEON}60`,
                letterSpacing: '0.1em' }}>KCAL / DAY</span>
              <span style={{ fontFamily: 'var(--font)', fontSize: 7, color: 'rgba(148,163,184,0.4)',
                marginLeft: 'auto' }}>BMR {preview.bmr} · TDEE {preview.tdee}</span>
            </div>
            <div style={{ display: 'flex', gap: 14, marginBottom: 10 }}>
              {([['protein', preview.protein], ['carbs', preview.carbs], ['fat', preview.fat]] as const).map(([k, v]) => (
                <div key={k}>
                  <p style={{ fontFamily: 'var(--font)', fontSize: 15, fontWeight: 800,
                    color: MACRO[k].color, lineHeight: 1 }}>{v}g</p>
                  <p style={{ fontFamily: 'var(--font)', fontSize: 6.5, color: `${MACRO[k].color}80`,
                    letterSpacing: '0.1em', marginTop: 2 }}>{MACRO[k].label}</p>
                </div>
              ))}
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <p style={{ fontFamily: 'var(--font)', fontSize: 15, fontWeight: 800, color: AQUA, lineHeight: 1 }}>
                  {(recommendedWaterMl(draftProfile) / 1000).toFixed(1)}L</p>
                <p style={{ fontFamily: 'var(--font)', fontSize: 6.5, color: `${AQUA}80`,
                  letterSpacing: '0.1em', marginTop: 2 }}>💧 WATER</p>
              </div>
            </div>
            <BmiChip profile={draftProfile} showAdvice />
          </div>
        )}

        <button disabled={!valid}
          onClick={() => valid && onSave({ name: name.trim(), emoji, profile: { ...draftProfile, diet: diet.trim() } })}
          style={{
            padding: '11px', borderRadius: 7, cursor: valid ? 'pointer' : 'default',
            fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', fontWeight: 800, letterSpacing: '0.12em',
            color: valid ? NEON : 'rgba(148,163,184,0.25)',
            border: `1px solid ${valid ? `${NEON}45` : 'rgba(255,255,255,0.05)'}`,
            background: valid ? NEON_DIM : 'transparent', transition: 'all 0.15s',
          }}>⬡ {initial && !isFirst ? 'SAVE CREW MEMBER' : 'CALIBRATE STATION'}</button>

        {onDelete && (
          <button onClick={onDelete} style={{
            padding: '8px', borderRadius: 7, cursor: 'pointer',
            fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.12em',
            color: 'rgba(255,84,112,0.6)', border: '1px solid rgba(255,84,112,0.2)',
            background: 'transparent', transition: 'all 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,84,112,0.08)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >✕ REMOVE FROM CREW</button>
        )}
      </div>
    </div>
  )
}

// ─── Add food form ─────────────────────────────────────────────────────────────
function AddFoodForm({ slot, onSave, onCancel }: {
  slot: MealSlot
  onSave: (d: NewFoodData) => void
  onCancel: () => void
}) {
  const [name, setName]     = useState('')
  const [cal, setCal]       = useState('')
  const [p, setP]           = useState('')
  const [c, setC]           = useState('')
  const [f, setF]           = useState('')
  const [curSlot, setSlot]  = useState<MealSlot>(slot)

  const valid = name.trim() !== '' && parseFloat(cal) > 0

  const inp: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: 5,
    background: 'rgba(0,0,0,0.5)', border: `1px solid ${NEON}20`, outline: 'none',
    fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', color: 'rgba(255,240,220,0.9)',
  }

  return (
    <div className="fade-in" style={{ position: 'absolute', inset: 0, zIndex: 20,
      background: 'rgba(8,4,0,0.92)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${NEON}18`,
        display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onCancel} style={{ fontFamily: 'var(--font)', fontSize: 11,
          color: `${NEON}55`, letterSpacing: '0.1em' }}>← CANCEL</button>
        <p style={{ fontFamily: 'var(--font)', fontSize: 9, fontWeight: 900,
          color: NEON, letterSpacing: '0.18em', textShadow: `0 0 8px ${NEON}` }}>LOG NUTRIENTS</p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* slot */}
        <div style={{ display: 'flex', gap: 5 }}>
          {SLOT_ORDER.map(s => (
            <button key={s} onClick={() => setSlot(s)} style={{
              flex: 1, padding: '6px 2px', borderRadius: 5, cursor: 'pointer',
              fontFamily: 'var(--font)', fontSize: 7, fontWeight: 700, letterSpacing: '0.04em',
              color: curSlot === s ? NEON : 'rgba(148,163,184,0.4)',
              border: `1px solid ${curSlot === s ? `${NEON}45` : 'rgba(255,255,255,0.06)'}`,
              background: curSlot === s ? NEON_DIM : 'transparent', transition: 'all 0.12s',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            }}>
              <span style={{ fontSize: 11 }}>{SLOT_META[s].icon}</span>
              {SLOT_META[s].label}
            </button>
          ))}
        </div>

        <input value={name} onChange={e => setName(e.target.value)} placeholder="Meal name *" style={inp} autoFocus />

        <div>
          <p style={{ fontFamily: 'var(--font)', fontSize: 7, color: `${NEON}50`,
            letterSpacing: '0.12em', marginBottom: 5 }}>CALORIES *</p>
          <input type="number" value={cal} onChange={e => setCal(e.target.value)} placeholder="kcal" style={inp} />
        </div>

        <div>
          <p style={{ fontFamily: 'var(--font)', fontSize: 7, color: `${NEON}50`,
            letterSpacing: '0.12em', marginBottom: 5 }}>MACROS (GRAMS)</p>
          <div style={{ display: 'flex', gap: 8 }}>
            {([['protein', p, setP], ['carbs', c, setC], ['fat', f, setF]] as const).map(([k, v, set]) => (
              <div key={k} style={{ flex: 1 }}>
                <input type="number" value={v} onChange={e => set(e.target.value)} placeholder="0"
                  style={{ ...inp, borderColor: `${MACRO[k as keyof typeof MACRO].color}30`,
                    textAlign: 'center' }} />
                <p style={{ fontFamily: 'var(--font)', fontSize: 6.5, textAlign: 'center', marginTop: 3,
                  color: `${MACRO[k as keyof typeof MACRO].color}90`, letterSpacing: '0.08em' }}>
                  {MACRO[k as keyof typeof MACRO].label}
                </p>
              </div>
            ))}
          </div>
        </div>

        <button disabled={!valid}
          onClick={() => valid && onSave({
            name: name.trim(), slot: curSlot,
            calories: parseFloat(cal) || 0, protein: parseFloat(p) || 0,
            carbs: parseFloat(c) || 0, fat: parseFloat(f) || 0,
          })}
          style={{
            padding: '11px', borderRadius: 7, cursor: valid ? 'pointer' : 'default',
            fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', fontWeight: 800, letterSpacing: '0.12em',
            color: valid ? NEON : 'rgba(148,163,184,0.25)',
            border: `1px solid ${valid ? `${NEON}45` : 'rgba(255,255,255,0.05)'}`,
            background: valid ? NEON_DIM : 'transparent', transition: 'all 0.15s',
          }}>+ LOG TO MANIFEST</button>
      </div>
    </div>
  )
}

// ─── AI delivery panel ─────────────────────────────────────────────────────────
interface DeliveryMeal {
  name: string; slot: MealSlot
  calories: number; protein: number; carbs: number; fat: number
  why?: string
}

const DELIVERY_SYSTEM = `You are SOLARIS, the AI nutrition chef of an orbital agri-station that grows fresh food in space and delivers personalised meals to crew members.
Given a crew member's remaining calorie/macro budget for the day and their dietary preference, design meals that fit the REMAINING budget as closely as possible.
Respond with ONLY a JSON array, no prose, no markdown fences. Each item:
{"name": string, "slot": "breakfast"|"lunch"|"dinner"|"snack", "calories": number, "protein": number, "carbs": number, "fat": number, "why": short string (max 8 words)}
Return 2-4 meals. Keep total close to the remaining budget. Numbers are grams except calories (kcal).`

function DeliveryPanel({ profile, targets, consumed, onAccept, onClose }: {
  profile:  SolarisProfile
  targets:  Targets
  consumed: { calories: number; protein: number; carbs: number; fat: number }
  onAccept: (m: DeliveryMeal) => void
  onClose:  () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [meals, setMeals]     = useState<DeliveryMeal[] | null>(null)
  const [accepted, setAccepted] = useState<Set<number>>(new Set())

  const remaining = {
    calories: Math.max(0, targets.calories - consumed.calories),
    protein:  Math.max(0, targets.protein  - consumed.protein),
    carbs:    Math.max(0, targets.carbs    - consumed.carbs),
    fat:      Math.max(0, targets.fat      - consumed.fat),
  }

  const synthesize = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const settings = loadSettings()
      const userMsg = `Crew goal: ${GOAL_META[profile.goal].label} (${profile.goal}).
Dietary preference: ${profile.diet || 'none'}.
REMAINING budget for the rest of today: ${remaining.calories} kcal, ${remaining.protein}g protein, ${remaining.carbs}g carbs, ${remaining.fat}g fat.
Design the delivery.`
      const parsed = await aiJson<DeliveryMeal[]>([
        { role: 'system', content: DELIVERY_SYSTEM },
        { role: 'user',   content: userMsg },
      ], settings, { model: modelForTask(settings, 'solaris.delivery'), maxTokens: 1536, prefill: '[' })
      const valid = parsed
        .filter(m => m && m.name && typeof m.calories === 'number')
        .map(m => ({
          name: String(m.name),
          slot: (SLOT_ORDER.includes(m.slot) ? m.slot : 'snack') as MealSlot,
          calories: Math.round(m.calories) || 0,
          protein:  Math.round(m.protein)  || 0,
          carbs:    Math.round(m.carbs)    || 0,
          fat:      Math.round(m.fat)      || 0,
          why: m.why ? String(m.why) : undefined,
        }))
      if (valid.length === 0) throw new Error('No meals in the manifest.')
      setMeals(valid)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delivery failed.')
    } finally {
      setLoading(false)
    }
  }, [profile, remaining])

  return (
    <div className="fade-in" style={{ position: 'absolute', inset: 0, zIndex: 20,
      background: 'rgba(8,4,0,0.95)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${NEON}18`,
        display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onClose} style={{ fontFamily: 'var(--font)', fontSize: 11,
          color: `${NEON}55`, letterSpacing: '0.1em' }}>← BACK</button>
        <div>
          <p style={{ fontFamily: 'var(--font)', fontSize: 9, fontWeight: 900,
            color: NEON, letterSpacing: '0.18em', textShadow: `0 0 8px ${NEON}` }}>TODAY'S DELIVERY</p>
          <p style={{ fontFamily: 'var(--font)', fontSize: 6.5, color: `${NEON}45`,
            letterSpacing: '0.08em' }}>SYNTHESISED FROM ORBITAL AGRI-BAY</p>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
        {/* remaining budget readout */}
        <div style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 12,
          background: `${NEON}05`, border: `1px solid ${NEON}18`, display: 'flex', gap: 14 }}>
          <div>
            <p style={{ fontFamily: 'var(--font)', fontSize: 16, fontWeight: 900, color: NEON, lineHeight: 1 }}>
              {remaining.calories}</p>
            <p style={{ fontFamily: 'var(--font)', fontSize: 6.5, color: `${NEON}60`, letterSpacing: '0.1em' }}>KCAL LEFT</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {([['protein', remaining.protein], ['carbs', remaining.carbs], ['fat', remaining.fat]] as const).map(([k, v]) => (
              <div key={k}>
                <p style={{ fontFamily: 'var(--font)', fontSize: 12, fontWeight: 800,
                  color: MACRO[k].color, lineHeight: 1 }}>{v}g</p>
                <p style={{ fontFamily: 'var(--font)', fontSize: 6, color: `${MACRO[k].color}80`,
                  letterSpacing: '0.08em' }}>{MACRO[k].label}</p>
              </div>
            ))}
          </div>
        </div>

        {!meals && !loading && (
          <div style={{ textAlign: 'center', padding: '20px 10px' }}>
            <div style={{ fontSize: 30, marginBottom: 10, filter: `drop-shadow(0 0 12px ${NEON})` }}>🛰️</div>
            <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', color: `${NEON}55`,
              lineHeight: 1.7, marginBottom: 16 }}>
              The agri-station will grow & plate meals<br/>tuned to your remaining budget.
            </p>
            <button onClick={synthesize} style={{
              padding: '11px 26px', borderRadius: 7, cursor: 'pointer',
              fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', fontWeight: 800, letterSpacing: '0.12em',
              color: NEON, border: `1px solid ${NEON}45`, background: NEON_DIM, transition: 'background 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,177,60,0.2)'}
              onMouseLeave={e => e.currentTarget.style.background = NEON_DIM}
            >☄️ SYNTHESISE DELIVERY</button>
          </div>
        )}

        {loading && (
          <div style={{ textAlign: 'center', padding: '30px 10px' }}>
            <div style={{ fontSize: 26, marginBottom: 12,
              animation: 'pulse 1.3s ease-in-out infinite' }}>🛰️</div>
            <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', color: NEON,
              letterSpacing: '0.12em' }}>GROWING YOUR MEALS…</p>
          </div>
        )}

        {error && (
          <div style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 12,
            background: 'rgba(255,84,112,0.08)', border: '1px solid rgba(255,84,112,0.3)' }}>
            <p style={{ fontFamily: 'var(--font)', fontSize: 8, color: '#ff5470',
              letterSpacing: '0.08em', lineHeight: 1.6 }}>⚠ {error}</p>
            <button onClick={synthesize} style={{ marginTop: 8, fontFamily: 'var(--font)',
              fontSize: 8, color: NEON, letterSpacing: '0.1em' }}>↻ RETRY</button>
          </div>
        )}

        {meals && meals.map((m, i) => {
          const isAccepted = accepted.has(i)
          return (
            <div key={i} style={{ marginBottom: 8, borderRadius: 9, overflow: 'hidden',
              background: 'rgba(20,12,2,0.6)',
              border: `1px solid ${isAccepted ? '#4ade8040' : `${NEON}18`}`, opacity: isAccepted ? 0.6 : 1,
              transition: 'all 0.2s' }}>
              <div style={{ padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 13 }}>{SLOT_META[m.slot].icon}</span>
                  <p style={{ fontFamily: 'var(--font)', fontSize: 11, fontWeight: 800,
                    color: 'rgba(255,240,220,0.92)', flex: 1 }}>{m.name}</p>
                  <span style={{ fontFamily: 'var(--font)', fontSize: 13, fontWeight: 900, color: NEON }}>
                    {m.calories}</span>
                </div>
                <div style={{ display: 'flex', gap: 12, marginBottom: m.why ? 8 : 0 }}>
                  {([['protein', m.protein], ['carbs', m.carbs], ['fat', m.fat]] as const).map(([k, v]) => (
                    <span key={k} style={{ fontFamily: 'var(--font)', fontSize: 8,
                      color: MACRO[k].color }}>{MACRO[k].label[0]} {v}g</span>
                  ))}
                  <span style={{ fontFamily: 'var(--font)', fontSize: 7, marginLeft: 'auto',
                    color: 'rgba(148,163,184,0.4)' }}>{SLOT_META[m.slot].label}</span>
                </div>
                {m.why && (
                  <p style={{ fontFamily: 'var(--font)', fontSize: 7.5, color: `${NEON}55`,
                    fontStyle: 'italic', letterSpacing: '0.02em', marginBottom: 8 }}>“{m.why}”</p>
                )}
                <button disabled={isAccepted} onClick={() => { onAccept(m); setAccepted(s => new Set(s).add(i)) }}
                  style={{
                    width: '100%', padding: '6px', borderRadius: 5, cursor: isAccepted ? 'default' : 'pointer',
                    fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.1em',
                    color: isAccepted ? '#4ade80' : NEON,
                    border: `1px solid ${isAccepted ? '#4ade8040' : `${NEON}35`}`,
                    background: isAccepted ? 'rgba(74,222,128,0.08)' : NEON_DIM, transition: 'all 0.15s',
                  }}>{isAccepted ? '✓ ON MANIFEST' : '⬇ ACCEPT DELIVERY'}</button>
              </div>
            </div>
          )
        })}

        {meals && (
          <button onClick={() => { meals.forEach((m, i) => { if (!accepted.has(i)) onAccept(m) }); onClose() }}
            style={{ width: '100%', marginTop: 4, padding: '10px', borderRadius: 7, cursor: 'pointer',
              fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 800, letterSpacing: '0.12em',
              color: SOLAR, border: `1px solid ${SOLAR}40`, background: `${SOLAR}10`, transition: 'all 0.15s' }}
          >⬇ ACCEPT ALL & CLOSE</button>
        )}
      </div>
    </div>
  )
}

// ─── Meal slot group ──────────────────────────────────────────────────────────
function SlotGroup({ slot, entries, onAdd, onRemove }: {
  slot: MealSlot
  entries: { id: string; name: string; calories: number; protein: number; carbs: number; fat: number }[]
  onAdd: () => void
  onRemove: (id: string) => void
}) {
  const total = entries.reduce((s, e) => s + e.calories, 0)
  return (
    <div style={{ margin: '6px 10px', borderRadius: 10, overflow: 'hidden',
      background: 'rgba(18,11,2,0.55)', border: `1px solid ${NEON}12` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        borderBottom: entries.length ? `1px solid ${NEON}10` : 'none' }}>
        <span style={{ fontSize: 13 }}>{SLOT_META[slot].icon}</span>
        <p style={{ fontFamily: 'var(--font)', fontSize: 8.5, fontWeight: 700,
          color: `${NEON}80`, letterSpacing: '0.14em', flex: 1 }}>{SLOT_META[slot].label}</p>
        {total > 0 && (
          <span style={{ fontFamily: 'var(--font)', fontSize: 9, fontWeight: 800, color: NEON }}>
            {total} kcal</span>
        )}
        <button onClick={onAdd} style={{
          width: 22, height: 22, borderRadius: 6, fontSize: 13, fontWeight: 700,
          color: `${NEON}90`, border: `1px solid ${NEON}28`, background: NEON_DIM, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,177,60,0.2)'}
          onMouseLeave={e => e.currentTarget.style.background = NEON_DIM}
        >+</button>
      </div>

      {entries.map(e => (
        <div key={e.id} className="group-row" style={{ display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 12px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', color: 'rgba(255,240,220,0.85)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
              {([['protein', e.protein], ['carbs', e.carbs], ['fat', e.fat]] as const).map(([k, v]) => (
                <span key={k} style={{ fontFamily: 'var(--font)', fontSize: 6.5,
                  color: `${MACRO[k].color}90` }}>{MACRO[k].label[0]} {v}g</span>
              ))}
            </div>
          </div>
          <span style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', fontWeight: 700,
            color: NEON, flexShrink: 0 }}>{e.calories}</span>
          <button onClick={() => onRemove(e.id)} title="Remove" style={{
            fontFamily: 'var(--font)', fontSize: 12, color: 'rgba(255,84,112,0.4)', flexShrink: 0,
            cursor: 'pointer', transition: 'color 0.12s' }}
            onMouseEnter={ev => ev.currentTarget.style.color = '#ff5470'}
            onMouseLeave={ev => ev.currentTarget.style.color = 'rgba(255,84,112,0.4)'}
          >✕</button>
        </div>
      ))}
    </div>
  )
}

// ─── Main Solaris module ──────────────────────────────────────────────────────
type Screen =
  | { type: 'dashboard' }
  | { type: 'edit'; memberId: string }
  | { type: 'add' }
  | { type: 'delivery' }

export default function Solaris() {
  const [state, setState]   = useState<SolarisState>(() => loadSolarisState())
  const [screen, setScreen] = useState<Screen>({ type: 'dashboard' })
  const [addSlot, setAddSlot] = useState<MealSlot | null>(null)

  const persist = useCallback((s: SolarisState) => { saveSolarisState(s); setState(s) }, [])

  const today  = todayKey()
  const member = activeMember(state)

  const day     = useMemo(() => member ? getDay(state, member.id, today) : { date: today, entries: [] }, [state, member, today])
  const totals  = useMemo(() => sumDay(day), [day])
  const targets = member ? computeTargets(member.profile) : null
  const streak  = member ? getStreak(state, member.id) : 0
  const water   = member ? getWater(state, member.id, today) : 0
  const waterTarget = member ? recommendedWaterMl(member.profile) : 0

  // ── No members yet → onboard the first one ──
  if (!member) {
    return (
      <ProfileForm initial={null} isFirst
        onSave={d => persist(addMember(state, d.name, d.emoji, d.profile))} />
    )
  }

  // ── Add a new crew member ──
  if (screen.type === 'add') {
    return (
      <ProfileForm initial={null}
        onSave={d => { persist(addMember(state, d.name, d.emoji, d.profile)); setScreen({ type: 'dashboard' }) }}
        onCancel={() => setScreen({ type: 'dashboard' })} />
    )
  }

  // ── Edit an existing crew member ──
  if (screen.type === 'edit') {
    const target = state.members.find(m => m.id === screen.memberId)
    if (target) {
      return (
        <ProfileForm
          initial={{ name: target.name, emoji: target.emoji, profile: target.profile }}
          onSave={d => {
            let s = updateMemberProfile(state, target.id, d.profile)
            s = renameMember(s, target.id, d.name, d.emoji)
            persist(s); setScreen({ type: 'dashboard' })
          }}
          onCancel={() => setScreen({ type: 'dashboard' })}
          onDelete={() => { persist(removeMember(state, target.id)); setScreen({ type: 'dashboard' }) }}
        />
      )
    }
  }

  // ── Delivery ──
  if (screen.type === 'delivery' && targets) {
    return (
      <DeliveryPanel
        profile={member.profile}
        targets={targets}
        consumed={totals}
        onAccept={m => persist(addEntry(state, member.id, today, m))}
        onClose={() => setScreen({ type: 'dashboard' })}
      />
    )
  }

  // ── Dashboard ──
  return (
    <div className="fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column',
      overflow: 'hidden', position: 'relative' }}>

      {/* Add food overlay */}
      {addSlot && (
        <AddFoodForm slot={addSlot}
          onSave={d => { persist(addEntry(state, member.id, today, d)); setAddSlot(null) }}
          onCancel={() => setAddSlot(null)} />
      )}

      {/* Header */}
      <div style={{ padding: '8px 14px', flexShrink: 0,
        borderBottom: `1px solid ${NEON}14`, background: 'rgba(14,8,2,0.7)',
        display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 11, fontWeight: 900,
            color: NEON, letterSpacing: '0.22em', textShadow: `0 0 12px ${NEON}` }}>SOLARIS</p>
          <p style={{ fontFamily: 'var(--font)', fontSize: 6.5, color: `${NEON}45`, letterSpacing: '0.12em' }}>
            THE SOLAR SYSTEM'S KITCHEN
          </p>
        </div>
        {streak > 0 && (
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontFamily: 'var(--font)', fontSize: 13, fontWeight: 900,
              color: SOLAR, lineHeight: 1 }}>{streak}🔥</p>
            <p style={{ fontFamily: 'var(--font)', fontSize: 6.5, color: `${SOLAR}70`,
              letterSpacing: '0.1em' }}>DAY STREAK</p>
          </div>
        )}
        <button onClick={() => setScreen({ type: 'edit', memberId: member.id })} title={`Edit ${member.name}`} style={{
          width: 28, height: 28, borderRadius: 7, fontSize: 13,
          color: `${NEON}70`, border: `1px solid ${NEON}25`, background: 'transparent', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.color = NEON; e.currentTarget.style.background = NEON_DIM }}
          onMouseLeave={e => { e.currentTarget.style.color = `${NEON}70`; e.currentTarget.style.background = 'transparent' }}
        >⚙</button>
      </div>

      {/* Crew switcher */}
      <MemberSwitcher members={state.members} activeId={member.id}
        onSwitch={id => persist(setActiveMember(state, id))}
        onAdd={() => setScreen({ type: 'add' })} />

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Ration overview */}
        {targets && (
          <div style={{ padding: '14px', display: 'flex', gap: 16, alignItems: 'center' }}>
            <OrbitRing consumed={totals.calories} target={targets.calories} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ alignSelf: 'flex-start' }}><BmiChip profile={member.profile} /></div>
              <MacroBar kind="protein" consumed={totals.protein} target={targets.protein} />
              <MacroBar kind="carbs"   consumed={totals.carbs}   target={targets.carbs} />
              <MacroBar kind="fat"     consumed={totals.fat}     target={targets.fat} />
            </div>
          </div>
        )}

        {/* Hydration */}
        <WaterMeter consumedMl={water} targetMl={waterTarget}
          onAdd={delta => persist(addWater(state, member.id, today, delta))} />

        {/* Delivery CTA */}
        <button onClick={() => setScreen({ type: 'delivery' })} style={{
          margin: '0 14px 8px', width: 'calc(100% - 28px)', padding: '11px 14px', borderRadius: 9, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 10,
          background: `linear-gradient(90deg, ${SOLAR}14, ${NEON}10)`,
          border: `1px solid ${NEON}30`, transition: 'all 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.borderColor = `${NEON}55`}
          onMouseLeave={e => e.currentTarget.style.borderColor = `${NEON}30`}
        >
          <span style={{ fontSize: 18, filter: `drop-shadow(0 0 8px ${NEON})` }}>🛰️</span>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <p style={{ fontFamily: 'var(--font)', fontSize: 9, fontWeight: 800,
              color: NEON, letterSpacing: '0.14em' }}>REQUEST TODAY'S DELIVERY</p>
            <p style={{ fontFamily: 'var(--font)', fontSize: 7, color: `${NEON}55`,
              letterSpacing: '0.04em', marginTop: 1 }}>
              Personalised meals grown for {member.name}'s remaining budget
            </p>
          </div>
          <span style={{ fontFamily: 'var(--font)', fontSize: 11, color: `${NEON}60` }}>→</span>
        </button>

        {/* Meals manifest */}
        <div style={{ padding: '4px 0 16px' }}>
          {SLOT_ORDER.map(slot => (
            <SlotGroup key={slot} slot={slot}
              entries={day.entries.filter(e => e.slot === slot)}
              onAdd={() => setAddSlot(slot)}
              onRemove={id => persist(removeEntry(state, member.id, today, id))}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
