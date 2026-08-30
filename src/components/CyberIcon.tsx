/**
 * Sidebar icons — 24×24 SVGs, bold shapes with one accent.
 *
 * These were animal mascots from the guild era: a beaver for the goal module, a
 * raccoon for tasks, a panda for the kitchen. The names moved on (PATHFINDER,
 * ORBIT) and a mascot tells you nothing about what a screen does, so each icon
 * now draws the module's actual job — a compass and a route, a body on a ring,
 * a solar disc opening as a drop, a page mid-sentence, a card that comes back,
 * a frame with something playing in it.
 *
 * `guild.ts` still carries an `animal` for each member. That's flavour text used
 * in descriptions, not a promise about the icon.
 */

interface IconProps {
  size?: number
  color?: string
  glow?: boolean
}

function Svg({ size = 24, color = 'currentColor', glow, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ filter: glow ? `drop-shadow(0 0 4px ${color})` : undefined, flexShrink: 0 }}
    >
      {children}
    </svg>
  )
}

/* ── ORBIT: a body on a ring, and where it will be ── */
export function IconScrap7(p: IconProps) {
  const c = p.color ?? 'currentColor'
  return (
    <Svg {...p}>
      {/* The orbit itself, tilted */}
      <ellipse cx="12" cy="12" rx="10" ry="5.2" fill="none" stroke={c}
        strokeWidth="1.3" opacity="0.75" transform="rotate(-24 12 12)"/>
      {/* What it goes round */}
      <circle cx="12" cy="12" r="3.2" fill={c} opacity="0.9"/>
      {/* Now */}
      <circle cx="20.1" cy="8.4" r="2" fill={c}/>
      {/* And where it comes back to */}
      <circle cx="3.9" cy="15.6" r="1.2" fill={c} opacity="0.45"/>
    </Svg>
  )
}

/* ── MYSTIC RAVI: Raven — angular wings + glowing eye ── */
export function IconRavi(p: IconProps) {
  const c = p.color ?? 'currentColor'
  return (
    <Svg {...p}>
      {/* Body */}
      <ellipse cx="12" cy="13" rx="4" ry="5" fill={c} opacity="0.85"/>
      {/* Left wing */}
      <path d="M8 13L2 8l4 7" fill={c} opacity="0.7"/>
      {/* Right wing */}
      <path d="M16 13l6-5-4 7" fill={c} opacity="0.7"/>
      {/* Head */}
      <circle cx="12" cy="7" r="3" fill={c}/>
      {/* Beak */}
      <path d="M12 7.5l2 2h-4z" fill="#000" opacity="0.5"/>
      {/* Glowing eye */}
      <circle cx="13" cy="6.5" r="1" fill="#000"/>
      <circle cx="13" cy="6.5" r="0.5" fill={c} opacity="0.9"/>
      {/* Crown feathers */}
      <path d="M10 5l1.5-3M12 4.5l0-3M14 5l-1.5-3" stroke={c} strokeWidth="0.8" strokeLinecap="round" opacity="0.6"/>
    </Svg>
  )
}

/* ── PATHFINDER: a compass rose over a plotted route ── */
export function IconLog(p: IconProps) {
  const c = p.color ?? 'currentColor'
  return (
    <Svg {...p}>
      {/* The route: three waypoints, the last one reached */}
      <circle cx="4"  cy="19" r="1.4" fill={c} opacity="0.55"/>
      <circle cx="10" cy="15" r="1.4" fill={c} opacity="0.7"/>
      <circle cx="19" cy="5"  r="2"   fill={c}/>
      <path d="M4 19 L10 15" stroke={c} strokeWidth="1.1" opacity="0.5" strokeLinecap="round"/>
      <path d="M10 15 L19 5" stroke={c} strokeWidth="1.3" strokeLinecap="round"
        strokeDasharray="2.6 2" opacity="0.85"/>
      {/* Compass rose — the needle pointing along the route */}
      <circle cx="9.5" cy="9.5" r="5.6" fill="none" stroke={c} strokeWidth="1.1" opacity="0.75"/>
      <circle cx="9.5" cy="9.5" r="0.9" fill={c}/>
      <path d="M9.5 4.6 L11.1 9 L9.5 14.4 L7.9 9 Z" fill={c} opacity="0.9"/>
      <line x1="3.9" y1="9.5" x2="5.4" y2="9.5" stroke={c} strokeWidth="1" opacity="0.6"/>
      <line x1="13.6" y1="9.5" x2="15.1" y2="9.5" stroke={c} strokeWidth="1" opacity="0.6"/>
    </Svg>
  )
}

/* ── A.R.D.O: a card that comes back round ── */
export function IconArdo(p: IconProps) {
  const c = p.color ?? 'currentColor'
  return (
    <Svg {...p}>
      {/* The stack behind — lines already learned */}
      <rect x="7.4" y="3.2" width="12.4" height="8.4" rx="1.6" fill="none"
        stroke={c} strokeWidth="1" opacity="0.3"/>
      <rect x="5.7" y="5" width="12.4" height="8.4" rx="1.6" fill="none"
        stroke={c} strokeWidth="1.1" opacity="0.55"/>
      {/* The one due now */}
      <rect x="4" y="6.8" width="12.4" height="8.4" rx="1.6" fill={c} opacity="0.15"/>
      <rect x="4" y="6.8" width="12.4" height="8.4" rx="1.6" fill="none"
        stroke={c} strokeWidth="1.35"/>
      <line x1="6.6" y1="10" x2="13.8" y2="10" stroke={c} strokeWidth="1.1" strokeLinecap="round" opacity="0.85"/>
      <line x1="6.6" y1="12.4" x2="11.4" y2="12.4" stroke={c} strokeWidth="1.1" strokeLinecap="round" opacity="0.6"/>
      {/* Spaced repetition: it returns */}
      <path d="M8 19.4 A5.4 5.4 0 0 0 18.4 17.8" fill="none" stroke={c}
        strokeWidth="1.35" strokeLinecap="round"/>
      <path d="M6.4 17.2 L8.2 19.6 L5.5 20.4 Z" fill={c}/>
    </Svg>
  )
}

/* ── JOURNAL: a page being written, cursor still blinking ── */
export function IconHoot(p: IconProps) {
  const c = p.color ?? 'currentColor'
  return (
    <Svg {...p}>
      {/* The page, one corner turned */}
      <path d="M5 2.6 h9.2 L19 7.4 V21.4 H5 Z" fill="none" stroke={c} strokeWidth="1.3"
        strokeLinejoin="round" opacity="0.85"/>
      <path d="M14.2 2.6 V7.4 H19" fill="none" stroke={c} strokeWidth="1.1"
        strokeLinejoin="round" opacity="0.55"/>
      {/* What's already written */}
      <g stroke={c} strokeLinecap="round" opacity="0.7">
        <line x1="7.6" y1="11.2" x2="16.2" y2="11.2" strokeWidth="1.1"/>
        <line x1="7.6" y1="14.2" x2="16.2" y2="14.2" strokeWidth="1.1"/>
        <line x1="7.6" y1="17.2" x2="12.4" y2="17.2" strokeWidth="1.1"/>
      </g>
      {/* Still going */}
      <rect x="13.5" y="16.1" width="1.5" height="2.4" fill={c}/>
    </Svg>
  )
}

/* ── SWIFT OTTY: Otter — sleek body + wave sensor ── */
export function IconOtty(p: IconProps) {
  const c = p.color ?? 'currentColor'
  return (
    <Svg {...p}>
      {/* Streamlined body */}
      <ellipse cx="12" cy="14" rx="6" ry="7" fill={c} opacity="0.8"/>
      {/* Head */}
      <circle cx="12" cy="7" r="4.5" fill={c} opacity="0.9"/>
      {/* Whiskers */}
      <path d="M8 8l-4-1M8 9l-4.5 0.5M16 8l4-1M16 9l4.5 0.5" stroke={c} strokeWidth="0.7" strokeLinecap="round" opacity="0.6"/>
      {/* Eyes */}
      <circle cx="10.5" cy="6.5" r="1" fill="#000" opacity="0.7"/>
      <circle cx="13.5" cy="6.5" r="1" fill="#000" opacity="0.7"/>
      <circle cx="10.5" cy="6.5" r="0.4" fill={c}/>
      <circle cx="13.5" cy="6.5" r="0.4" fill={c}/>
      {/* Nose */}
      <ellipse cx="12" cy="8.5" rx="1" ry="0.6" fill="#000" opacity="0.6"/>
      {/* Sensor arc on head */}
      <path d="M9 4C9 4 10 2 12 2s3 2 3 2" stroke={c} strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.5"/>
      <circle cx="12" cy="2" r="0.7" fill={c} opacity="0.6"/>
    </Svg>
  )
}

/* ── SOLARIS: a solar disc, and the drop that opens it ── */
export function IconPomu(p: IconProps) {
  const c = p.color ?? 'currentColor'
  return (
    <Svg {...p}>
      {/* Rays — four cardinal, four short diagonals */}
      <g stroke={c} strokeWidth="1.2" strokeLinecap="round" opacity="0.8">
        <line x1="12" y1="1.6" x2="12" y2="3.9"/>
        <line x1="12" y1="20.1" x2="12" y2="22.4"/>
        <line x1="1.6" y1="12" x2="3.9" y2="12"/>
        <line x1="20.1" y1="12" x2="22.4" y2="12"/>
      </g>
      <g stroke={c} strokeWidth="1" strokeLinecap="round" opacity="0.45">
        <line x1="4.9" y1="4.9" x2="6.4" y2="6.4"/>
        <line x1="17.6" y1="17.6" x2="19.1" y2="19.1"/>
        <line x1="19.1" y1="4.9" x2="17.6" y2="6.4"/>
        <line x1="6.4" y1="17.6" x2="4.9" y2="19.1"/>
      </g>
      {/* The disc */}
      <circle cx="12" cy="12" r="7" fill="none" stroke={c} strokeWidth="1.3" opacity="0.85"/>
      {/* Hydration is tier 0 — the kitchen opens as a drop */}
      <path d="M12 7.6 C14.6 10.6 15.6 12.1 15.6 13.6 A3.6 3.6 0 0 1 8.4 13.6 C8.4 12.1 9.4 10.6 12 7.6 Z"
        fill={c} opacity="0.9"/>
    </Svg>
  )
}

/* ── SUNNY KANA: Canary — antenna + signal rings ── */
export function IconKana(p: IconProps) {
  const c = p.color ?? 'currentColor'
  return (
    <Svg {...p}>
      {/* Body */}
      <ellipse cx="12" cy="15" rx="5" ry="6" fill={c} opacity="0.8"/>
      {/* Head */}
      <circle cx="12" cy="8" r="4" fill={c}/>
      {/* Beak */}
      <path d="M15 8.5l3 0.5-3 1z" fill="#000" opacity="0.5"/>
      {/* Eye */}
      <circle cx="13" cy="7.5" r="1.2" fill="#000" opacity="0.7"/>
      <circle cx="13" cy="7.5" r="0.5" fill={c}/>
      {/* Antenna */}
      <line x1="12" y1="4" x2="12" y2="1" stroke={c} strokeWidth="1.2" strokeLinecap="round"/>
      <circle cx="12" cy="1" r="0.8" fill={c}/>
      {/* Signal rings */}
      <path d="M9 3.5C9 3.5 10 1.5 12 1.5s3 2 3 2" stroke={c} strokeWidth="0.8" fill="none" strokeLinecap="round" opacity="0.5"/>
      <path d="M7 4.5C7 4.5 9 1 12 1s5 3.5 5 3.5" stroke={c} strokeWidth="0.6" fill="none" strokeLinecap="round" opacity="0.3"/>
      {/* Wing */}
      <path d="M7 15c-3-1-4-4-2-6" stroke={c} strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.5"/>
    </Svg>
  )
}

/* ── CLEVER MAGGI: Magpie — data stream tail ── */
export function IconMaggi(p: IconProps) {
  const c = p.color ?? 'currentColor'
  return (
    <Svg {...p}>
      {/* Body */}
      <ellipse cx="11" cy="13" rx="5" ry="5.5" fill={c} opacity="0.8"/>
      {/* Head */}
      <circle cx="11" cy="7" r="3.5" fill={c}/>
      {/* Beak */}
      <path d="M13.5 7l3-0.5-3 1.5z" fill="#000" opacity="0.5"/>
      {/* Eye */}
      <circle cx="12" cy="6.5" r="1.2" fill="#000" opacity="0.7"/>
      <circle cx="12" cy="6.5" r="0.5" fill={c}/>
      {/* Long tail — data stream */}
      <path d="M14 16l6 5" stroke={c} strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M13 17l5 5" stroke={c} strokeWidth="1.2" strokeLinecap="round" opacity="0.4"/>
      {/* Data bits on tail */}
      <rect x="16" y="18" width="1.5" height="1" rx="0.3" fill={c} opacity="0.6"/>
      <rect x="17.5" y="19.5" width="1" height="1" rx="0.3" fill={c} opacity="0.4"/>
      {/* Wing accent */}
      <path d="M7 13c-3-2-3-6 0-7" stroke={c} strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.4"/>
    </Svg>
  )
}

/* ── FANCY PAVI: Peacock — holographic fan tail ── */
export function IconPavi(p: IconProps) {
  const c = p.color ?? 'currentColor'
  return (
    <Svg {...p}>
      {/* Fan tail rays */}
      {[0, 30, 60, -30, -60].map((angle, i) => (
        <line key={i}
          x1="12" y1="14"
          x2={12 + 9 * Math.sin(angle * Math.PI / 180)}
          y2={14 - 9 * Math.cos(angle * Math.PI / 180)}
          stroke={c} strokeWidth="1" strokeLinecap="round"
          opacity={i === 0 ? 0.9 : 0.5}
        />
      ))}
      {/* Eye dots on feathers */}
      {[0, 30, 60, -30, -60].map((angle, i) => (
        <circle key={i}
          cx={12 + 8 * Math.sin(angle * Math.PI / 180)}
          cy={14 - 8 * Math.cos(angle * Math.PI / 180)}
          r="1.2" stroke={c} strokeWidth="0.8" fill="none" opacity={0.6}
        />
      ))}
      {/* Body */}
      <ellipse cx="12" cy="17" rx="3" ry="4" fill={c} opacity="0.8"/>
      {/* Head */}
      <circle cx="12" cy="11" r="2.8" fill={c}/>
      {/* Crown */}
      <path d="M11 8.5l1-2 1 2" stroke={c} strokeWidth="0.8" strokeLinecap="round" fill="none"/>
      <circle cx="12" cy="6.5" r="0.7" fill={c}/>
      {/* Eye */}
      <circle cx="13" cy="11" r="1" fill="#000" opacity="0.6"/>
      <circle cx="13" cy="11" r="0.4" fill={c}/>
    </Svg>
  )
}

/* ── SLY FERRI: Ferret — sleek body + stealth visor ── */
export function IconFerri(p: IconProps) {
  const c = p.color ?? 'currentColor'
  return (
    <Svg {...p}>
      {/* Long sleek body */}
      <path d="M4 20c0-4 2-10 4-12l8-5 4 3-5 2c2 2 4 6 4 12" fill={c} opacity="0.7"/>
      {/* Head */}
      <ellipse cx="14" cy="6" rx="4" ry="3" fill={c} opacity="0.9"/>
      {/* Stealth visor */}
      <rect x="11" y="4.5" width="7" height="2.5" rx="1.25" fill="#000" opacity="0.7"/>
      <rect x="11" y="4.5" width="7" height="2.5" rx="1.25" stroke={c} strokeWidth="0.6" fill="none"/>
      {/* Visor glow line */}
      <line x1="11.5" y1="5.75" x2="17.5" y2="5.75" stroke={c} strokeWidth="0.5" opacity="0.6"/>
      {/* Snout */}
      <ellipse cx="17.5" cy="7.5" rx="1.5" ry="1" fill={c} opacity="0.7"/>
      <circle cx="18" cy="7.5" r="0.4" fill="#000" opacity="0.5"/>
      {/* Legs */}
      <path d="M6 18v3M9 20v2M14 20v2M17 18v3" stroke={c} strokeWidth="1.2" strokeLinecap="round" opacity="0.6"/>
    </Svg>
  )
}

/* ── HUB icon — Warren W in hex frame ── */
export function IconHub(p: IconProps) {
  const c = p.color ?? 'currentColor'
  return (
    <Svg {...p}>
      {/* Hexagon */}
      <path d="M12 2l8 4.5v9L12 20l-8-4.5v-9z" stroke={c} strokeWidth="1.5" fill="none" opacity="0.7"/>
      {/* W */}
      <path d="M7 8l2.5 8L12 12l2.5 4L17 8" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </Svg>
  )
}

/* ── SET icon — gear with circuit nodes ── */
export function IconSet(p: IconProps) {
  const c = p.color ?? 'currentColor'
  return (
    <Svg {...p}>
      {/* Gear teeth */}
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
        stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      {/* Outer ring */}
      <circle cx="12" cy="12" r="7" stroke={c} strokeWidth="1.2" fill="none" opacity="0.6"/>
      {/* Inner ring */}
      <circle cx="12" cy="12" r="3.5" stroke={c} strokeWidth="1.5" fill="none"/>
      {/* Center dot */}
      <circle cx="12" cy="12" r="1.5" fill={c}/>
      {/* Circuit node accents */}
      <circle cx="12" cy="5" r="0.8" fill={c}/>
      <circle cx="19" cy="12" r="0.8" fill={c}/>
    </Svg>
  )
}

/* ── PWR icon — power symbol with energy ring ── */
export function IconPwr(p: IconProps) {
  const c = p.color ?? 'currentColor'
  return (
    <Svg {...p}>
      {/* Outer energy ring — broken arc */}
      <path d="M6.34 6.34A8 8 0 1 0 17.66 6.34" stroke={c} strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      {/* Inner ring */}
      <path d="M8.46 8.46A5 5 0 1 0 15.54 8.46" stroke={c} strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.5"/>
      {/* Power stem */}
      <line x1="12" y1="3" x2="12" y2="13" stroke={c} strokeWidth="2" strokeLinecap="round"/>
      {/* Lightning bolt */}
      <path d="M12 13l-2 4h3l-1 4 5-7h-3l1-4z" fill={c} opacity="0.7"/>
    </Svg>
  )
}

/* ── GALACTIC PICTURES: a frame with something playing in it ── */
export function IconFoxy(p: IconProps) {
  const c = p.color ?? 'currentColor'
  return (
    <Svg {...p}>
      {/* The frame */}
      <rect x="2.4" y="5" width="19.2" height="14" rx="2.2" fill="none"
        stroke={c} strokeWidth="1.35" opacity="0.9"/>
      {/* Sprocket holes, film-strip style */}
      <g fill={c} opacity="0.4">
        <rect x="4.2" y="7.1" width="1.6" height="1.6" rx="0.4"/>
        <rect x="4.2" y="11.2" width="1.6" height="1.6" rx="0.4"/>
        <rect x="4.2" y="15.3" width="1.6" height="1.6" rx="0.4"/>
        <rect x="18.2" y="7.1" width="1.6" height="1.6" rx="0.4"/>
        <rect x="18.2" y="11.2" width="1.6" height="1.6" rx="0.4"/>
        <rect x="18.2" y="15.3" width="1.6" height="1.6" rx="0.4"/>
      </g>
      {/* Playing */}
      <path d="M10.4 8.9 L16.2 12 L10.4 15.1 Z" fill={c}/>
      {/* Galactic: one star outside the frame */}
      <path d="M20.6 2.2 L21.2 3.7 L22.7 4.3 L21.2 4.9 L20.6 6.4 L20 4.9 L18.5 4.3 L20 3.7 Z"
        fill={c} opacity="0.75"/>
    </Svg>
  )
}

/* ── Uplink: rising signal bars into a transmit arc ── */
function IconUplink({ size, color = 'currentColor', glow }: IconProps) {
  const c = color
  return (
    <Svg size={size} color={c} glow={glow}>
      {/* Bandwidth bars */}
      <rect x="3"  y="14" width="3" height="7"  rx="1" fill={c} opacity="0.45"/>
      <rect x="8"  y="10" width="3" height="11" rx="1" fill={c} opacity="0.7"/>
      <rect x="13" y="6"  width="3" height="15" rx="1" fill={c}/>
      {/* Transmit arc */}
      <path d="M18 8a5 5 0 0 1 3 4" stroke={c} strokeWidth="1.6" strokeLinecap="round" opacity="0.8"/>
      <circle cx="18" cy="4.5" r="1.6" fill={c}/>
    </Svg>
  )
}

/**
 * VIGILANTE — a line held between two anchors, with the load pressing on it.
 *
 * Not an hourglass and not a bat. The job is time under tension: something held
 * straight against something pushing down, for as long as you can keep it. The
 * anchors are why it is a HOLD rather than a rep — nothing here moves.
 */
export function IconVigil(p: IconProps) {
  const c = p.color ?? 'currentColor'
  return (
    <Svg {...p}>
      {/* Anchored at both ends — a hold goes nowhere */}
      <rect x="1.5" y="8.6" width="2.8" height="6.8" rx="1" fill={c} opacity="0.9"/>
      <rect x="19.7" y="8.6" width="2.8" height="6.8" rx="1" fill={c} opacity="0.9"/>
      {/* The line you keep straight */}
      <line x1="4.3" y1="12" x2="19.7" y2="12" stroke={c} strokeWidth="1.7" strokeLinecap="round"/>
      {/* What is pressing on it */}
      <path d="M12 3.6v4.4m0 0-2.1-2.1M12 8l2.1-2.1" fill="none" stroke={c}
        strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.85"/>
      {/* The seconds it is counting */}
      <circle cx="12" cy="17.8" r="1.5" fill={c} opacity="0.5"/>
    </Svg>
  )
}

/* ── Map: moduleId → icon component ── */
import type { ModuleId } from '../guild'

export function CyberIcon({ id, size, color, glow }: { id: ModuleId | 'hub' | 'set' | 'pwr' | 'uplink' } & IconProps) {
  const props = { size, color, glow }
  switch (id) {
    case 'scrap7': return <IconScrap7 {...props} />
    case 'ravi':   return <IconRavi   {...props} />
    case 'log':    return <IconLog    {...props} />
    case 'ardo':   return <IconArdo   {...props} />
    case 'hoot':   return <IconHoot   {...props} />
    case 'otty':   return <IconOtty   {...props} />
    case 'pomu':   return <IconPomu   {...props} />
    case 'nimbus': return <IconKana   {...props} />
    case 'maggi':  return <IconMaggi  {...props} />
    case 'pavi':   return <IconPavi   {...props} />
    case 'ferri':  return <IconFerri  {...props} />
    case 'foxy':   return <IconFoxy   {...props} />
    case 'vigil':  return <IconVigil  {...props} />
    case 'hub':    return <IconHub    {...props} />
    case 'set':    return <IconSet    {...props} />
    case 'pwr':    return <IconPwr    {...props} />
    case 'uplink': return <IconUplink {...props} />
    default:       return <IconHub    {...props} />
  }
}
