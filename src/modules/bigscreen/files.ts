// ─── Files — presentation helpers for the Warren file browser ─────────────────
// All pure: the Rust side hands over raw entries, everything a human reads
// (icon, colour, size, breadcrumbs) is derived here so it can be tested.

export interface FileEntry {
  name:   string
  path:   string
  is_dir: boolean
  size:   number
  ext:    string
}

interface Kind { icon: string; color: string; label: string }

const KINDS: Record<string, Kind> = {
  image:   { icon: '🖼', color: '#c084fc', label: 'Image' },
  video:   { icon: '🎬', color: '#ff6b00', label: 'Video' },
  audio:   { icon: '🎵', color: '#f59e0b', label: 'Audio' },
  doc:     { icon: '📄', color: '#38bdf8', label: 'Document' },
  sheet:   { icon: '📊', color: '#4ade80', label: 'Sheet' },
  pdf:     { icon: '📕', color: '#ff5470', label: 'PDF' },
  archive: { icon: '🗜', color: '#fbbf24', label: 'Archive' },
  code:    { icon: '⌨', color: '#00e4a0', label: 'Code' },
  exe:     { icon: '⚙', color: '#00f5ff', label: 'Program' },
  folder:  { icon: '📁', color: '#ffd700', label: 'Folder' },
  file:    { icon: '📄', color: '#94a3b8', label: 'File' },
}

const EXT_KIND: Record<string, keyof typeof KINDS> = {
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', bmp: 'image', svg: 'image', ico: 'image',
  mp4: 'video', mkv: 'video', avi: 'video', mov: 'video', webm: 'video', wmv: 'video',
  mp3: 'audio', wav: 'audio', flac: 'audio', ogg: 'audio', m4a: 'audio',
  doc: 'doc', docx: 'doc', txt: 'doc', rtf: 'doc', odt: 'doc', md: 'doc',
  xls: 'sheet', xlsx: 'sheet', csv: 'sheet',
  pdf: 'pdf',
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive',
  js: 'code', ts: 'code', tsx: 'code', jsx: 'code', json: 'code', html: 'code',
  css: 'code', py: 'code', rs: 'code', go: 'code', java: 'code', c: 'code', cpp: 'code',
  exe: 'exe', msi: 'exe', bat: 'exe', lnk: 'exe',
}

/** Icon + colour for an entry, by folder-ness then extension. */
export function fileKind(entry: Pick<FileEntry, 'is_dir' | 'ext'>): Kind {
  if (entry.is_dir) return KINDS.folder
  return KINDS[EXT_KIND[entry.ext] ?? 'file']
}

/** Human file size — blank for folders. */
export function fmtSize(bytes: number, isDir = false): string {
  if (isDir || bytes <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let n = bytes, i = 0
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`
}

/** Split a Windows path into clickable crumbs. */
export function breadcrumbs(path: string): { name: string; path: string }[] {
  if (!path) return []
  const norm = path.replace(/\//g, '\\').replace(/\\+$/, '')
  const parts = norm.split('\\').filter(Boolean)
  const out: { name: string; path: string }[] = []
  let acc = ''
  for (let i = 0; i < parts.length; i++) {
    // The drive root keeps its trailing slash ("C:" → "C:\")
    acc = i === 0 ? `${parts[0]}\\` : `${acc.replace(/\\$/, '')}\\${parts[i]}`
    out.push({ name: i === 0 ? `${parts[0]}\\` : parts[i], path: acc })
  }
  return out
}

/** Parent folder, or null when already at a drive root. */
export function parentPath(path: string): string | null {
  const crumbs = breadcrumbs(path)
  if (crumbs.length <= 1) return null
  return crumbs[crumbs.length - 2].path
}

/** Case-insensitive name filter, folders keep their leading position. */
export function filterEntries(entries: FileEntry[], query: string): FileEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return entries
  return entries.filter(e => e.name.toLowerCase().includes(q))
}
