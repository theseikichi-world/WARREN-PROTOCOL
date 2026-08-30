export type ModuleId =
  | 'scrap7' | 'ravi' | 'log' | 'ardo' | 'hoot' | 'otty'
  | 'pomu' | 'kana' | 'maggi' | 'pavi' | 'ferri' | 'foxy' | 'vigil'

/**
 * INSTRUMENTS are granted by routines, deepen by use and feed the character
 * sheet. UTILITIES serve the day and never touch a stat. The sidebar keeps them
 * visibly apart so the app reads as two things, not twelve.
 */
export type GuildGroup = 'instrument' | 'utility'

export interface GuildMember {
  id:      ModuleId
  group:   GuildGroup
  name:    string        // display name
  unit:    string        // short cyber code shown in sidebar
  animal:  string
  role:    string
  neon:    string
  path:    string
  free:    boolean
  built:   boolean       // shipped & reachable; unbuilt modules are hidden from the UI
  desc:    string        // one-line flavour text
}

export const GUILD: GuildMember[] = [
  {
    id: 'ravi', group: 'instrument' as GuildGroup,  name: 'INFINITY-8',    unit: '∞8',  animal: 'Raven',
    role: 'Time Protocol',
    neon: '#22d3ee', path: '/infinity8', free: false, built: false,
    desc: 'The day that flows endlessly. Reads every module, lays your day on the line, and guards your free time.',
  },
  {
    id: 'scrap7', group: 'instrument' as GuildGroup, name: 'ORBIT',        unit: 'ORB', animal: 'Raccoon',
    role: 'What comes round, and what holds you up',
    neon: '#00b4ff', path: '/scrap7', free: true, built: true,
    desc: 'What has to happen today, and the basics underneath it. The raccoon keeps the day; the goal work that builds you lives in UPLINKS.',
  },
  {
    id: 'log', group: 'instrument' as GuildGroup,   name: 'PATHFINDER',    unit: 'PTH', animal: 'Beaver',
    role: 'Dreams & Routes',
    neon: '#c084fc', path: '/log', free: false, built: false,
    desc: 'Finds the route from where you are to what you want. Every dream mapped, every dot connected.',
  },
  {
    id: 'ardo', group: 'utility' as GuildGroup,  name: 'A.R.D.O',       unit: 'ARD', animal: 'Turtle',
    role: 'Memory Trainer',
    neon: '#00e4a0', path: '/ardo', free: false, built: true,
    desc: 'Adaptive Recall & Drilling Operator. Every line locked. Zero excuses.',
  },
  {
    id: 'foxy', group: 'utility' as GuildGroup,  name: 'GALACTIC PICTURES', unit: 'GPX', animal: 'Fox',
    role: 'Movies · Shows · Games',
    neon: '#ff6b00', path: '/pictures', free: false, built: true,
    desc: 'The cosmic cinema fox. Tracks every film, episode and game release across the galaxy.',
  },
  {
    id: 'hoot', group: 'instrument' as GuildGroup,  name: "CAPTAIN'S JOURNAL", unit: 'CPT', animal: 'Owl',
    role: 'Diary & Log',
    neon: '#ffd700', path: '/journal', free: false, built: true,
    desc: 'Personal log with Wise Hoot as first officer. Your words polished, stickered, and reflected back.',
  },
  {
    id: 'otty', group: 'instrument' as GuildGroup,  name: 'SWIFT OTTY',    unit: 'OTY', animal: 'Otter',
    role: 'Exercise',
    neon: '#00f5ff', path: '/otty', free: false, built: false,
    desc: 'Always moving. Logs every rep. Holds the current.',
  },
  {
    id: 'pomu', group: 'instrument' as GuildGroup,  name: 'SOLARIS',       unit: 'SOL', animal: 'Panda',
    role: 'Solar Kitchen',
    neon: '#ffb13c', path: '/solaris', free: false, built: true,
    desc: "The Solar System's Kitchen. Orbital agri-station. Every meal grown & calibrated for you.",
  },
  {
    id: 'kana', group: 'utility' as GuildGroup,  name: 'SUNNY KANA',    unit: 'KNA', animal: 'Canary',
    role: 'Weather & Air Quality',
    neon: '#fff000', path: '/kana', free: true, built: false,
    desc: 'First signal. Reads the sky before you open the door.',
  },
  {
    id: 'maggi', group: 'utility' as GuildGroup, name: 'CLEVER MAGGI',  unit: 'MGI', animal: 'Magpie',
    role: 'News Hub',
    neon: '#c8d6e5', path: '/maggi', free: false, built: false,
    desc: 'Collects everything shiny. Filters the noise.',
  },
  {
    id: 'pavi', group: 'instrument' as GuildGroup,  name: 'FANCY PAVI',    unit: 'PVI', animal: 'Peacock',
    role: 'Acting Routine',
    neon: '#00ffcc', path: '/pavi', free: false, built: false,
    desc: 'Performance metrics. Every audition mapped.',
  },
  {
    id: 'ferri', group: 'utility' as GuildGroup, name: 'SLY FERRI',     unit: 'FRI', animal: 'Ferret',
    role: 'Casting Bot',
    neon: '#ff0033', path: '/ferri', free: false, built: false,
    desc: 'Never sleeps. Finds the casting call before anyone else.',
  },
  {
    id: 'vigil', group: 'instrument' as GuildGroup, name: 'VIGILANTE',  unit: 'VGL', animal: 'Bat',
    role: 'Static Protocol',
    neon: '#6366f1', path: '/vigilante', free: false, built: true,
    desc: 'Time under tension. Holds a position and counts the seconds — the training runs here, the habit lives in UPLINKS.',
  },
]
