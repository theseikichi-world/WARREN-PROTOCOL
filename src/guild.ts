export type ModuleId =
  | 'scrap7' | 'ravi' | 'log' | 'ardo' | 'hoot' | 'otty'
  | 'pomu' | 'kana' | 'maggi' | 'pavi' | 'ferri' | 'foxy'

export interface GuildMember {
  id:      ModuleId
  name:    string        // display name
  unit:    string        // short cyber code shown in sidebar
  animal:  string
  role:    string
  neon:    string
  path:    string
  free:    boolean
  desc:    string        // one-line flavour text
}

export const GUILD: GuildMember[] = [
  {
    id: 'ravi',  name: 'INFINITY-8',    unit: '∞8',  animal: 'Raven',
    role: 'Time Protocol',
    neon: '#22d3ee', path: '/infinity8', free: false,
    desc: 'The day that flows endlessly. Reads every module, lays your day on the line, and guards your free time.',
  },
  {
    id: 'scrap7', name: 'SCRAP-7',      unit: 'S-7', animal: 'Raccoon',
    role: 'Tasks & Habits',
    neon: '#00b4ff', path: '/scrap7', free: true,
    desc: 'Cyber-raccoon engineer. Iron heart. Cyber eye. Task completion at any cost.',
  },
  {
    id: 'log',   name: 'L.O.G',         unit: 'LOG', animal: 'Beaver',
    role: 'Goal Scientist',
    neon: '#c084fc', path: '/log', free: false,
    desc: 'Long-range Objective Graph. Every mission mapped. Every dot connected.',
  },
  {
    id: 'ardo',  name: 'A.R.D.O',       unit: 'ARD', animal: 'Turtle',
    role: 'Memory Trainer',
    neon: '#00e4a0', path: '/ardo', free: false,
    desc: 'Adaptive Recall & Drilling Operator. Every line locked. Zero excuses.',
  },
  {
    id: 'foxy',  name: 'GALACTIC PICTURES', unit: 'GPX', animal: 'Fox',
    role: 'Movies · Shows · Games',
    neon: '#ff6b00', path: '/pictures', free: false,
    desc: 'The cosmic cinema fox. Tracks every film, episode and game release across the galaxy.',
  },
  {
    id: 'hoot',  name: "CAPTAIN'S JOURNAL", unit: 'CPT', animal: 'Owl',
    role: 'Diary & Log',
    neon: '#ffd700', path: '/journal', free: false,
    desc: 'Personal log with Wise Hoot as first officer. Your words polished, stickered, and reflected back.',
  },
  {
    id: 'otty',  name: 'SWIFT OTTY',    unit: 'OTY', animal: 'Otter',
    role: 'Exercise',
    neon: '#00f5ff', path: '/otty', free: false,
    desc: 'Always moving. Logs every rep. Holds the current.',
  },
  {
    id: 'pomu',  name: 'SOLARIS',       unit: 'SOL', animal: 'Panda',
    role: 'Solar Kitchen',
    neon: '#ffb13c', path: '/solaris', free: false,
    desc: "The Solar System's Kitchen. Orbital agri-station. Every meal grown & calibrated for you.",
  },
  {
    id: 'kana',  name: 'SUNNY KANA',    unit: 'KNA', animal: 'Canary',
    role: 'Weather & Air Quality',
    neon: '#fff000', path: '/kana', free: true,
    desc: 'First signal. Reads the sky before you open the door.',
  },
  {
    id: 'maggi', name: 'CLEVER MAGGI',  unit: 'MGI', animal: 'Magpie',
    role: 'News Hub',
    neon: '#c8d6e5', path: '/maggi', free: false,
    desc: 'Collects everything shiny. Filters the noise.',
  },
  {
    id: 'pavi',  name: 'FANCY PAVI',    unit: 'PVI', animal: 'Peacock',
    role: 'Acting Routine',
    neon: '#00ffcc', path: '/pavi', free: false,
    desc: 'Performance metrics. Every audition mapped.',
  },
  {
    id: 'ferri', name: 'SLY FERRI',     unit: 'FRI', animal: 'Ferret',
    role: 'Casting Bot',
    neon: '#ff0033', path: '/ferri', free: false,
    desc: 'Never sleeps. Finds the casting call before anyone else.',
  },
]
