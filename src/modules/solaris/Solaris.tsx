import { useState, useMemo, useCallback, useRef } from 'react'
import {
  type SolarisProfile, type Sex, type ActivityLevel, type Goal, type MealSlot,
  type Targets, type Member, type DrinkKind, type DrinkEntry, type PantryItem, type SavedDish,
  type KitchenConfig,
  ACTIVITY_META, GOAL_META, SLOT_META, SLOT_ORDER, MEMBER_EMOJI, KITCHEN_EQUIPMENT, CUP_ML, HALF_LITER_ML,
  DRINKS, DRINK_ORDER, computeTargets, computeBmi, recommendedWaterMl, effectiveHydration,
  sumDay, todayKey,
} from './types'
import {
  loadSolarisState, saveSolarisState, type SolarisState,
  activeMember, addMember, updateMemberProfile, renameMember, removeMember, setActiveMember,
  getDay, addEntry, removeEntry, getStreak, getDrinks, addDrink, removeDrink,
  addPantryItem, addPantryItems, removePantryItem, saveFavorite, removeFavorite,
  setKitchen, toggleEquipment, type NewFoodData,
} from './store'
import { loadSettings, aiJson, aiVisionJson, modelForTask, type ImageInput } from '../../settings'
import { fileToImageInput } from './image'
import { solarisUsage, solarisTier, solarisNext, solarisHas } from '../progression/tools'
import { t as tr } from '../../i18n'

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

// Display-only localisation. Enum keys, stored equipment names and AI-prompt
// values stay English; only what the user reads is translated here.
const MACRO_RU: Record<keyof typeof MACRO, string> = { protein: 'БЕЛКИ', carbs: 'УГЛЕВ', fat: 'ЖИРЫ' }
const macroLabel = (k: keyof typeof MACRO) => tr(MACRO[k].label, MACRO_RU[k])
const goalLabel  = (g: Goal) => tr(GOAL_META[g].label, ({ cut: 'СЖЕЧЬ', maintain: 'ДЕРЖАТЬ', bulk: 'РОСТ' } as Record<Goal, string>)[g])
const goalSub    = (g: Goal) => tr(GOAL_META[g].sub, ({ cut: 'снижение жира', maintain: 'удержание массы', bulk: 'набор мышц' } as Record<Goal, string>)[g])
const actLabel   = (l: ActivityLevel) => tr(ACTIVITY_META[l].label, ({ pod: 'ПОКОЙ', light: 'ЛЁГКАЯ', standard: 'СТАНДАРТ', active: 'АКТИВНАЯ', pilot: 'ПИЛОТ' } as Record<ActivityLevel, string>)[l])
const actSub     = (l: ActivityLevel) => tr(ACTIVITY_META[l].sub, ({ pod: 'почти без движения', light: 'лёгкая 1–3×/нед', standard: 'актив 3–5×/нед', active: 'тяжёлая 6–7×/нед', pilot: 'атлет / 2× в день' } as Record<ActivityLevel, string>)[l])
const slotLabel  = (s: MealSlot) => tr(SLOT_META[s].label, ({ breakfast: 'РАССВЕТ', lunch: 'ПОЛДЕНЬ', dinner: 'ЗАКАТ', snack: 'ПЕРЕКУС' } as Record<MealSlot, string>)[s])
const drinkLabel = (k: DrinkKind) => tr(DRINKS[k].label, ({ water: 'Вода', coffee: 'Кофе', tea: 'Чай', juice: 'Сок', milk: 'Молоко' } as Record<DrinkKind, string>)[k])
const equipLabel = (e: string) => tr(e, ({ Stovetop: 'Плита', Oven: 'Духовка', 'Air fryer': 'Аэрогриль', Grill: 'Гриль', Microwave: 'СВЧ', Blender: 'Блендер', 'Slow cooker': 'Мультиварка', 'Rice cooker': 'Рисоварка' } as Record<string, string>)[e] ?? e)
const bmiLabel   = (l: string) => tr(l, ({ Underweight: 'Недовес', Healthy: 'Норма', Overweight: 'Избыток', Obese: 'Ожирение' } as Record<string, string>)[l] ?? l)

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
        <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, letterSpacing: '0.12em',
          color: over ? 'rgba(255,84,112,0.6)' : `${NEON}60`, marginTop: 2 }}>
          {over ? tr('KCAL OVER', 'ККАЛ СВЕРХ') : tr('KCAL LEFT', 'ККАЛ ОСТ.')}
        </p>
        <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, letterSpacing: '0.06em',
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
  const { color } = MACRO[kind]
  const pct = target > 0 ? Math.min(100, (consumed / target) * 100) : 0
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 700,
          color, letterSpacing: '0.1em' }}>{macroLabel(kind)}</span>
        <span style={{ fontFamily: 'var(--font)', fontSize: 11.5,
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
    <div title={`${tr('Healthy weight for your height:', 'Здоровый вес для вашего роста:')} ${info.healthyKg[0]}–${info.healthyKg[1]} ${tr('kg', 'кг')}`}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '3px 8px', borderRadius: 6, background: `${info.color}14`, border: `1px solid ${info.color}40` }}>
        <span style={{ fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 900, color: info.color }}>{info.bmi}</span>
        <span style={{ fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.1em',
          color: info.color }}>ИМТ · {bmiLabel(info.label).toUpperCase()}</span>
      </div>
      {showAdvice && mismatch && (
        <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: 'rgba(148,163,184,0.6)',
          letterSpacing: '0.03em', marginTop: 4, lineHeight: 1.5 }}>
          {tr('Healthy range', 'Здоровый диапазон')} {info.healthyKg[0]}–{info.healthyKg[1]} {tr('kg', 'кг')} · {tr('station suggests a goal:', 'станция советует цель:')}{' '}
          <span style={{ color: GOAL_META[info.advise].color, fontWeight: 700 }}>{goalLabel(info.advise)}</span>
        </p>
      )}
    </div>
  )
}

// ─── Water meter (weighted drinks log) ─────────────────────────────────────────
function WaterMeter({ drinks, targetMl, onAdd, onRemove }: {
  drinks: DrinkEntry[]; targetMl: number
  onAdd: (kind: DrinkKind, ml: number) => void
  onRemove: (id: string) => void
}) {
  const [open, setOpen]             = useState(false)
  const [customKind, setCustomKind] = useState<DrinkKind>('water')
  const [customMl, setCustomMl]     = useState('')

  const effective = effectiveHydration(drinks)
  const pct  = targetMl > 0 ? Math.min(1, effective / targetMl) : 0
  const cups = Math.round((effective / CUP_ML) * 10) / 10
  const done = effective >= targetMl && targetMl > 0
  const fill = done ? '#4ade80' : AQUA

  const addCustom = () => {
    const ml = parseFloat(customMl)
    if (ml > 0) { onAdd(customKind, ml); setCustomMl('') }
  }

  return (
    <div style={{ margin: '0 14px 8px', padding: '10px 12px', borderRadius: 9,
      background: `${AQUA}08`, border: `1px solid ${AQUA}22` }}>
      {/* summary */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 15.5 }}>💧</span>
        <p style={{ fontFamily: 'var(--font)', fontSize: 10.5, fontWeight: 700, color: AQUA,
          letterSpacing: '0.14em', flex: 1 }}>{tr('HYDRATION', 'ГИДРАТАЦИЯ')}</p>
        <span style={{ fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 800, color: fill }}>
          {(effective / 1000).toFixed(1)}/{(targetMl / 1000).toFixed(1)} L
        </span>
        <span style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: `${AQUA}70` }}>{cups} {tr('cups', 'чаш.')}</span>
        <button onClick={() => setOpen(o => !o)} title={tr('Drink log & custom amount', 'Журнал напитков и свой объём')} style={{
          fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em',
          color: `${AQUA}90`, cursor: 'pointer' }}>{open ? tr('CLOSE ▴', 'ЗАКРЫТЬ ▴') : tr('LOG ▾', 'ЖУРНАЛ ▾')}</button>
      </div>

      {/* progress bar */}
      <div style={{ height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 8,
        background: 'rgba(56,189,248,0.1)' }}>
        <div style={{ height: '100%', width: `${pct * 100}%`,
          background: done ? '#4ade80' : `linear-gradient(90deg, ${AQUA}, #7dd3fc)`,
          boxShadow: `0 0 8px ${fill}80`, borderRadius: 4, transition: 'width 0.4s ease' }} />
      </div>

      {/* quick adds: ½-cup water + a chip per drink */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        <button onClick={() => onAdd('water', HALF_LITER_ML)} title={tr('Add ½ litre of water (500 ml)', 'Добавить ½ литра воды (500 мл)')} style={{
          ...drinkChip, color: AQUA, borderColor: `${AQUA}45`, fontWeight: 700 }}>+½L 💧</button>
        {DRINK_ORDER.filter(k => k !== 'water').map(k => (
          <button key={k} onClick={() => onAdd(k, DRINKS[k].serveMl)}
            title={`${tr('Add', 'Добавить')} ${drinkLabel(k)} (${DRINKS[k].serveMl} ${tr('ml', 'мл')} · ${Math.round(DRINKS[k].factor * 100)}% ${tr('hydration', 'гидратации')})`}
            style={drinkChip}>{DRINKS[k].emoji}</button>
        ))}
      </div>

      {/* log + custom */}
      {open && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${AQUA}18` }}>
          {/* custom amount */}
          <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            {DRINK_ORDER.map(k => (
              <button key={k} onClick={() => setCustomKind(k)} title={drinkLabel(k)}
                style={{ ...drinkChip, ...(customKind === k
                  ? { color: AQUA, borderColor: `${AQUA}55`, background: 'rgba(56,189,248,0.12)' } : {}) }}>
                {DRINKS[k].emoji}</button>
            ))}
            <input type="number" value={customMl} onChange={e => setCustomMl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addCustom() }} placeholder="ml"
              style={{ width: 56, padding: '5px 8px', borderRadius: 5, background: 'rgba(0,0,0,0.5)',
                border: `1px solid ${AQUA}28`, outline: 'none', fontFamily: 'var(--font)',
                fontSize: 'var(--fs-xs)', color: 'rgba(225,245,255,0.9)' }} />
            <button onClick={addCustom} style={{ ...drinkChip, color: AQUA, borderColor: `${AQUA}45`,
              fontWeight: 700, letterSpacing: '0.08em' }}>{tr('ADD', 'ДОБ.')}</button>
          </div>

          {/* today's drinks */}
          {drinks.length === 0 ? (
            <p style={{ fontFamily: 'var(--font)', fontSize: 10, color: 'rgba(148,163,184,0.4)',
              letterSpacing: '0.04em' }}>{tr('No drinks logged yet today.', 'Сегодня напитки ещё не записаны.')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 120, overflowY: 'auto' }}>
              {drinks.map(d => {
                const meta = DRINKS[d.kind]
                const eff = Math.round(d.ml * meta.factor)
                return (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8,
                    padding: '3px 4px' }}>
                    <span style={{ fontSize: 14.5 }}>{meta.emoji}</span>
                    <span style={{ fontFamily: 'var(--font)', fontSize: 10.5, color: 'rgba(225,245,255,0.8)', flex: 1 }}>
                      {drinkLabel(d.kind)} · {d.ml} {tr('ml', 'мл')}
                      {meta.factor < 1 && (
                        <span style={{ color: `${AQUA}70` }}> → {eff} ml</span>
                      )}
                    </span>
                    <button onClick={() => onRemove(d.id)} title={tr('Remove', 'Удалить')} style={{
                      fontFamily: 'var(--font)', fontSize: 13.5, color: 'rgba(255,84,112,0.45)', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.color = '#ff5470'}
                      onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,84,112,0.45)'}
                    >✕</button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
const drinkChip: React.CSSProperties = {
  minWidth: 30, height: 26, padding: '0 8px', borderRadius: 7, fontSize: 15.5, flexShrink: 0,
  color: `${AQUA}90`, border: `1px solid ${AQUA}22`, background: 'rgba(56,189,248,0.05)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font)',
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
            <span style={{ fontSize: 19, filter: on ? `drop-shadow(0 0 5px ${NEON}90)` : 'none' }}>{m.emoji}</span>
            <div style={{ textAlign: 'left' }}>
              <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 800,
                color: on ? NEON : 'rgba(255,240,220,0.7)', letterSpacing: '0.04em' }}>{m.name}</p>
              <p style={{ fontFamily: 'var(--font)', fontSize: 11,
                color: on ? `${NEON}70` : 'rgba(148,163,184,0.4)', letterSpacing: '0.04em' }}>{left} {tr('kcal left', 'ккал осталось')}</p>
            </div>
          </button>
        )
      })}
      <button onClick={onAdd} title={tr('Add crew member', 'Добавить члена экипажа')} style={{
        flexShrink: 0, width: 34, borderRadius: 9, cursor: 'pointer',
        fontFamily: 'var(--font)', fontSize: 18, fontWeight: 300, color: `${NEON}80`,
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
          <button onClick={onCancel} style={{ fontFamily: 'var(--font)', fontSize: 13.5, color: `${NEON}55`,
            letterSpacing: '0.1em' }}>← {tr('BACK', 'НАЗАД')}</button>
        )}
        <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 900,
          color: NEON, letterSpacing: '0.18em', textShadow: `0 0 8px ${NEON}` }}>
          {isFirst ? tr('CREW CALIBRATION', 'КАЛИБРОВКА ЭКИПАЖА') : initial ? tr('EDIT CREW MEMBER', 'ИЗМЕНИТЬ ЧЛЕНА') : tr('NEW CREW MEMBER', 'НОВЫЙ ЧЛЕН')}
        </p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', color: `${NEON}60`,
          lineHeight: 1.7, letterSpacing: '0.03em' }}>
          {tr('The station calibrates every meal to', 'Станция калибрует каждый приём под')} <em>{tr('this', 'это')}</em> {tr('body. Enter the vitals — Solaris computes a personal energy budget, macro split, BMI and water target.', 'тело. Введите данные — Solaris рассчитает личный бюджет энергии, баланс макросов, ИМТ и норму воды.')}
        </p>

        {/* identity: avatar + name */}
        <div>
          <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: `${NEON}50`,
            letterSpacing: '0.12em', marginBottom: 6 }}>{tr('CREW IDENTITY', 'ЛИЧНОСТЬ')}</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={name} onChange={e => setName(e.target.value)} placeholder={tr('Name *', 'Имя *')}
              style={{ ...inp, flex: 1 }} autoFocus
              onFocus={e => e.target.style.borderColor = `${NEON}55`}
              onBlur={e => e.target.style.borderColor = `${NEON}20`} />
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
            {MEMBER_EMOJI.map(em => (
              <button key={em} onClick={() => setEmoji(em)} style={{
                width: 32, height: 32, borderRadius: 7, fontSize: 18, cursor: 'pointer',
                border: `1px solid ${emoji === em ? `${NEON}55` : 'rgba(255,255,255,0.06)'}`,
                background: emoji === em ? NEON_DIM : 'transparent', transition: 'all 0.12s',
              }}>{em}</button>
            ))}
          </div>
        </div>

        {/* vitals */}
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { v: weightKg, set: setWeight, ph: tr('Weight', 'Вес'), unit: tr('kg', 'кг') },
            { v: heightCm, set: setHeight, ph: tr('Height', 'Рост'), unit: tr('cm', 'см') },
            { v: age,      set: setAge,    ph: tr('Age', 'Возраст'), unit: tr('yr', 'лет') },
          ].map(({ v, set, ph, unit }) => (
            <div key={ph} style={{ flex: 1 }}>
              <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: `${NEON}50`,
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
          <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: `${NEON}50`,
            letterSpacing: '0.12em', marginBottom: 6 }}>{tr('BIOMETRIC', 'БИОМЕТРИЯ')}</p>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['male', 'female'] as Sex[]).map(s => (
              <button key={s} onClick={() => setSex(s)} style={chip(sex === s)}>
                {s === 'male' ? tr('♂ MALE', '♂ МУЖ') : tr('♀ FEMALE', '♀ ЖЕН')}
              </button>
            ))}
          </div>
        </div>

        {/* activity */}
        <div>
          <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: `${NEON}50`,
            letterSpacing: '0.12em', marginBottom: 6 }}>{tr('ACTIVITY LEVEL', 'УРОВЕНЬ АКТИВНОСТИ')}</p>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {(Object.keys(ACTIVITY_META) as ActivityLevel[]).map(lvl => (
              <button key={lvl} onClick={() => setActivity(lvl)} title={actSub(lvl)}
                style={chip(activity === lvl)}>{actLabel(lvl)}</button>
            ))}
          </div>
        </div>

        {/* goal */}
        <div>
          <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: `${NEON}50`,
            letterSpacing: '0.12em', marginBottom: 6 }}>{tr('MISSION GOAL', 'ЦЕЛЬ МИССИИ')}</p>
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
                  <span style={{ fontSize: 'var(--fs-xs)' }}>{goalLabel(g)}</span>
                  <span style={{ fontSize: 11, opacity: 0.7 }}>{goalSub(g)}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* diet preference */}
        <div>
          <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: `${NEON}50`,
            letterSpacing: '0.12em', marginBottom: 6 }}>{tr('DIETARY PREFERENCE (OPTIONAL)', 'ПРЕДПОЧТЕНИЯ В ЕДЕ (НЕОБЯЗ.)')}</p>
          <input value={diet} onChange={e => setDiet(e.target.value)}
            placeholder={tr('e.g. vegetarian, no dairy, high protein…', 'напр. вегетариан., без молочного, много белка…')} style={inp}
            onFocus={e => e.target.style.borderColor = `${NEON}55`}
            onBlur={e => e.target.style.borderColor = `${NEON}20`} />
        </div>

        {/* live preview */}
        {preview && (
          <div style={{ padding: '12px 14px', borderRadius: 10,
            background: `${NEON}06`, border: `1px solid ${NEON}22` }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
              <p style={{ fontFamily: 'var(--font)', fontSize: 10, fontWeight: 700,
                color: NEON, letterSpacing: '0.18em', flex: 1 }}>{tr('DAILY RATION', 'ДНЕВНОЙ РАЦИОН')}</p>
              <BmiChip profile={draftProfile} />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 }}>
              <span style={{ fontFamily: 'var(--font)', fontSize: 28, fontWeight: 900,
                color: NEON, textShadow: `0 0 12px ${NEON}70`, lineHeight: 1 }}>{preview.calories}</span>
              <span style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: `${NEON}60`,
                letterSpacing: '0.1em' }}>{tr('KCAL / DAY', 'ККАЛ / ДЕНЬ')}</span>
              <span style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: 'rgba(148,163,184,0.4)',
                marginLeft: 'auto' }}>BMR {preview.bmr} · TDEE {preview.tdee}</span>
            </div>
            <div style={{ display: 'flex', gap: 14, marginBottom: 10 }}>
              {([['protein', preview.protein], ['carbs', preview.carbs], ['fat', preview.fat]] as const).map(([k, v]) => (
                <div key={k}>
                  <p style={{ fontFamily: 'var(--font)', fontSize: 17.5, fontWeight: 800,
                    color: MACRO[k].color, lineHeight: 1 }}>{v}g</p>
                  <p style={{ fontFamily: 'var(--font)', fontSize: 11, color: `${MACRO[k].color}80`,
                    letterSpacing: '0.1em', marginTop: 2 }}>{macroLabel(k)}</p>
                </div>
              ))}
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <p style={{ fontFamily: 'var(--font)', fontSize: 17.5, fontWeight: 800, color: AQUA, lineHeight: 1 }}>
                  {(recommendedWaterMl(draftProfile) / 1000).toFixed(1)}L</p>
                <p style={{ fontFamily: 'var(--font)', fontSize: 11, color: `${AQUA}80`,
                  letterSpacing: '0.1em', marginTop: 2 }}>💧 {tr('WATER', 'ВОДА')}</p>
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
          }}>⬡ {initial && !isFirst ? tr('SAVE CREW MEMBER', 'СОХРАНИТЬ') : tr('CALIBRATE STATION', 'КАЛИБРОВАТЬ')}</button>

        {onDelete && (
          <button onClick={onDelete} style={{
            padding: '8px', borderRadius: 7, cursor: 'pointer',
            fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.12em',
            color: 'rgba(255,84,112,0.6)', border: '1px solid rgba(255,84,112,0.2)',
            background: 'transparent', transition: 'all 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,84,112,0.08)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >✕ {tr('REMOVE FROM CREW', 'УБРАТЬ ИЗ ЭКИПАЖА')}</button>
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
        <button onClick={onCancel} style={{ fontFamily: 'var(--font)', fontSize: 13.5,
          color: `${NEON}55`, letterSpacing: '0.1em' }}>← {tr('CANCEL', 'ОТМЕНА')}</button>
        <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 900,
          color: NEON, letterSpacing: '0.18em', textShadow: `0 0 8px ${NEON}` }}>{tr('LOG NUTRIENTS', 'ЗАПИСЬ НУТРИЕНТОВ')}</p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* slot */}
        <div style={{ display: 'flex', gap: 5 }}>
          {SLOT_ORDER.map(s => (
            <button key={s} onClick={() => setSlot(s)} style={{
              flex: 1, padding: '6px 2px', borderRadius: 5, cursor: 'pointer',
              fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em',
              color: curSlot === s ? NEON : 'rgba(148,163,184,0.4)',
              border: `1px solid ${curSlot === s ? `${NEON}45` : 'rgba(255,255,255,0.06)'}`,
              background: curSlot === s ? NEON_DIM : 'transparent', transition: 'all 0.12s',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            }}>
              <span style={{ fontSize: 13.5 }}>{SLOT_META[s].icon}</span>
              {slotLabel(s)}
            </button>
          ))}
        </div>

        <input value={name} onChange={e => setName(e.target.value)} placeholder={tr('Meal name *', 'Название блюда *')} style={inp} autoFocus />

        <div>
          <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: `${NEON}50`,
            letterSpacing: '0.12em', marginBottom: 5 }}>{tr('CALORIES *', 'КАЛОРИИ *')}</p>
          <input type="number" value={cal} onChange={e => setCal(e.target.value)} placeholder={tr('kcal', 'ккал')} style={inp} />
        </div>

        <div>
          <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: `${NEON}50`,
            letterSpacing: '0.12em', marginBottom: 5 }}>{tr('MACROS (GRAMS)', 'МАКРОСЫ (ГРАММЫ)')}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            {([['protein', p, setP], ['carbs', c, setC], ['fat', f, setF]] as const).map(([k, v, set]) => (
              <div key={k} style={{ flex: 1 }}>
                <input type="number" value={v} onChange={e => set(e.target.value)} placeholder="0"
                  style={{ ...inp, borderColor: `${MACRO[k as keyof typeof MACRO].color}30`,
                    textAlign: 'center' }} />
                <p style={{ fontFamily: 'var(--font)', fontSize: 11, textAlign: 'center', marginTop: 3,
                  color: `${MACRO[k as keyof typeof MACRO].color}90`, letterSpacing: '0.08em' }}>
                  {macroLabel(k as keyof typeof MACRO)}
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
          }}>{tr('+ LOG TO MANIFEST', '+ В МАНИФЕСТ')}</button>
      </div>
    </div>
  )
}

// ─── "What should I eat?" — pantry-aware dish ideas ────────────────────────────
interface DeliveryMeal {
  name: string; slot: MealSlot
  calories: number; protein: number; carbs: number; fat: number   // PER SERVING
  why?: string
  uses?: string[]      // pantry items this dish draws on
  recipe?: string[]    // short cooking steps (scaled to `servings`)
  search?: string      // a good YouTube search query for this dish
}

const DELIVERY_SYSTEM = `You are SOLARIS, the AI nutrition chef of an orbital agri-station that plates personalised meals for crew members.
Suggest dishes that fit the crew member's REMAINING calorie/macro budget for the day and respect their dietary preference.
If a PANTRY list is given, strongly prefer dishes built mainly from those ingredients, and for each dish list which pantry items it "uses". If the pantry is empty, suggest sensible meals from common staples.
You will be told how many PEOPLE are eating — scale the recipe ingredient amounts to make that many SERVINGS, but keep the calories/protein/carbs/fat fields PER SINGLE SERVING.
Respond with ONLY a JSON array, no prose, no markdown fences. Each item:
{"name": string, "slot": "breakfast"|"lunch"|"dinner"|"snack", "calories": number, "protein": number, "carbs": number, "fat": number, "why": short string (max 8 words), "uses": string[] of pantry item names used (omit or [] if none), "recipe": string[] of 3-6 short cooking steps with quantities scaled for the requested servings, "search": a concise YouTube search query for this dish}
Return 2-4 dishes. Keep PER-SERVING totals close to the remaining budget. Numbers are grams except calories (kcal).`

function DeliveryPanel({ profile, targets, consumed, pantry, kitchen, favoriteNames, onAccept, onToggleFavorite, onOpenFavorites, onClose }: {
  profile:  SolarisProfile
  targets:  Targets
  consumed: { calories: number; protein: number; carbs: number; fat: number }
  pantry:   PantryItem[]
  kitchen:  KitchenConfig
  favoriteNames: Set<string>
  onAccept: (m: DeliveryMeal) => void
  onToggleFavorite: (m: DeliveryMeal) => void
  onOpenFavorites: () => void
  onClose:  () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [meals, setMeals]     = useState<DeliveryMeal[] | null>(null)
  const [accepted, setAccepted] = useState<Set<number>>(new Set())
  const [servings, setServings] = useState(1)
  const [openRecipe, setOpenRecipe] = useState<number | null>(null)

  const remaining = useMemo(() => ({
    calories: Math.max(0, targets.calories - consumed.calories),
    protein:  Math.max(0, targets.protein  - consumed.protein),
    carbs:    Math.max(0, targets.carbs    - consumed.carbs),
    fat:      Math.max(0, targets.fat      - consumed.fat),
  }), [targets, consumed])

  const synthesize = useCallback(async () => {
    setLoading(true); setError(null); setOpenRecipe(null)
    try {
      const settings = loadSettings()
      const pantryLine = pantry.length
        ? `PANTRY (prefer these): ${pantry.map(i => i.qty ? `${i.name} (${i.qty})` : i.name).join(', ')}.`
        : 'PANTRY: empty — use common staples.'
      const kitchenLine = `KITCHEN: ${kitchen.equipment.length ? `available equipment — ${kitchen.equipment.join(', ')}; only suggest recipes cookable with these.` : 'equipment unspecified.'}${kitchen.prefs ? ` Cooking preferences: ${kitchen.prefs}.` : ''}`
      const userMsg = `Crew goal: ${GOAL_META[profile.goal].label} (${profile.goal}).
Dietary preference: ${profile.diet || 'none'}.
PEOPLE EATING: ${servings} (scale recipe amounts for ${servings} serving${servings > 1 ? 's' : ''}; macros stay per single serving).
${pantryLine}
${kitchenLine}
REMAINING budget for the rest of today: ${remaining.calories} kcal, ${remaining.protein}g protein, ${remaining.carbs}g carbs, ${remaining.fat}g fat.
Suggest what to eat.`
      const parsed = await aiJson<DeliveryMeal[]>([
        { role: 'system', content: DELIVERY_SYSTEM },
        { role: 'user',   content: userMsg },
      ], settings, { model: modelForTask(settings, 'solaris.delivery'), maxTokens: 2200, prefill: '[' })
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
          uses: Array.isArray(m.uses) ? m.uses.map(String).filter(Boolean) : undefined,
          recipe: Array.isArray(m.recipe) ? m.recipe.map(String).filter(Boolean) : undefined,
          search: m.search ? String(m.search) : undefined,
        }))
      if (valid.length === 0) throw new Error('No dishes came back.')
      setMeals(valid)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not suggest dishes.')
    } finally {
      setLoading(false)
    }
  }, [profile, remaining, pantry, kitchen, servings])

  return (
    <div className="fade-in" style={{ position: 'absolute', inset: 0, zIndex: 20,
      background: 'rgba(8,4,0,0.95)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${NEON}18`,
        display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onClose} style={{ fontFamily: 'var(--font)', fontSize: 13.5,
          color: `${NEON}55`, letterSpacing: '0.1em' }}>← {tr('BACK', 'НАЗАД')}</button>
        <div>
          <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 900,
            color: NEON, letterSpacing: '0.18em', textShadow: `0 0 8px ${NEON}` }}>{tr('WHAT SHOULD I EAT?', 'ЧТО МНЕ ПОЕСТЬ?')}</p>
          <p style={{ fontFamily: 'var(--font)', fontSize: 11, color: `${NEON}45`,
            letterSpacing: '0.08em' }}>{pantry.length ? `${tr('FROM YOUR PANTRY ·', 'ИЗ ВАШЕЙ КЛАДОВОЙ ·')} ${pantry.length} ${tr('ITEMS', 'ПОЗ.')}` : tr('SYNTHESISED FROM ORBITAL AGRI-BAY', 'СИНТЕЗ ИЗ ОРБИТАЛЬНОЙ АГРОБАЗЫ')}</p>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
        {/* remaining budget readout */}
        <div style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 12,
          background: `${NEON}05`, border: `1px solid ${NEON}18`, display: 'flex', gap: 14 }}>
          <div>
            <p style={{ fontFamily: 'var(--font)', fontSize: 18, fontWeight: 900, color: NEON, lineHeight: 1 }}>
              {remaining.calories}</p>
            <p style={{ fontFamily: 'var(--font)', fontSize: 11, color: `${NEON}60`, letterSpacing: '0.1em' }}>{tr('KCAL LEFT', 'ККАЛ ОСТ.')}</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {([['protein', remaining.protein], ['carbs', remaining.carbs], ['fat', remaining.fat]] as const).map(([k, v]) => (
              <div key={k}>
                <p style={{ fontFamily: 'var(--font)', fontSize: 14.5, fontWeight: 800,
                  color: MACRO[k].color, lineHeight: 1 }}>{v}g</p>
                <p style={{ fontFamily: 'var(--font)', fontSize: 11, color: `${MACRO[k].color}80`,
                  letterSpacing: '0.08em' }}>{macroLabel(k)}</p>
              </div>
            ))}
          </div>
        </div>

        {!meals && !loading && (
          <div style={{ textAlign: 'center', padding: '20px 10px' }}>
            <div style={{ fontSize: 30, marginBottom: 10, filter: `drop-shadow(0 0 12px ${NEON})` }}>🛰️</div>
            <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', color: `${NEON}55`,
              lineHeight: 1.7, marginBottom: 16 }}>
              {pantry.length
                ? <>{tr('Dishes you can cook from your pantry,', 'Блюда, которые можно приготовить из кладовой,')}<br/>{tr('tuned to your remaining budget.', 'под ваш остаток бюджета.')}</>
                : <>{tr('Meal ideas tuned to your remaining budget.', 'Идеи блюд под ваш остаток бюджета.')}<br/>{tr('Stock the pantry for cook-from-what-you-have.', 'Наполните кладовую — готовьте из того, что есть.')}</>}
            </p>

            {/* how many people are eating */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 16,
              padding: '6px 10px', borderRadius: 8, background: `${NEON}06`, border: `1px solid ${NEON}20` }}>
              <span style={{ fontFamily: 'var(--font)', fontSize: 10, fontWeight: 700, color: `${NEON}80`,
                letterSpacing: '0.1em' }}>🍽 {tr('EATING', 'ЕДЯТ')}</span>
              {[1, 2, 3, 4].map(n => (
                <button key={n} onClick={() => setServings(n)} style={{
                  width: 24, height: 24, borderRadius: 6, cursor: 'pointer',
                  fontFamily: 'var(--font)', fontSize: 13.5, fontWeight: 800,
                  color: servings === n ? NEON : 'rgba(148,163,184,0.4)',
                  border: `1px solid ${servings === n ? `${NEON}55` : 'rgba(255,255,255,0.06)'}`,
                  background: servings === n ? NEON_DIM : 'transparent' }}>{n}</button>
              ))}
              <span style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: 'rgba(148,163,184,0.45)' }}>
                {servings === 1 ? tr('just me', 'только я') : `${servings} ${tr('people', 'чел.')}`}
              </span>
            </div>
            <br/>

            <button onClick={synthesize} style={{
              padding: '11px 26px', borderRadius: 7, cursor: 'pointer',
              fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', fontWeight: 800, letterSpacing: '0.12em',
              color: NEON, border: `1px solid ${NEON}45`, background: NEON_DIM, transition: 'background 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,177,60,0.2)'}
              onMouseLeave={e => e.currentTarget.style.background = NEON_DIM}
            >🍳 {tr('SUGGEST DISHES', 'ПРЕДЛОЖИТЬ БЛЮДА')}</button>

            {favoriteNames.size > 0 && (
              <div style={{ marginTop: 12 }}>
                <button onClick={onOpenFavorites} style={{
                  fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.1em',
                  padding: '8px 18px', borderRadius: 7, cursor: 'pointer', color: '#ffd700',
                  border: '1px solid rgba(255,215,0,0.3)', background: 'rgba(255,215,0,0.06)' }}>
                  ★ {tr('SAVED DISHES', 'СОХР. БЛЮДА')} ({favoriteNames.size})</button>
              </div>
            )}
          </div>
        )}

        {loading && (
          <div style={{ textAlign: 'center', padding: '30px 10px' }}>
            <div style={{ fontSize: 26, marginBottom: 12,
              animation: 'pulse 1.3s ease-in-out infinite' }}>🛰️</div>
            <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', color: NEON,
              letterSpacing: '0.12em' }}>{tr('PLATING YOUR DISHES…', 'ГОТОВИМ ВАШИ БЛЮДА…')}</p>
          </div>
        )}

        {error && (
          <div style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 12,
            background: 'rgba(255,84,112,0.08)', border: '1px solid rgba(255,84,112,0.3)' }}>
            <p style={{ fontFamily: 'var(--font)', fontSize: 10.5, color: '#ff5470',
              letterSpacing: '0.08em', lineHeight: 1.6 }}>⚠ {error}</p>
            <button onClick={synthesize} style={{ marginTop: 8, fontFamily: 'var(--font)',
              fontSize: 10.5, color: NEON, letterSpacing: '0.1em' }}>↻ {tr('RETRY', 'ЕЩЁ РАЗ')}</button>
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
                  <span style={{ fontSize: 15.5 }}>{SLOT_META[m.slot].icon}</span>
                  <p style={{ fontFamily: 'var(--font)', fontSize: 13.5, fontWeight: 800,
                    color: 'rgba(255,240,220,0.92)', flex: 1 }}>{m.name}</p>
                  <span style={{ fontFamily: 'var(--font)', fontSize: 15.5, fontWeight: 900, color: NEON }}>
                    {m.calories}</span>
                </div>
                <div style={{ display: 'flex', gap: 12, marginBottom: m.why ? 8 : 0 }}>
                  {([['protein', m.protein], ['carbs', m.carbs], ['fat', m.fat]] as const).map(([k, v]) => (
                    <span key={k} style={{ fontFamily: 'var(--font)', fontSize: 10.5,
                      color: MACRO[k].color }}>{macroLabel(k)[0]} {v}g</span>
                  ))}
                  <span style={{ fontFamily: 'var(--font)', fontSize: 11.5, marginLeft: 'auto',
                    color: 'rgba(148,163,184,0.4)' }}>
                    {slotLabel(m.slot)}{servings > 1 ? ` · ${tr('/serving', '/порция')}` : ''}
                  </span>
                </div>
                {m.why && (
                  <p style={{ fontFamily: 'var(--font)', fontSize: 10, color: `${NEON}55`,
                    fontStyle: 'italic', letterSpacing: '0.02em', marginBottom: 8 }}>“{m.why}”</p>
                )}
                {m.uses && m.uses.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                    {m.uses.map((u, j) => (
                      <span key={j} style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: '#4ade80',
                        padding: '2px 6px', borderRadius: 4, background: 'rgba(74,222,128,0.08)',
                        border: '1px solid rgba(74,222,128,0.25)' }}>🧺 {u}</span>
                    ))}
                  </div>
                )}

                {/* recipe + how-to + save */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
                  {m.recipe && m.recipe.length > 0 && (
                    <button onClick={() => setOpenRecipe(openRecipe === i ? null : i)} style={{
                      fontFamily: 'var(--font)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                      padding: '4px 8px', borderRadius: 5, cursor: 'pointer', color: `${NEON}b0`,
                      border: `1px solid ${NEON}28`, background: NEON_DIM }}>
                      👨‍🍳 {tr('RECIPE', 'РЕЦЕПТ')}{servings > 1 ? ` · ${tr('serves', 'на')} ${servings}` : ''} {openRecipe === i ? '▴' : '▾'}</button>
                  )}
                  {m.search && (
                    <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(m.search)}`}
                      target="_blank" rel="noreferrer" style={{
                      fontFamily: 'var(--font)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                      padding: '4px 8px', borderRadius: 5, textDecoration: 'none', color: '#ff5470',
                      border: '1px solid rgba(255,84,112,0.3)', background: 'rgba(255,84,112,0.06)' }}>▶ YOUTUBE</a>
                  )}
                  {(() => {
                    const fav = favoriteNames.has(m.name.toLowerCase())
                    return (
                      <button onClick={() => onToggleFavorite(m)} title={fav ? tr('Remove from favourites', 'Убрать из избранного') : tr('Save to favourites', 'В избранное')}
                        style={{ marginLeft: 'auto', fontFamily: 'var(--font)', fontSize: 14.5, cursor: 'pointer',
                          padding: '2px 6px', borderRadius: 5, color: fav ? '#ffd700' : `${NEON}70`,
                          border: `1px solid ${fav ? 'rgba(255,215,0,0.4)' : `${NEON}22`}`,
                          background: fav ? 'rgba(255,215,0,0.08)' : 'transparent' }}>{fav ? '★' : '☆'}</button>
                    )
                  })()}
                </div>
                {m.recipe && openRecipe === i && (
                  <ol style={{ margin: '0 0 8px', paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {m.recipe.map((step, j) => (
                      <li key={j} style={{ fontFamily: 'var(--font)', fontSize: 10.5, lineHeight: 1.5,
                        color: 'rgba(255,240,220,0.78)' }}>{step}</li>
                    ))}
                  </ol>
                )}

                <button disabled={isAccepted} onClick={() => { onAccept(m); setAccepted(s => new Set(s).add(i)) }}
                  style={{
                    width: '100%', padding: '6px', borderRadius: 5, cursor: isAccepted ? 'default' : 'pointer',
                    fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.1em',
                    color: isAccepted ? '#4ade80' : NEON,
                    border: `1px solid ${isAccepted ? '#4ade8040' : `${NEON}35`}`,
                    background: isAccepted ? 'rgba(74,222,128,0.08)' : NEON_DIM, transition: 'all 0.15s',
                  }}>{isAccepted ? tr('✓ LOGGED', '✓ ЗАПИСАНО') : tr('⬇ I ATE THIS', '⬇ Я ЭТО СЪЕЛ')}</button>
              </div>
            </div>
          )
        })}

        {meals && (
          <button onClick={() => { meals.forEach((m, i) => { if (!accepted.has(i)) onAccept(m) }); onClose() }}
            style={{ width: '100%', marginTop: 4, padding: '10px', borderRadius: 7, cursor: 'pointer',
              fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 800, letterSpacing: '0.12em',
              color: SOLAR, border: `1px solid ${SOLAR}40`, background: `${SOLAR}10`, transition: 'all 0.15s' }}
          >{tr('⬇ ACCEPT ALL & CLOSE', '⬇ ПРИНЯТЬ ВСЁ И ЗАКРЫТЬ')}</button>
        )}
      </div>
    </div>
  )
}

// ─── Saved / favourite dishes ──────────────────────────────────────────────────
function FavoritesScreen({ favorites, onLog, onRemove, onClose }: {
  favorites: SavedDish[]
  onLog: (d: SavedDish) => void
  onRemove: (id: string) => void
  onClose: () => void
}) {
  const [openRecipe, setOpenRecipe] = useState<string | null>(null)
  const [logged, setLogged] = useState<Set<string>>(new Set())

  return (
    <div className="fade-in" style={{ position: 'absolute', inset: 0, zIndex: 20,
      background: 'rgba(8,4,0,0.96)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${NEON}18`,
        display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onClose} style={{ fontFamily: 'var(--font)', fontSize: 13.5,
          color: `${NEON}55`, letterSpacing: '0.1em' }}>← {tr('BACK', 'НАЗАД')}</button>
        <div>
          <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 900,
            color: '#ffd700', letterSpacing: '0.18em', textShadow: '0 0 8px rgba(255,215,0,0.5)' }}>★ {tr('SAVED DISHES', 'СОХР. БЛЮДА')}</p>
          <p style={{ fontFamily: 'var(--font)', fontSize: 11, color: `${NEON}45`,
            letterSpacing: '0.08em' }}>{tr('YOUR FAVOURITE MEALS ·', 'ВАШИ ЛЮБИМЫЕ БЛЮДА ·')} {favorites.length}</p>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
        {favorites.length === 0 ? (
          <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', color: 'rgba(148,163,184,0.4)',
            textAlign: 'center', padding: '24px 10px', lineHeight: 1.7 }}>
            {tr('No saved dishes yet. Tap the ☆ on any', 'Пока нет сохранённых блюд. Нажмите ☆ на любом')}<br/>{tr('suggested dish to keep it here for later.', 'предложенном блюде, чтобы сохранить его тут.')}
          </p>
        ) : favorites.map(m => {
          const on = logged.has(m.id)
          return (
            <div key={m.id} style={{ marginBottom: 8, borderRadius: 9, overflow: 'hidden',
              background: 'rgba(20,12,2,0.6)', border: `1px solid ${NEON}18` }}>
              <div style={{ padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 15.5 }}>{SLOT_META[m.slot].icon}</span>
                  <p style={{ fontFamily: 'var(--font)', fontSize: 13.5, fontWeight: 800,
                    color: 'rgba(255,240,220,0.92)', flex: 1 }}>{m.name}</p>
                  <span style={{ fontFamily: 'var(--font)', fontSize: 15.5, fontWeight: 900, color: NEON }}>{m.calories}</span>
                </div>
                <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                  {([['protein', m.protein], ['carbs', m.carbs], ['fat', m.fat]] as const).map(([k, v]) => (
                    <span key={k} style={{ fontFamily: 'var(--font)', fontSize: 10.5, color: MACRO[k].color }}>{macroLabel(k)[0]} {v}g</span>
                  ))}
                  <span style={{ fontFamily: 'var(--font)', fontSize: 11.5, marginLeft: 'auto',
                    color: 'rgba(148,163,184,0.4)' }}>{slotLabel(m.slot)}</span>
                </div>
                {m.why && (
                  <p style={{ fontFamily: 'var(--font)', fontSize: 10, color: `${NEON}55`,
                    fontStyle: 'italic', marginBottom: 8 }}>“{m.why}”</p>
                )}
                {m.uses && m.uses.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                    {m.uses.map((u, j) => (
                      <span key={j} style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: '#4ade80',
                        padding: '2px 6px', borderRadius: 4, background: 'rgba(74,222,128,0.08)',
                        border: '1px solid rgba(74,222,128,0.25)' }}>🧺 {u}</span>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
                  {m.recipe && m.recipe.length > 0 && (
                    <button onClick={() => setOpenRecipe(openRecipe === m.id ? null : m.id)} style={{
                      fontFamily: 'var(--font)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                      padding: '4px 8px', borderRadius: 5, cursor: 'pointer', color: `${NEON}b0`,
                      border: `1px solid ${NEON}28`, background: NEON_DIM }}>
                      👨‍🍳 {tr('RECIPE', 'РЕЦЕПТ')} {openRecipe === m.id ? '▴' : '▾'}</button>
                  )}
                  {m.search && (
                    <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(m.search)}`}
                      target="_blank" rel="noreferrer" style={{
                      fontFamily: 'var(--font)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                      padding: '4px 8px', borderRadius: 5, textDecoration: 'none', color: '#ff5470',
                      border: '1px solid rgba(255,84,112,0.3)', background: 'rgba(255,84,112,0.06)' }}>▶ YOUTUBE</a>
                  )}
                  <button onClick={() => onRemove(m.id)} title={tr('Remove from favourites', 'Убрать из избранного')}
                    style={{ marginLeft: 'auto', fontFamily: 'var(--font)', fontSize: 14.5, cursor: 'pointer',
                      padding: '2px 6px', borderRadius: 5, color: '#ffd700',
                      border: '1px solid rgba(255,215,0,0.4)', background: 'rgba(255,215,0,0.08)' }}>★</button>
                </div>
                {m.recipe && openRecipe === m.id && (
                  <ol style={{ margin: '0 0 8px', paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {m.recipe.map((step, j) => (
                      <li key={j} style={{ fontFamily: 'var(--font)', fontSize: 10.5, lineHeight: 1.5,
                        color: 'rgba(255,240,220,0.78)' }}>{step}</li>
                    ))}
                  </ol>
                )}
                <button disabled={on} onClick={() => { onLog(m); setLogged(s => new Set(s).add(m.id)) }} style={{
                  width: '100%', padding: '6px', borderRadius: 5, cursor: on ? 'default' : 'pointer',
                  fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.1em',
                  color: on ? '#4ade80' : NEON, border: `1px solid ${on ? '#4ade8040' : `${NEON}35`}`,
                  background: on ? 'rgba(74,222,128,0.08)' : NEON_DIM }}>{on ? tr('✓ LOGGED', '✓ ЗАПИСАНО') : tr('⬇ I ATE THIS', '⬇ Я ЭТО СЪЕЛ')}</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── AI meal logging (describe or snap what you ate) ───────────────────────────
const MEALPARSE_SYSTEM = `You are SOLARIS' meal-logging assistant. The crew member tells you — in words and/or a photo — what they ATE or DRANK.
Identify each distinct food/drink item and estimate its nutrition realistically for the portion shown or described.
Respond with ONLY a JSON array, no prose, no markdown fences. Each item:
{"name": string, "slot": "breakfast"|"lunch"|"dinner"|"snack", "calories": number, "protein": number, "carbs": number, "fat": number}
Numbers are grams except calories (kcal). Group obvious sub-parts into one dish when natural.
Choosing the slot: go by MEAL ORDER, not the wall clock. The user tells you which slots are already logged today — if NONE are, this is their first meal of the day, so use "breakfast" even if it's logged late. Otherwise pick the next sensible cycle (or "snack" for light bites). All items in one submission usually share the same slot unless clearly different meals.`

function MealLogPanel({ defaultSlot, loggedSlots, onAccept, onClose }: {
  defaultSlot: MealSlot
  loggedSlots: MealSlot[]
  onAccept: (d: NewFoodData) => void
  onClose: () => void
}) {
  const [text, setText]       = useState('')
  const [image, setImage]     = useState<ImageInput | null>(null)
  const [imgName, setImgName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [items, setItems]     = useState<NewFoodData[] | null>(null)
  const [accepted, setAccepted] = useState<Set<number>>(new Set())
  const fileRef = useRef<HTMLInputElement>(null)

  const pickImage = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try { setImage(await fileToImageInput(file)); setImgName(file.name) }
    catch (e) { setError(e instanceof Error ? e.message : tr('Could not read the image.', 'Не удалось прочитать изображение.')) }
  }

  const parse = useCallback(async () => {
    if (!text.trim() && !image) { setError(tr('Describe a meal or attach a photo first.', 'Сначала опишите блюдо или прикрепите фото.')); return }
    setLoading(true); setError(null)
    try {
      const settings = loadSettings()
      const model = modelForTask(settings, 'solaris.mealparse')
      const loggedLine = loggedSlots.length
        ? `Slots already logged today: ${loggedSlots.join(', ')}.`
        : 'Nothing logged today yet — this is the first meal of the day.'
      const prompt = `${text.trim() || 'Identify the food in the photo.'}\n${loggedLine}\nIf still unclear, default to: ${defaultSlot}.`
      const parsed = image
        ? await aiVisionJson<NewFoodData[]>(MEALPARSE_SYSTEM, prompt, [image], settings, { model, maxTokens: 1200, prefill: '[' })
        : await aiJson<NewFoodData[]>(
            [{ role: 'system', content: MEALPARSE_SYSTEM }, { role: 'user', content: prompt }],
            settings, { model, maxTokens: 1200, prefill: '[' })
      const valid = (parsed as NewFoodData[])
        .filter(m => m && m.name && typeof m.calories === 'number')
        .map(m => ({
          name: String(m.name),
          slot: (SLOT_ORDER.includes(m.slot) ? m.slot : defaultSlot) as MealSlot,
          calories: Math.round(m.calories) || 0,
          protein:  Math.round(m.protein)  || 0,
          carbs:    Math.round(m.carbs)    || 0,
          fat:      Math.round(m.fat)      || 0,
        }))
      if (!valid.length) throw new Error(tr('Could not read any food from that.', 'Не удалось распознать еду.'))
      setItems(valid)
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('Meal parse failed.', 'Не удалось разобрать приём пищи.'))
    } finally {
      setLoading(false)
    }
  }, [text, image, defaultSlot, loggedSlots])

  return (
    <div className="fade-in" style={{ position: 'absolute', inset: 0, zIndex: 20,
      background: 'rgba(8,4,0,0.95)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${NEON}18`,
        display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onClose} style={{ fontFamily: 'var(--font)', fontSize: 13.5,
          color: `${NEON}55`, letterSpacing: '0.1em' }}>← {tr('CANCEL', 'ОТМЕНА')}</button>
        <div>
          <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 900,
            color: NEON, letterSpacing: '0.18em', textShadow: `0 0 8px ${NEON}` }}>{tr('LOG A MEAL', 'ЗАПИСАТЬ ПРИЁМ ПИЩИ')}</p>
          <p style={{ fontFamily: 'var(--font)', fontSize: 11, color: `${NEON}45`,
            letterSpacing: '0.08em' }}>{tr('DESCRIBE IT OR SNAP IT — SOLARIS DOES THE MATH', 'ОПИШИТЕ ИЛИ СФОТКАЙТЕ — SOLARIS ПОСЧИТАЕТ')}</p>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!items && (
          <>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={3} autoFocus
              placeholder={tr('e.g. two scrambled eggs, sourdough toast with butter, a flat white', 'напр. два яйца-болтунья, тост с маслом, флэт-уайт')}
              style={{ width: '100%', padding: '9px 11px', borderRadius: 7, resize: 'vertical',
                background: 'rgba(0,0,0,0.5)', border: `1px solid ${NEON}20`, outline: 'none',
                fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', color: 'rgba(255,240,220,0.9)', lineHeight: 1.5 }} />

            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => { void pickImage(e.target.files?.[0]); e.target.value = '' }} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={() => fileRef.current?.click()} style={{
                padding: '8px 12px', borderRadius: 7, cursor: 'pointer', flexShrink: 0,
                fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.08em',
                color: `${NEON}90`, border: `1px solid ${NEON}30`, background: NEON_DIM }}>📷 {image ? tr('CHANGE PHOTO', 'СМЕНИТЬ ФОТО') : tr('ADD PHOTO', 'ДОБАВИТЬ ФОТО')}</button>
              {image && (
                <span style={{ fontFamily: 'var(--font)', fontSize: 10, color: '#4ade80', flex: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>✓ {imgName || tr('photo attached', 'фото прикреплено')}</span>
              )}
              {image && (
                <button onClick={() => { setImage(null); setImgName('') }} title={tr('Remove photo', 'Убрать фото')} style={{
                  fontFamily: 'var(--font)', fontSize: 14.5, color: 'rgba(255,84,112,0.5)', cursor: 'pointer' }}>✕</button>
              )}
            </div>

            {error && (
              <p style={{ fontFamily: 'var(--font)', fontSize: 10.5, color: '#ff5470', letterSpacing: '0.06em' }}>⚠ {error}</p>
            )}

            <button disabled={loading} onClick={parse} style={{
              padding: '11px', borderRadius: 7, cursor: loading ? 'default' : 'pointer',
              fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', fontWeight: 800, letterSpacing: '0.12em',
              color: NEON, border: `1px solid ${NEON}45`, background: NEON_DIM, opacity: loading ? 0.6 : 1 }}>
              {loading ? tr('◌ READING…', '◌ ЧИТАЮ…') : tr('✦ READ MY MEAL', '✦ ПРОЧИТАТЬ ПРИЁМ')}</button>
          </>
        )}

        {items && (
          <>
            <p style={{ fontFamily: 'var(--font)', fontSize: 10, color: `${NEON}70`, letterSpacing: '0.1em' }}>
              {tr('SOLARIS READ', 'SOLARIS НАШЁЛ')} {items.length} {tr('items — add what is right', 'поз. — добавьте нужное')}
            </p>
            {items.map((m, i) => {
              const on = accepted.has(i)
              return (
                <div key={i} style={{ borderRadius: 9, padding: '10px 12px',
                  background: 'rgba(20,12,2,0.6)', border: `1px solid ${on ? '#4ade8040' : `${NEON}18`}`, opacity: on ? 0.6 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 15.5 }}>{SLOT_META[m.slot].icon}</span>
                    <p style={{ fontFamily: 'var(--font)', fontSize: 13.5, fontWeight: 800,
                      color: 'rgba(255,240,220,0.92)', flex: 1 }}>{m.name}</p>
                    <span style={{ fontFamily: 'var(--font)', fontSize: 15.5, fontWeight: 900, color: NEON }}>{m.calories}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                    {([['protein', m.protein], ['carbs', m.carbs], ['fat', m.fat]] as const).map(([k, v]) => (
                      <span key={k} style={{ fontFamily: 'var(--font)', fontSize: 10.5, color: MACRO[k].color }}>{macroLabel(k)[0]} {v}g</span>
                    ))}
                    <span style={{ fontFamily: 'var(--font)', fontSize: 11.5, marginLeft: 'auto',
                      color: 'rgba(148,163,184,0.4)' }}>{slotLabel(m.slot)}</span>
                  </div>
                  <button disabled={on} onClick={() => { onAccept(m); setAccepted(s => new Set(s).add(i)) }} style={{
                    width: '100%', padding: '6px', borderRadius: 5, cursor: on ? 'default' : 'pointer',
                    fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.1em',
                    color: on ? '#4ade80' : NEON, border: `1px solid ${on ? '#4ade8040' : `${NEON}35`}`,
                    background: on ? 'rgba(74,222,128,0.08)' : NEON_DIM }}>{on ? tr('✓ LOGGED', '✓ ЗАПИСАНО') : tr('⬇ ADD TO MANIFEST', '⬇ В МАНИФЕСТ')}</button>
                </div>
              )
            })}
            <button onClick={() => { items.forEach((m, i) => { if (!accepted.has(i)) onAccept(m) }); onClose() }} style={{
              padding: '10px', borderRadius: 7, cursor: 'pointer',
              fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 800, letterSpacing: '0.12em',
              color: SOLAR, border: `1px solid ${SOLAR}40`, background: `${SOLAR}10` }}>{tr('⬇ ADD ALL & CLOSE', '⬇ ДОБАВИТЬ ВСЁ И ЗАКРЫТЬ')}</button>
            <button onClick={() => { setItems(null); setAccepted(new Set()) }} style={{
              fontFamily: 'var(--font)', fontSize: 10.5, color: `${NEON}60`, letterSpacing: '0.1em' }}>↻ {tr('LOG SOMETHING ELSE', 'ЗАПИСАТЬ ДРУГОЕ')}</button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Pantry (shared groceries) + photo scan ────────────────────────────────────
const PANTRY_SYSTEM = `You read a photo of groceries, a fridge, or a pantry and list the distinct FOOD ingredients you can see.
Respond with ONLY a JSON array, no prose, no markdown fences. Each item: {"name": string, "qty": short string like "2", "500g", or ""}.
List only foods/ingredients, be specific but concise (e.g. "eggs", "cheddar cheese", "spinach"). No duplicates.`

function PantryScreen({ pantry, kitchen, onAdd, onAddMany, onRemove, onToggleEquip, onSetPrefs, onCook, onAnalyze, onClose }: {
  pantry: PantryItem[]
  kitchen: KitchenConfig
  onAdd: (name: string, qty: string) => void
  onAddMany: (items: { name: string; qty?: string }[]) => void
  onRemove: (id: string) => void
  onToggleEquip: (item: string) => void
  onSetPrefs: (prefs: string) => void
  onCook: () => void
  onAnalyze: () => void
  onClose: () => void
}) {
  const [name, setName]   = useState('')
  const [qty, setQty]     = useState('')
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const submit = () => { if (name.trim()) { onAdd(name, qty); setName(''); setQty('') } }

  const scan = async (file: File | undefined) => {
    if (!file) return
    setScanning(true); setError(null)
    try {
      const img = await fileToImageInput(file)
      const settings = loadSettings()
      const parsed = await aiVisionJson<{ name: string; qty?: string }[]>(
        PANTRY_SYSTEM, 'List the groceries in this photo.', [img], settings,
        { model: modelForTask(settings, 'solaris.pantry'), maxTokens: 800, prefill: '[' })
      const items = (parsed || []).filter(i => i && i.name).map(i => ({ name: String(i.name), qty: i.qty ? String(i.qty) : '' }))
      if (!items.length) throw new Error(tr('No groceries spotted in that photo.', 'На фото не найдено продуктов.'))
      onAddMany(items)
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('Scan failed.', 'Сканирование не удалось.'))
    } finally {
      setScanning(false)
    }
  }

  const inp: React.CSSProperties = {
    padding: '7px 10px', borderRadius: 5, background: 'rgba(0,0,0,0.5)',
    border: `1px solid ${NEON}20`, outline: 'none',
    fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', color: 'rgba(255,240,220,0.9)',
  }

  return (
    <div className="fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${NEON}18`,
        display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onClose} style={{ fontFamily: 'var(--font)', fontSize: 13.5,
          color: `${NEON}55`, letterSpacing: '0.1em' }}>← {tr('BACK', 'НАЗАД')}</button>
        <div style={{ flex: 1 }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 900,
            color: NEON, letterSpacing: '0.18em', textShadow: `0 0 8px ${NEON}` }}>{tr('SHARED PANTRY', 'ОБЩАЯ КЛАДОВАЯ')}</p>
          <p style={{ fontFamily: 'var(--font)', fontSize: 11, color: `${NEON}45`,
            letterSpacing: '0.08em' }}>{tr('WHAT THE CREW HAS IN STOCK ·', 'ЧТО ЕСТЬ У ЭКИПАЖА ·')} {pantry.length} {tr('ITEMS', 'ПОЗ.')}</p>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* add row */}
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={tr('Add item…', 'Добавить продукт…')} autoFocus
            onKeyDown={e => { if (e.key === 'Enter') submit() }} style={{ ...inp, flex: 1 }} />
          <input value={qty} onChange={e => setQty(e.target.value)} placeholder={tr('qty', 'кол-во')}
            onKeyDown={e => { if (e.key === 'Enter') submit() }} style={{ ...inp, width: 56, textAlign: 'center' }} />
          <button onClick={submit} style={{ ...inp, cursor: 'pointer', color: NEON, borderColor: `${NEON}45`,
            background: NEON_DIM, fontWeight: 800 }}>{tr('ADD', 'ДОБ.')}</button>
        </div>

        {/* photo scan */}
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => { void scan(e.target.files?.[0]); e.target.value = '' }} />
        <button disabled={scanning} onClick={() => fileRef.current?.click()} style={{
          padding: '9px', borderRadius: 7, cursor: scanning ? 'default' : 'pointer',
          fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.1em',
          color: `${AQUA}d0`, border: `1px solid ${AQUA}35`, background: `${AQUA}0c`, opacity: scanning ? 0.6 : 1 }}>
          {scanning ? tr('◌ READING GROCERIES…', '◌ ЧИТАЮ ПРОДУКТЫ…') : tr('📷 SCAN GROCERIES FROM A PHOTO', '📷 СКАНИРОВАТЬ ПРОДУКТЫ С ФОТО')}</button>
        {error && <p style={{ fontFamily: 'var(--font)', fontSize: 10.5, color: '#ff5470', letterSpacing: '0.06em' }}>⚠ {error}</p>}

        {/* kitchen setup — what we can cook with */}
        <div style={{ padding: '10px 12px', borderRadius: 8, background: `${NEON}05`, border: `1px solid ${NEON}16` }}>
          <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: `${NEON}60`,
            letterSpacing: '0.12em', marginBottom: 7 }}>🍳 {tr('KITCHEN — DISHES ARE TAILORED TO THIS', 'КУХНЯ — БЛЮДА ПОДБИРАЮТСЯ ПОД НЕЁ')}</p>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
            {KITCHEN_EQUIPMENT.map(eq => {
              const on = kitchen.equipment.includes(eq)
              return (
                <button key={eq} onClick={() => onToggleEquip(eq)} style={{
                  padding: '4px 9px', borderRadius: 5, cursor: 'pointer',
                  fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.04em',
                  color: on ? NEON : 'rgba(148,163,184,0.45)',
                  border: `1px solid ${on ? `${NEON}50` : 'rgba(255,255,255,0.07)'}`,
                  background: on ? NEON_DIM : 'transparent' }}>{on ? '✓ ' : ''}{equipLabel(eq)}</button>
              )
            })}
          </div>
          <input value={kitchen.prefs} onChange={e => onSetPrefs(e.target.value)}
            placeholder={tr('Cooking style — e.g. no fried, keep it simple, quick meals', 'Стиль готовки — напр. без жарки, попроще, быстрые блюда')}
            style={{ ...inp, width: '100%' }} />
        </div>

        {/* list */}
        {pantry.length === 0 ? (
          <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', color: 'rgba(148,163,184,0.4)',
            textAlign: 'center', padding: '20px 10px', lineHeight: 1.7 }}>
            {tr('The pantry is empty. Add items or snap a photo —', 'Кладовая пуста. Добавьте продукты или сделайте фото —')}<br/>{tr('then SOLARIS can suggest dishes from what you have.', 'и SOLARIS предложит блюда из того, что есть.')}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {pantry.map(it => (
              <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 11px',
                borderRadius: 7, background: 'rgba(18,11,2,0.55)', border: `1px solid ${NEON}10` }}>
                <span style={{ fontSize: 13.5 }}>🧺</span>
                <span style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)',
                  color: 'rgba(255,240,220,0.85)', flex: 1 }}>{it.name}</span>
                {it.qty && <span style={{ fontFamily: 'var(--font)', fontSize: 10.5, color: `${NEON}70` }}>{it.qty}</span>}
                <button onClick={() => onRemove(it.id)} title={tr('Remove', 'Удалить')} style={{
                  fontFamily: 'var(--font)', fontSize: 14.5, color: 'rgba(255,84,112,0.4)', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#ff5470'}
                  onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,84,112,0.4)'}
                >✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* footer CTAs */}
      <div style={{ padding: '10px 14px', borderTop: `1px solid ${NEON}14`, flexShrink: 0, display: 'flex', gap: 8 }}>
        <button onClick={onAnalyze} style={{
          flex: 1, padding: '11px', borderRadius: 8, cursor: 'pointer',
          fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 800, letterSpacing: '0.1em',
          color: `${AQUA}d0`, border: `1px solid ${AQUA}35`, background: `${AQUA}0c` }}>
          🔬 {tr('ANALYSE', 'АНАЛИЗ')}</button>
        <button onClick={onCook} style={{
          flex: 1.4, padding: '11px', borderRadius: 8, cursor: 'pointer',
          fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', fontWeight: 800, letterSpacing: '0.1em',
          color: NEON, border: `1px solid ${NEON}40`, background: `linear-gradient(90deg, ${SOLAR}12, ${NEON}10)` }}>
          🍳 {tr('WHAT CAN I COOK?', 'ЧТО ПРИГОТОВИТЬ?')}</button>
      </div>
    </div>
  )
}

// ─── Pantry analyzer — gaps + cost-tiered shopping ─────────────────────────────
type Budget = 'thrifty' | 'balanced' | 'premium'
interface Coverage { nutrient: string; status: 'good' | 'low' | 'missing'; note?: string }
interface ShopItem { item: string; why: string; cost: 'cheap' | 'mid' | 'premium' }
interface Analysis { summary: string; coverage: Coverage[]; shopping: ShopItem[] }

const COVER_COLOR = { good: '#4ade80', low: '#ffb13c', missing: '#ff5470' }
const COST_META: Record<ShopItem['cost'], { label: string; color: string }> = {
  cheap:   { label: 'CHEAP',   color: '#4ade80' },
  mid:     { label: 'MID',     color: '#ffb13c' },
  premium: { label: 'PREMIUM', color: '#c084fc' },
}
const BUDGET_META: Record<Budget, { label: string; hint: string }> = {
  thrifty:  { label: 'THRIFTY',  hint: 'cheap staples' },
  balanced: { label: 'BALANCED', hint: 'good value' },
  premium:  { label: 'PREMIUM',  hint: 'quality welcome' },
}
const budgetLabel = (b: Budget) => tr(BUDGET_META[b].label, ({ thrifty: 'ЭКОНОМ', balanced: 'БАЛАНС', premium: 'ПРЕМИУМ' } as Record<Budget, string>)[b])
const budgetHint  = (b: Budget) => tr(BUDGET_META[b].hint, ({ thrifty: 'дешёвые продукты', balanced: 'выгодно', premium: 'качество приветствуется' } as Record<Budget, string>)[b])
const costLabel   = (c: ShopItem['cost']) => tr(COST_META[c].label, ({ cheap: 'ДЁШЕВО', mid: 'СРЕДНЕ', premium: 'ПРЕМИУМ' } as Record<string, string>)[c] ?? COST_META[c].label)
const coverLabel  = (s: Coverage['status']) => tr(s, ({ good: 'хорошо', low: 'мало', missing: 'нет' } as Record<string, string>)[s] ?? s)

const ANALYZE_SYSTEM = `You are SOLARIS' nutrition analyst. Given a crew member's daily targets and dietary preference, plus the shared PANTRY contents, assess how well the pantry covers their nutrition and what they should buy.
Judge macro coverage (protein, carbs, fat) AND food-group gaps (vegetables, fruit, fibre, healthy fats, dairy, etc).
Respect the BUDGET preference for shopping: thrifty = cheapest staples, balanced = good value, premium = quality/specialty welcome.
Respond with ONLY a JSON object, no prose, no markdown fences:
{"summary": one or two sentence plain read of the pantry, "coverage": [{"nutrient": string, "status": "good"|"low"|"missing", "note": short string}], "shopping": [{"item": string, "why": short string, "cost": "cheap"|"mid"|"premium"}]}
Cover the key macros and main food groups in "coverage". Suggest 4-8 "shopping" items matched to the budget.`

function PantryAnalyzer({ profile, targets, pantry, onAddItem, onClose }: {
  profile: SolarisProfile
  targets: Targets
  pantry:  PantryItem[]
  onAddItem: (name: string) => void
  onClose: () => void
}) {
  const [budget, setBudget]   = useState<Budget>('balanced')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [added, setAdded]     = useState<Set<string>>(new Set())

  const run = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const settings = loadSettings()
      const pantryLine = pantry.length
        ? pantry.map(i => i.qty ? `${i.name} (${i.qty})` : i.name).join(', ')
        : '(empty)'
      const userMsg = `Daily targets: ${targets.calories} kcal, ${targets.protein}g protein, ${targets.carbs}g carbs, ${targets.fat}g fat.
Goal: ${GOAL_META[profile.goal].label} (${profile.goal}). Dietary preference: ${profile.diet || 'none'}.
BUDGET: ${budget}.
PANTRY: ${pantryLine}.
Analyse coverage and suggest a shopping list.`
      const parsed = await aiJson<Analysis>([
        { role: 'system', content: ANALYZE_SYSTEM },
        { role: 'user',   content: userMsg },
      ], settings, { model: modelForTask(settings, 'solaris.analyze'), maxTokens: 1400 })
      setAnalysis({
        summary: String(parsed.summary ?? ''),
        coverage: Array.isArray(parsed.coverage) ? parsed.coverage.filter(c => c && c.nutrient).map(c => ({
          nutrient: String(c.nutrient),
          status: (['good', 'low', 'missing'].includes(c.status) ? c.status : 'low') as Coverage['status'],
          note: c.note ? String(c.note) : undefined,
        })) : [],
        shopping: Array.isArray(parsed.shopping) ? parsed.shopping.filter(s => s && s.item).map(s => ({
          item: String(s.item),
          why: String(s.why ?? ''),
          cost: (['cheap', 'mid', 'premium'].includes(s.cost) ? s.cost : 'mid') as ShopItem['cost'],
        })) : [],
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('Analysis failed.', 'Анализ не удался.'))
    } finally {
      setLoading(false)
    }
  }, [profile, targets, pantry, budget])

  return (
    <div className="fade-in" style={{ position: 'absolute', inset: 0, zIndex: 20,
      background: 'rgba(8,4,0,0.96)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${NEON}18`,
        display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onClose} style={{ fontFamily: 'var(--font)', fontSize: 13.5,
          color: `${NEON}55`, letterSpacing: '0.1em' }}>← {tr('BACK', 'НАЗАД')}</button>
        <div>
          <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 900,
            color: NEON, letterSpacing: '0.18em', textShadow: `0 0 8px ${NEON}` }}>{tr('PANTRY ANALYSIS', 'АНАЛИЗ КЛАДОВОЙ')}</p>
          <p style={{ fontFamily: 'var(--font)', fontSize: 11, color: `${NEON}45`,
            letterSpacing: '0.08em' }}>{tr('WHAT YOU HAVE · WHAT IS MISSING · WHAT TO BUY', 'ЧТО ЕСТЬ · ЧЕГО НЕТ · ЧТО КУПИТЬ')}</p>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* budget selector */}
        <div>
          <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: `${NEON}50`,
            letterSpacing: '0.12em', marginBottom: 6 }}>{tr('SHOPPING BUDGET', 'БЮДЖЕТ ПОКУПОК')}</p>
          <div style={{ display: 'flex', gap: 6 }}>
            {(Object.keys(BUDGET_META) as Budget[]).map(b => {
              const on = budget === b
              return (
                <button key={b} onClick={() => setBudget(b)} style={{
                  flex: 1, padding: '7px 6px', borderRadius: 6, cursor: 'pointer',
                  fontFamily: 'var(--font)', fontWeight: 700, letterSpacing: '0.06em',
                  color: on ? NEON : 'rgba(148,163,184,0.4)',
                  border: `1px solid ${on ? `${NEON}50` : 'rgba(255,255,255,0.06)'}`,
                  background: on ? NEON_DIM : 'transparent',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <span style={{ fontSize: 'var(--fs-xs)' }}>{budgetLabel(b)}</span>
                  <span style={{ fontSize: 11, opacity: 0.7 }}>{budgetHint(b)}</span>
                </button>
              )
            })}
          </div>
        </div>

        <button disabled={loading} onClick={run} style={{
          padding: '11px', borderRadius: 7, cursor: loading ? 'default' : 'pointer',
          fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', fontWeight: 800, letterSpacing: '0.12em',
          color: NEON, border: `1px solid ${NEON}45`, background: NEON_DIM, opacity: loading ? 0.6 : 1 }}>
          {loading ? tr('◌ ANALYSING…', '◌ АНАЛИЗ…') : analysis ? tr('↻ RE-ANALYSE', '↻ ПЕРЕАНАЛИЗ') : tr('🔬 ANALYSE PANTRY', '🔬 АНАЛИЗ КЛАДОВОЙ')}</button>

        {error && (
          <p style={{ fontFamily: 'var(--font)', fontSize: 10.5, color: '#ff5470', letterSpacing: '0.06em' }}>⚠ {error}</p>
        )}

        {analysis && (
          <>
            <p style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-xs)', color: 'rgba(255,240,220,0.82)',
              lineHeight: 1.6, padding: '10px 12px', borderRadius: 8,
              background: `${NEON}06`, border: `1px solid ${NEON}18` }}>{analysis.summary}</p>

            {/* coverage */}
            {analysis.coverage.length > 0 && (
              <div>
                <p style={{ fontFamily: 'var(--font)', fontSize: 10, fontWeight: 700, color: `${NEON}70`,
                  letterSpacing: '0.12em', marginBottom: 6 }}>{tr('COVERAGE', 'ПОКРЫТИЕ')}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {analysis.coverage.map((c, j) => (
                    <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 9px',
                      borderRadius: 6, background: 'rgba(18,11,2,0.5)', border: `1px solid ${COVER_COLOR[c.status]}28` }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                        background: COVER_COLOR[c.status], boxShadow: `0 0 6px ${COVER_COLOR[c.status]}` }} />
                      <span style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)',
                        color: 'rgba(255,240,220,0.85)', minWidth: 70 }}>{c.nutrient}</span>
                      {c.note && <span style={{ fontFamily: 'var(--font)', fontSize: 10,
                        color: 'rgba(148,163,184,0.55)', flex: 1 }}>{c.note}</span>}
                      <span style={{ fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 800, letterSpacing: '0.08em',
                        color: COVER_COLOR[c.status] }}>{coverLabel(c.status).toUpperCase()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* shopping */}
            {analysis.shopping.length > 0 && (
              <div>
                <p style={{ fontFamily: 'var(--font)', fontSize: 10, fontWeight: 700, color: `${NEON}70`,
                  letterSpacing: '0.12em', marginBottom: 6 }}>{tr('SHOPPING LIST', 'СПИСОК ПОКУПОК')} · {budgetLabel(budget)}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {analysis.shopping.map((s, j) => {
                    const on = added.has(s.item)
                    return (
                      <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                        borderRadius: 7, background: 'rgba(18,11,2,0.55)', border: `1px solid ${NEON}10` }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', fontWeight: 700,
                              color: 'rgba(255,240,220,0.9)' }}>{s.item}</span>
                            <span style={{ fontFamily: 'var(--font)', fontSize: 11, fontWeight: 800, letterSpacing: '0.06em',
                              padding: '1px 5px', borderRadius: 3, color: COST_META[s.cost].color,
                              border: `1px solid ${COST_META[s.cost].color}45` }}>{costLabel(s.cost)}</span>
                          </div>
                          {s.why && <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: 'rgba(148,163,184,0.55)',
                            marginTop: 2 }}>{s.why}</p>}
                        </div>
                        <button disabled={on} onClick={() => { onAddItem(s.item); setAdded(p => new Set(p).add(s.item)) }}
                          title={tr('Add to pantry', 'Добавить в кладовую')} style={{
                          fontFamily: 'var(--font)', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                          padding: '4px 8px', borderRadius: 5, flexShrink: 0, cursor: on ? 'default' : 'pointer',
                          color: on ? '#4ade80' : `${NEON}b0`,
                          border: `1px solid ${on ? '#4ade8040' : `${NEON}30`}`,
                          background: on ? 'rgba(74,222,128,0.08)' : NEON_DIM }}>{on ? tr('✓ IN PANTRY', '✓ В КЛАДОВОЙ') : tr('+ PANTRY', '+ В КЛАДОВУЮ')}</button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
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
        <span style={{ fontSize: 15.5 }}>{SLOT_META[slot].icon}</span>
        <p style={{ fontFamily: 'var(--font)', fontSize: 11, fontWeight: 700,
          color: `${NEON}80`, letterSpacing: '0.14em', flex: 1 }}>{slotLabel(slot)}</p>
        {total > 0 && (
          <span style={{ fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 800, color: NEON }}>
            {total} {tr('kcal', 'ккал')}</span>
        )}
        <button onClick={onAdd} style={{
          width: 22, height: 22, borderRadius: 6, fontSize: 15.5, fontWeight: 700,
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
                <span key={k} style={{ fontFamily: 'var(--font)', fontSize: 11,
                  color: `${MACRO[k].color}90` }}>{macroLabel(k)[0]} {v}g</span>
              ))}
            </div>
          </div>
          <span style={{ fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)', fontWeight: 700,
            color: NEON, flexShrink: 0 }}>{e.calories}</span>
          <button onClick={() => onRemove(e.id)} title={tr('Remove', 'Удалить')} style={{
            fontFamily: 'var(--font)', fontSize: 14.5, color: 'rgba(255,84,112,0.4)', flexShrink: 0,
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
  | { type: 'log' }
  | { type: 'pantry' }
  | { type: 'analyze' }
  | { type: 'favorites' }

/** Sensible default meal slot for the current time of day. */
const slotNow = (): MealSlot => {
  const h = new Date().getHours()
  return h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 21 ? 'dinner' : 'snack'
}

export default function Solaris() {
  const [state, setState]   = useState<SolarisState>(() => loadSolarisState())
  const [screen, setScreen] = useState<Screen>({ type: 'dashboard' })
  const [addSlot, setAddSlot] = useState<MealSlot | null>(null)

  const persist = useCallback((s: SolarisState) => { saveSolarisState(s); setState(s) }, [])
  // Functional variant — safe when called repeatedly in a loop (e.g. "add all"),
  // where each update must build on the previous one, not a stale snapshot.
  const persistWith = useCallback((fn: (s: SolarisState) => SolarisState) => {
    setState(prev => { const next = fn(prev); saveSolarisState(next); return next })
  }, [])

  const today  = todayKey()
  const member = activeMember(state)

  const day     = useMemo(() => member ? getDay(state, member.id, today) : { date: today, entries: [] }, [state, member, today])
  const totals  = useMemo(() => sumDay(day), [day])
  const targets = member ? computeTargets(member.profile) : null
  const streak  = member ? getStreak(state, member.id) : 0
  const drinks  = useMemo(() => member ? getDrinks(state, member.id, today) : [], [state, member, today])
  const waterTarget = member ? recommendedWaterMl(member.profile) : 0

  // FIRMWARE — the kitchen opens one surface at a time, by use. v0 hydrates,
  // and hydrating is the whole job at v0; nothing you need today is locked.
  const usage = useMemo(() => solarisUsage(state), [state])
  const tier  = solarisTier(usage)
  const next  = solarisNext(usage)

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

  // ── "What should I eat?" (pantry-aware dish ideas) ──
  if (screen.type === 'delivery' && targets) {
    return (
      <DeliveryPanel
        profile={member.profile}
        targets={targets}
        consumed={totals}
        pantry={state.pantry}
        kitchen={state.kitchen}
        favoriteNames={new Set(state.favorites.map(f => f.name.toLowerCase()))}
        onAccept={m => persistWith(s => addEntry(s, member.id, today, m))}
        onToggleFavorite={m => {
          const existing = state.favorites.find(f => f.name.toLowerCase() === m.name.toLowerCase())
          persist(existing ? removeFavorite(state, existing.id) : saveFavorite(state, m))
        }}
        onOpenFavorites={() => setScreen({ type: 'favorites' })}
        onClose={() => setScreen({ type: 'dashboard' })}
      />
    )
  }

  // ── Saved / favourite dishes ──
  if (screen.type === 'favorites') {
    return (
      <FavoritesScreen
        favorites={state.favorites}
        onLog={d => persistWith(s => addEntry(s, member.id, today, d))}
        onRemove={id => persist(removeFavorite(state, id))}
        onClose={() => setScreen({ type: 'delivery' })}
      />
    )
  }

  // ── AI meal logging (describe / snap) ──
  if (screen.type === 'log') {
    const loggedSlots = [...new Set(day.entries.map(e => e.slot))]
    // Slot follows meal ORDER, not the clock: your first meal of the day is breakfast.
    const defaultSlot: MealSlot = day.entries.length === 0 ? 'breakfast' : slotNow()
    return (
      <MealLogPanel
        defaultSlot={defaultSlot}
        loggedSlots={loggedSlots}
        onAccept={m => persistWith(s => addEntry(s, member.id, today, m))}
        onClose={() => setScreen({ type: 'dashboard' })}
      />
    )
  }

  // ── Shared pantry ──
  if (screen.type === 'pantry') {
    return (
      <PantryScreen
        pantry={state.pantry}
        kitchen={state.kitchen}
        onAdd={(name, qty) => persist(addPantryItem(state, name, qty))}
        onAddMany={items => persist(addPantryItems(state, items))}
        onRemove={id => persist(removePantryItem(state, id))}
        onToggleEquip={item => persist(toggleEquipment(state, item))}
        onSetPrefs={prefs => persist(setKitchen(state, { prefs }))}
        onCook={() => setScreen({ type: 'delivery' })}
        onAnalyze={() => setScreen({ type: 'analyze' })}
        onClose={() => setScreen({ type: 'dashboard' })}
      />
    )
  }

  // ── Pantry analyzer ──
  if (screen.type === 'analyze' && targets) {
    return (
      <PantryAnalyzer
        profile={member.profile}
        targets={targets}
        pantry={state.pantry}
        onAddItem={name => persist(addPantryItem(state, name, ''))}
        onClose={() => setScreen({ type: 'pantry' })}
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
          <p style={{ fontFamily: 'var(--font)', fontSize: 13.5, fontWeight: 900,
            color: NEON, letterSpacing: '0.22em', textShadow: `0 0 12px ${NEON}` }}>SOLARIS</p>
          <p style={{ fontFamily: 'var(--font)', fontSize: 11, color: `${NEON}45`, letterSpacing: '0.12em' }}>
            {tr('THE SOLAR SYSTEM\'S KITCHEN', 'КУХНЯ СОЛНЕЧНОЙ СИСТЕМЫ')}
          </p>
        </div>
        {streak > 0 && (
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontFamily: 'var(--font)', fontSize: 15.5, fontWeight: 900,
              color: SOLAR, lineHeight: 1 }}>{streak}🔥</p>
            <p style={{ fontFamily: 'var(--font)', fontSize: 11, color: `${SOLAR}70`,
              letterSpacing: '0.1em' }}>{tr('DAY STREAK', 'ДНЕЙ ПОДРЯД')}</p>
          </div>
        )}
        {solarisHas(tier, 'kitchen') && <button onClick={() => setScreen({ type: 'pantry' })} title={tr('Shared pantry', 'Общая кладовая')} style={{
          width: 28, height: 28, borderRadius: 7, fontSize: 15.5,
          color: `${NEON}70`, border: `1px solid ${NEON}25`, background: 'transparent', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.color = NEON; e.currentTarget.style.background = NEON_DIM }}
          onMouseLeave={e => { e.currentTarget.style.color = `${NEON}70`; e.currentTarget.style.background = 'transparent' }}
        >🧺</button>}
        <button onClick={() => setScreen({ type: 'edit', memberId: member.id })} title={`${tr('Edit', 'Изменить')} ${member.name}`} style={{
          width: 28, height: 28, borderRadius: 7, fontSize: 15.5,
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
        {/* Ration overview — calories at v1, macros at v2 */}
        {targets && solarisHas(tier, 'calories') && (
          <div style={{ padding: '14px', display: 'flex', gap: 16, alignItems: 'center' }}>
            <OrbitRing consumed={totals.calories} target={targets.calories} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ alignSelf: 'flex-start' }}><BmiChip profile={member.profile} /></div>
              {solarisHas(tier, 'macros') && (<>
                <MacroBar kind="protein" consumed={totals.protein} target={targets.protein} />
                <MacroBar kind="carbs"   consumed={totals.carbs}   target={targets.carbs} />
                <MacroBar kind="fat"     consumed={totals.fat}     target={targets.fat} />
              </>)}
            </div>
          </div>
        )}

        {/* At v0 the crew card still shows who this is calibrated for */}
        {targets && !solarisHas(tier, 'calories') && (
          <div style={{ padding: '12px 14px 0' }}>
            <BmiChip profile={member.profile} />
          </div>
        )}

        {/* Hydration */}
        <WaterMeter drinks={drinks} targetMl={waterTarget}
          onAdd={(kind, ml) => persist(addDrink(state, member.id, today, kind, ml))}
          onRemove={id => persist(removeDrink(state, member.id, today, id))} />

        {/* Log a meal (AI) — v1 */}
        {solarisHas(tier, 'calories') && <button onClick={() => setScreen({ type: 'log' })} style={{
          margin: '0 14px 8px', width: 'calc(100% - 28px)', padding: '11px 14px', borderRadius: 9, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 10,
          background: `linear-gradient(90deg, ${NEON}12, ${SOLAR}0c)`,
          border: `1px solid ${NEON}35`, transition: 'all 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.borderColor = `${NEON}60`}
          onMouseLeave={e => e.currentTarget.style.borderColor = `${NEON}35`}
        >
          <span style={{ fontSize: 20, filter: `drop-shadow(0 0 8px ${NEON})` }}>✎</span>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 800,
              color: NEON, letterSpacing: '0.14em' }}>{tr('LOG A MEAL', 'ЗАПИСАТЬ ПРИЁМ ПИЩИ')}</p>
            <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: `${NEON}55`,
              letterSpacing: '0.04em', marginTop: 1 }}>
              {tr('Describe it or snap a photo — SOLARIS does the math', 'Опишите или сфоткайте — SOLARIS посчитает')}
            </p>
          </div>
          <span style={{ fontSize: 15.5 }}>📷</span>
        </button>}

        {/* What should I eat? (pantry-aware dishes) — v3 */}
        {solarisHas(tier, 'kitchen') && <button onClick={() => setScreen({ type: 'delivery' })} style={{
          margin: '0 14px 8px', width: 'calc(100% - 28px)', padding: '11px 14px', borderRadius: 9, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 10,
          background: `linear-gradient(90deg, ${SOLAR}14, ${NEON}10)`,
          border: `1px solid ${NEON}30`, transition: 'all 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.borderColor = `${NEON}55`}
          onMouseLeave={e => e.currentTarget.style.borderColor = `${NEON}30`}
        >
          <span style={{ fontSize: 20, filter: `drop-shadow(0 0 8px ${NEON})` }}>🍳</span>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 800,
              color: NEON, letterSpacing: '0.14em' }}>{tr('WHAT SHOULD I EAT?', 'ЧТО МНЕ ПОЕСТЬ?')}</p>
            <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: `${NEON}55`,
              letterSpacing: '0.04em', marginTop: 1 }}>
              {state.pantry.length
                ? `${tr('Dishes from your pantry for', 'Блюда из кладовой под бюджет')} ${member.name}`
                : `${tr('Meal ideas for', 'Идеи блюд под остаток бюджета')} ${member.name}`}
            </p>
          </div>
          <span style={{ fontFamily: 'var(--font)', fontSize: 13.5, color: `${NEON}60` }}>→</span>
        </button>}

        {/* Meals manifest — v1 */}
        {solarisHas(tier, 'calories') && (
          <div style={{ padding: '4px 0 16px' }}>
            {SLOT_ORDER.map(slot => (
              <SlotGroup key={slot} slot={slot}
                entries={day.entries.filter(e => e.slot === slot)}
                onAdd={() => setAddSlot(slot)}
                onRemove={id => persist(removeEntry(state, member.id, today, id))}
              />
            ))}
          </div>
        )}

        {/* What this instrument opens next — stated, never nagged */}
        {next && (
          <div style={{ margin: '4px 14px 18px', padding: '10px 12px', borderRadius: 9,
            background: `${NEON}07`, border: `1px solid ${NEON}20` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font)', fontSize: 11, fontWeight: 800,
                letterSpacing: '0.18em', color: `${NEON}90` }}>FIRMWARE v{tier}</span>
              <span style={{ fontFamily: 'var(--font)', fontSize: 11.5, color: 'rgba(148,163,184,0.5)',
                marginLeft: 'auto' }}>{next.have}/{next.need}</span>
            </div>
            <p style={{ fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 700, marginTop: 6,
              color: 'rgba(255,240,220,0.9)' }}>
              v{next.tier} · {tr(next.opens, next.opensRu)}
            </p>
            <p style={{ fontFamily: 'var(--font)', fontSize: 10, color: 'rgba(148,163,184,0.55)',
              marginTop: 3 }}>{tr(next.needs, next.needsRu)}</p>
            <div style={{ height: 3, borderRadius: 2, marginTop: 7, overflow: 'hidden',
              background: 'rgba(255,255,255,0.06)' }}>
              <div style={{ height: '100%', width: `${Math.round((next.have / next.need) * 100)}%`,
                borderRadius: 2, background: NEON, boxShadow: `0 0 6px ${NEON}80`,
                transition: 'width 0.5s ease' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
