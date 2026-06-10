/**
 * Cyberpunk animal icons + system icons for the Warren sidebar.
 * Each icon is a 24×24 SVG — bold silhouettes with one cyber accent.
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

/* ── SCRAP-7: Raccoon — face mask + cyber eye implant ── */
export function IconScrap7(p: IconProps) {
  const c = p.color ?? 'currentColor'
  return (
    <Svg {...p}>
      {/* Head */}
      <path d="M12 3C7.58 3 4 6.58 4 11c0 2.8 1.38 5.27 3.5 6.8V21h1.5v-2h6V21h1.5v-3.2C18.62 16.27 20 13.8 20 11c0-4.42-3.58-8-8-8z" fill={c} opacity="0.9"/>
      {/* Ears */}
      <path d="M7 3.5L5 1l2.5 2.5M17 3.5L19 1l-2.5 2.5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      {/* Eye mask */}
      <ellipse cx="9" cy="11" rx="2" ry="1.5" fill="#000" opacity="0.7"/>
      <ellipse cx="15" cy="11" rx="2" ry="1.5" fill="#000" opacity="0.7"/>
      {/* Normal left eye */}
      <circle cx="9" cy="11" r="0.8" fill={c}/>
      {/* Cyber right eye — implant ring */}
      <circle cx="15" cy="11" r="1.2" stroke={c} strokeWidth="1" fill="none"/>
      <circle cx="15" cy="11" r="0.4" fill={c}/>
      <line x1="16.2" y1="11" x2="18" y2="11" stroke={c} strokeWidth="0.8"/>
      {/* Snout stripe */}
      <path d="M10 13.5h4" stroke={c} strokeWidth="0.8" strokeLinecap="round" opacity="0.5"/>
      {/* Tail ring hint */}
      <path d="M6 19c-1 0-2-.5-2-1.5" stroke={c} strokeWidth="1" strokeLinecap="round" opacity="0.4"/>
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

/* ── L.O.G: Beaver scientist — orbital monocle + constellation graph ── */
export function IconLog(p: IconProps) {
  const c = p.color ?? 'currentColor'
  return (
    <Svg {...p}>
      {/* Constellation graph (3 dots connected above head) */}
      <circle cx="8.5" cy="3.5" r="1" fill={c}/>
      <circle cx="12"  cy="2"   r="1" fill={c}/>
      <circle cx="15.5"cy="3.5" r="1" fill={c}/>
      <line x1="8.5" y1="3.5" x2="12"   y2="2"   stroke={c} strokeWidth="0.65" opacity="0.55"/>
      <line x1="12"  y1="2"   x2="15.5" y2="3.5" stroke={c} strokeWidth="0.65" opacity="0.55"/>
      <line x1="8.5" y1="3.5" x2="15.5" y2="3.5" stroke={c} strokeWidth="0.5"  opacity="0.35"/>
      {/* Small ears */}
      <circle cx="7.5"  cy="7.5" r="2"   fill={c} opacity="0.75"/>
      <circle cx="16.5" cy="7.5" r="2"   fill={c} opacity="0.75"/>
      {/* Head */}
      <circle cx="12" cy="13" r="6.5" fill={c} opacity="0.85"/>
      {/* Left eye — normal */}
      <circle cx="9.5" cy="12" r="1.1" fill="#000" opacity="0.7"/>
      <circle cx="9.5" cy="12" r="0.45" fill={c}/>
      {/* Right eye — orbital monocle */}
      <circle cx="14.5" cy="12" r="2.3" stroke={c} strokeWidth="0.9" fill="#000" opacity="0.65"/>
      <circle cx="14.5" cy="12" r="1.2" stroke={c} strokeWidth="0.55" fill="none" opacity="0.5"/>
      <circle cx="14.5" cy="12" r="0.45" fill={c}/>
      <line x1="12.2" y1="12" x2="16.8" y2="12" stroke={c} strokeWidth="0.4" opacity="0.45"/>
      <line x1="14.5" y1="9.7" x2="14.5" y2="14.3" stroke={c} strokeWidth="0.4" opacity="0.45"/>
      {/* Monocle chain */}
      <path d="M16.8 10.8 Q18 10 19 11" stroke={c} strokeWidth="0.6" fill="none" strokeLinecap="round" opacity="0.4"/>
      {/* Buckteeth */}
      <rect x="10.5" y="17.5" width="1.4" height="2"   rx="0.3" fill="#fff" opacity="0.75"/>
      <rect x="12.5" y="17.5" width="1.4" height="2"   rx="0.3" fill="#fff" opacity="0.75"/>
    </Svg>
  )
}

/* ── A.R.D.O: Turtle — ninja bandana + cyber eye + memory nodes ── */
export function IconArdo(p: IconProps) {
  const c = p.color ?? 'currentColor'
  return (
    <Svg {...p}>
      {/* Memory node constellation (top) */}
      <circle cx="8"  cy="3.5" r="0.9" fill={c}/>
      <circle cx="12" cy="2"   r="0.9" fill={c}/>
      <circle cx="16" cy="3.5" r="0.9" fill={c}/>
      <line x1="8" y1="3.5" x2="12" y2="2"   stroke={c} strokeWidth="0.6" opacity="0.5"/>
      <line x1="12" y1="2"  x2="16" y2="3.5" stroke={c} strokeWidth="0.6" opacity="0.5"/>
      <line x1="8" y1="3.5" x2="16" y2="3.5" stroke={c} strokeWidth="0.45" opacity="0.3"/>
      {/* Head shape (rounded turtle) */}
      <ellipse cx="12" cy="13.5" rx="7" ry="6" fill={c} opacity="0.82"/>
      {/* Ninja bandana (across eyes) */}
      <rect x="5" y="10" width="14" height="4.5" rx="1.2" fill="#000" opacity="0.65"/>
      <rect x="5" y="10" width="14" height="4.5" rx="1.2" stroke={c} strokeWidth="0.5" fill="none"/>
      {/* Bandana knot (right side) */}
      <path d="M19 11.5 Q21.5 10.5 22 12.2 Q21.5 14 19 13z" fill={c} opacity="0.7"/>
      {/* Left eye — normal */}
      <circle cx="9"  cy="12.2" r="1.6" fill={c} opacity="0.9"/>
      <circle cx="9"  cy="12.2" r="0.7" fill="#000"/>
      {/* Right eye — cyber implant */}
      <circle cx="15" cy="12.2" r="1.9" stroke={c} strokeWidth="0.9" fill="#000" opacity="0.65"/>
      <circle cx="15" cy="12.2" r="1.1" stroke={c} strokeWidth="0.5" fill="none" opacity="0.5"/>
      <circle cx="15" cy="12.2" r="0.45" fill={c}/>
      <line x1="13.1" y1="12.2" x2="16.9" y2="12.2" stroke={c} strokeWidth="0.4" opacity="0.5"/>
      <line x1="15"   y1="10.3" x2="15"   y2="14.1" stroke={c} strokeWidth="0.4" opacity="0.5"/>
      {/* Shell hint (bottom arc) */}
      <path d="M7 18 Q12 21.5 17 18" stroke={c} strokeWidth="1" fill="none"
        strokeLinecap="round" opacity="0.5"/>
      <path d="M9 18.5 Q12 20 15 18.5" stroke={c} strokeWidth="0.6" fill="none"
        strokeLinecap="round" opacity="0.3"/>
    </Svg>
  )
}

/* ── WISE HOOT: Owl — big visor eyes + ear tufts ── */
export function IconHoot(p: IconProps) {
  const c = p.color ?? 'currentColor'
  return (
    <Svg {...p}>
      {/* Ear tufts */}
      <path d="M8 4L7 1l2.5 3.5M16 4L17 1l-2.5 3.5" stroke={c} strokeWidth="1.2" strokeLinecap="round"/>
      {/* Head */}
      <circle cx="12" cy="12" r="8" fill={c} opacity="0.8"/>
      {/* Visor / big eyes */}
      <rect x="5.5" y="8.5" width="13" height="6" rx="3" fill="#000" opacity="0.7"/>
      <rect x="5.5" y="8.5" width="13" height="6" rx="3" stroke={c} strokeWidth="0.8"/>
      {/* Eye glow circles */}
      <circle cx="9" cy="11.5" r="2" fill={c} opacity="0.2"/>
      <circle cx="9" cy="11.5" r="1" fill={c}/>
      <circle cx="15" cy="11.5" r="2" fill={c} opacity="0.2"/>
      <circle cx="15" cy="11.5" r="1" fill={c}/>
      {/* Beak */}
      <path d="M11 15l1 2 1-2" fill={c} opacity="0.7"/>
      {/* Scan line */}
      <line x1="6" y1="11.5" x2="18" y2="11.5" stroke={c} strokeWidth="0.4" opacity="0.4"/>
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

/* ── SOLARIS (id: pomu): Panda — station chef, eye patches + calorie scanner ── */
export function IconPomu(p: IconProps) {
  const c = p.color ?? 'currentColor'
  return (
    <Svg {...p}>
      {/* Head */}
      <circle cx="12" cy="12" r="8" fill={c} opacity="0.7"/>
      {/* Ears */}
      <circle cx="6.5" cy="5.5" r="2.5" fill={c}/>
      <circle cx="17.5" cy="5.5" r="2.5" fill={c}/>
      {/* Eye patches */}
      <ellipse cx="9" cy="11" rx="3" ry="2.5" fill="#000" opacity="0.8"/>
      <ellipse cx="15" cy="11" rx="3" ry="2.5" fill="#000" opacity="0.8"/>
      {/* Eyes */}
      <circle cx="9" cy="11" r="1" fill={c}/>
      <circle cx="15" cy="11" r="1" fill={c}/>
      {/* Nose */}
      <ellipse cx="12" cy="14" rx="1.2" ry="0.8" fill="#000" opacity="0.6"/>
      {/* Scan grid on one eye (scanner) */}
      <line x1="13" y1="9" x2="17" y2="9" stroke={c} strokeWidth="0.5" opacity="0.5"/>
      <line x1="13" y1="11" x2="17" y2="11" stroke={c} strokeWidth="0.5" opacity="0.5"/>
      <line x1="15" y1="9" x2="15" y2="13" stroke={c} strokeWidth="0.5" opacity="0.5"/>
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

/* ── GALACTIC PICTURES (id: foxy): Fox — pointed ears, mask stripe + film-reel eye ── */
export function IconFoxy(p: IconProps) {
  const c = p.color ?? 'currentColor'
  return (
    <Svg {...p}>
      {/* Head — wide cheeks tapering to muzzle */}
      <path d="M12 5C8 5 5 7.5 5 11c0 3 2.5 5.5 4.5 7l2.5 3 2.5-3c2-1.5 4.5-4 4.5-7 0-3.5-3-6-7-6z" fill={c} opacity="0.9"/>
      {/* Pointed ears */}
      <path d="M6.5 7.5L4 1.5l5 3.5M17.5 7.5L20 1.5l-5 3.5" fill={c} opacity="0.85"/>
      {/* Inner ear */}
      <path d="M6.6 6.2L5.4 3.2l2.6 1.9M17.4 6.2l1.2-3-2.6 1.9" fill="#000" opacity="0.35"/>
      {/* Mask stripe across eyes */}
      <path d="M6 10h12" stroke="#000" strokeWidth="2.6" opacity="0.5" strokeLinecap="round"/>
      {/* Left eye */}
      <circle cx="9" cy="10" r="1" fill={c}/>
      {/* Right eye — film-reel implant */}
      <circle cx="15" cy="10" r="1.7" stroke={c} strokeWidth="0.9" fill="none"/>
      <circle cx="15" cy="10" r="0.5" fill={c}/>
      <circle cx="15" cy="8.7" r="0.3" fill={c}/>
      <circle cx="16.3" cy="10" r="0.3" fill={c}/>
      <circle cx="15" cy="11.3" r="0.3" fill={c}/>
      <circle cx="13.7" cy="10" r="0.3" fill={c}/>
      {/* Nose */}
      <circle cx="12" cy="14.5" r="1" fill="#000" opacity="0.7"/>
      {/* Tail swish */}
      <path d="M19 18c2 .5 3-1 3-2.5" stroke={c} strokeWidth="1.2" strokeLinecap="round" opacity="0.5"/>
    </Svg>
  )
}

/* ── Map: moduleId → icon component ── */
import type { ModuleId } from '../guild'

export function CyberIcon({ id, size, color, glow }: { id: ModuleId | 'hub' | 'set' | 'pwr' } & IconProps) {
  const props = { size, color, glow }
  switch (id) {
    case 'scrap7': return <IconScrap7 {...props} />
    case 'ravi':   return <IconRavi   {...props} />
    case 'log':    return <IconLog    {...props} />
    case 'ardo':   return <IconArdo   {...props} />
    case 'hoot':   return <IconHoot   {...props} />
    case 'otty':   return <IconOtty   {...props} />
    case 'pomu':   return <IconPomu   {...props} />
    case 'kana':   return <IconKana   {...props} />
    case 'maggi':  return <IconMaggi  {...props} />
    case 'pavi':   return <IconPavi   {...props} />
    case 'ferri':  return <IconFerri  {...props} />
    case 'foxy':   return <IconFoxy   {...props} />
    case 'hub':    return <IconHub    {...props} />
    case 'set':    return <IconSet    {...props} />
    case 'pwr':    return <IconPwr    {...props} />
    default:       return <IconHub    {...props} />
  }
}
