import { useState, useEffect, useRef, useCallback } from 'react'
import {
  type MediaItem, type MediaType, type Status, type DiscoverItem, type Candidate,
  type ItemReview, type EpisodeInfo,
  loadLib, saveLib, uid, daysUntil, scoreColor, REVIEW_CATS,
} from './types'
import {
  searchTitles, fetchDetails, fetchSeason, getDiscover, getGames, gameToDiscover,
  tmdbKey, rawgKey, type DiscoverData, type GamesData,
} from './api'
import { t as tr } from '../../i18n'

// ─── Galactic Pictures palette — warm cinema over the cyber dark ──────────────
const C = {
  card:    'rgba(16,10,4,0.92)',          // opaque: readable over transparent window
  raised:  'rgba(26,17,8,0.95)',
  surface: 'rgba(11,7,3,0.85)',
  border:  'rgba(255,107,0,0.10)',
  faint:   'rgba(240,234,214,0.06)',
  orange:  '#ff6b00',
  amber:   '#f5a623',
  cream:   '#f0ead6',
  muted:   'rgba(240,234,214,0.45)',
  green:   '#4ade80',
  red:     '#f87171',
  blue:    '#38bdf8',
  purple:  '#a855f7',
  cyan:    '#22d3ee',
}
const FONT = 'var(--font)'

// Review category names double as persistence keys, so they stay English in the
// data — only their display label is localized here.
const CAT_RU: Record<string, string> = {
  Acting: 'Игра актёров', Writing: 'Сценарий', Visuals: 'Визуал', Sound: 'Звук',
  Direction: 'Режиссура', Pacing: 'Темп', Gameplay: 'Геймплей', Story: 'Сюжет',
  Graphics: 'Графика', Polish: 'Полировка',
}
const catLabel = (name: string) => tr(name, CAT_RU[name] ?? name)

function typeColorOf(t: MediaType) { return t === 'game' ? C.purple : t === 'tv' ? C.blue : C.amber }
function typeLabelOf(t: MediaType) { return t === 'movie' ? tr('FILM', 'ФИЛЬМ') : t === 'game' ? tr('GAME', 'ИГРА') : tr('SERIES', 'СЕРИАЛ') }

// ─── Fox Ragdoll Mascot (kept from Foxy, full animation set) ──────────────────
function FoxMascot({ size = 64 }: { size?: number }) {
  return (
    <div style={{ width: size, height: size, position: 'relative', flexShrink: 0 }}>
      <style>{`
        @keyframes foxSway { 0%,100%{transform:rotate(-6deg) translateY(0)} 25%{transform:rotate(5deg) translateY(-3px)} 50%{transform:rotate(-3deg) translateY(1px)} 75%{transform:rotate(4deg) translateY(-2px)} }
        @keyframes foxEarTwitch { 0%,85%,100%{transform:rotate(0)} 90%{transform:rotate(-15deg)} 95%{transform:rotate(10deg)} }
        @keyframes foxTailWag { 0%,100%{transform:rotate(-20deg) scaleX(1)} 50%{transform:rotate(20deg) scaleX(-1)} }
        @keyframes foxBlink { 0%,90%,100%{transform:scaleY(1)} 95%{transform:scaleY(0.1)} }
        @keyframes foxFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        .gp-fox-body{animation:foxSway 3.2s ease-in-out infinite;transform-origin:top center}
        .gp-fox-ear-l{animation:foxEarTwitch 4s ease-in-out infinite;transform-origin:bottom center}
        .gp-fox-ear-r{animation:foxEarTwitch 4.3s ease-in-out infinite 0.2s;transform-origin:bottom center}
        .gp-fox-tail{animation:foxTailWag 1.8s ease-in-out infinite;transform-origin:left center}
        .gp-fox-eye{animation:foxBlink 3.5s ease-in-out infinite;transform-origin:center}
        .gp-fox-wrap{animation:foxFloat 2.5s ease-in-out infinite}
      `}</style>
      <div className="gp-fox-wrap" style={{ width: size, height: size, filter: 'drop-shadow(0 0 8px rgba(255,107,0,0.45))' }}>
        <svg viewBox="0 0 100 110" width={size} height={size} className="gp-fox-body">
          <g className="gp-fox-tail" transform="translate(20, 72)">
            <ellipse cx="0" cy="0" rx="18" ry="11" fill="#ff6b00" opacity="0.9"/>
            <ellipse cx="-8" cy="-2" rx="8" ry="5" fill="#f0ead6" opacity="0.7"/>
          </g>
          <ellipse cx="50" cy="72" rx="22" ry="26" fill="#ff6b00"/>
          <ellipse cx="50" cy="76" rx="13" ry="17" fill="#f0ead6" opacity="0.9"/>
          <ellipse cx="50" cy="42" rx="22" ry="20" fill="#ff6b00"/>
          <ellipse cx="50" cy="50" rx="12" ry="9" fill="#f0ead6" opacity="0.95"/>
          <ellipse cx="50" cy="52" rx="3.5" ry="2.5" fill="#1a0a00"/>
          <g className="gp-fox-eye">
            <ellipse cx="43" cy="40" rx="3.5" ry="4" fill="#1a0a00"/>
            <ellipse cx="57" cy="40" rx="3.5" ry="4" fill="#1a0a00"/>
            <ellipse cx="44.2" cy="39" rx="1.2" ry="1.2" fill="white" opacity="0.8"/>
            <ellipse cx="58.2" cy="39" rx="1.2" ry="1.2" fill="white" opacity="0.8"/>
          </g>
          <g className="gp-fox-ear-l">
            <polygon points="30,28 24,10 40,22" fill="#ff6b00"/>
            <polygon points="31,26 26,13 38,23" fill="#ff4444" opacity="0.6"/>
          </g>
          <g className="gp-fox-ear-r">
            <polygon points="70,28 76,10 60,22" fill="#ff6b00"/>
            <polygon points="69,26 74,13 62,23" fill="#ff4444" opacity="0.6"/>
          </g>
          <ellipse cx="28" cy="70" rx="7" ry="12" fill="#ff6b00" transform="rotate(-15 28 70)"/>
          <ellipse cx="72" cy="70" rx="7" ry="12" fill="#ff6b00" transform="rotate(15 72 70)"/>
          <ellipse cx="24" cy="80" rx="6" ry="4" fill="#f0ead6" opacity="0.9"/>
          <ellipse cx="76" cy="80" rx="6" ry="4" fill="#f0ead6" opacity="0.9"/>
          <ellipse cx="50" cy="55" rx="14" ry="3" fill="none" stroke="#ff6b00" strokeWidth="2" opacity="0.5"/>
        </svg>
      </div>
    </div>
  )
}

// ─── Star Rating (5★) ─────────────────────────────────────────────────────────
function StarRating({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hovered, setHovered] = useState(0)
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n}
          onMouseEnter={() => setHovered(n)} onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(value === n ? 0 : n)}
          style={{ color: n <= (hovered || value) ? C.amber : 'rgba(240,234,214,0.15)',
            lineHeight: 1, fontSize: 16.5, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}>★</button>
      ))}
    </div>
  )
}

// ─── Discover Card ────────────────────────────────────────────────────────────
function DiscoverCard({ item, onAdd, inLibrary }: {
  item: DiscoverItem
  onAdd: (item: DiscoverItem) => void
  inLibrary: boolean
}) {
  const [hovered, setHovered] = useState(false)
  const tc = typeColorOf(item.type)
  const tl = item.type === 'game' ? tr('🎮 GAME', '🎮 ИГРА') : item.type === 'tv' ? tr('📺 SERIES', '📺 СЕРИАЛ') : tr('🎬 FILM', '🎬 ФИЛЬМ')

  return (
    <div onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        flex: '0 0 148px', scrollSnapAlign: 'start', borderRadius: 12, overflow: 'hidden',
        background: C.card,
        border: `1px solid ${hovered ? item.mood_color + '70' : C.border}`,
        boxShadow: hovered ? `0 8px 28px ${item.mood_color}35` : 'none',
        transition: 'all 0.2s ease', cursor: 'pointer', position: 'relative',
      }}>
      {/* Poster */}
      <div style={{ height: 110, position: 'relative', overflow: 'hidden',
        background: `linear-gradient(160deg, ${item.mood_color}55 0%, ${item.mood_color}18 60%, #00000070 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 42 }}>
        {item.poster_url ? (
          <img src={item.poster_url} alt={item.title}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.92 }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}/>
        ) : (
          <span style={{ position: 'relative', zIndex: 1 }}>{item.emoji}</span>
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.75) 100%)' }}/>
        <div style={{ position: 'absolute', top: 5, left: 5, zIndex: 2, fontFamily: FONT,
          fontSize: 11.5, fontWeight: 700, letterSpacing: '0.1em',
          color: tc, background: 'rgba(0,0,0,0.78)', border: `1px solid ${tc}60`,
          padding: '2px 5px', borderRadius: 4 }}>{tl}</div>
        {item.rating != null && item.rating > 0 && (
          <div style={{ position: 'absolute', top: 5, right: 5, zIndex: 2, fontFamily: FONT,
            fontSize: 10, fontWeight: 700, color: C.amber,
            background: 'rgba(0,0,0,0.78)', padding: '2px 5px', borderRadius: 4 }}>★ {item.rating}</div>
        )}
      </div>
      {/* Info */}
      <div style={{ padding: '8px 9px 10px' }}>
        <p style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 700, color: C.cream, lineHeight: 1.3, marginBottom: 3,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 26 }}>
          {item.title}</p>
        <p style={{ fontFamily: FONT, fontSize: 10, color: C.muted, marginBottom: 4 }}>{item.year}{item.genre ? ` · ${item.genre}` : ''}</p>

        {item.type === 'tv' && (item.current_season || item.next_episode_date) && (
          <div style={{ marginBottom: 5 }}>
            {item.current_season != null && (
              <p style={{ fontFamily: FONT, fontSize: 10, color: tc, fontWeight: 700 }}>
                S{item.current_season}
                {item.episodes_aired != null && item.episodes_total != null
                  ? ` · E${item.episodes_aired}/${item.episodes_total} ${tr('aired', 'вышло')}`
                  : item.episodes_aired != null ? ` · E${item.episodes_aired} ${tr('aired', 'вышло')}` : ''}
              </p>
            )}
            {item.next_episode_date && (() => {
              const d = daysUntil(item.next_episode_date)
              if (d === null || d < 0) return null
              const label = d === 0 ? tr('Today!', 'Сегодня!') : d === 1 ? tr('Tomorrow', 'Завтра')
                : new Date(item.next_episode_date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              return <p style={{ fontFamily: FONT, fontSize: 10, color: C.amber, fontWeight: 600 }}>📅 {tr('Next ep:', 'След. эп.:')} {label}</p>
            })()}
            {item.air_schedule && <p style={{ fontFamily: FONT, fontSize: 11.5, color: C.muted, marginTop: 1 }}>{item.air_schedule}</p>}
          </div>
        )}

        {item.type === 'movie' && item.platform === 'Coming to Cinemas' && item.release_date && (() => {
          const d = daysUntil(item.release_date)
          if (d === null || d < 0) return null
          return (
            <p style={{ fontFamily: FONT, fontSize: 10, color: C.amber, fontWeight: 700, marginBottom: 4 }}>
              🗓 {d === 0 ? tr('In cinemas today!', 'В кино сегодня!') : d === 1 ? tr('In cinemas tomorrow!', 'В кино завтра!')
                : `${tr('In cinemas', 'В кино')} ${new Date(item.release_date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
            </p>
          )
        })()}

        {item.platform && item.platform !== 'Coming to Cinemas' && (
          <p style={{ fontFamily: FONT, fontSize: 10, color: tc, marginBottom: 5, opacity: 0.8 }}>{item.platform}</p>
        )}

        <button onClick={e => { e.stopPropagation(); if (!inLibrary) onAdd(item) }}
          style={{
            width: '100%', padding: '4px 0', borderRadius: 6, fontFamily: FONT, fontSize: 10.5, fontWeight: 700,
            background: inLibrary ? 'rgba(74,222,128,0.1)' : `${item.mood_color}26`,
            color: inLibrary ? C.green : C.cream,
            border: `1px solid ${inLibrary ? 'rgba(74,222,128,0.3)' : item.mood_color + '50'}`,
            transition: 'all 0.15s', cursor: inLibrary ? 'default' : 'pointer',
          }}>
          {inLibrary ? tr('✓ IN LIBRARY', '✓ В БИБЛИОТЕКЕ') : tr('+ ADD', '+ ДОБАВИТЬ')}
        </button>
      </div>
    </div>
  )
}

// ─── Horizontal Scroll Row ────────────────────────────────────────────────────
function ScrollRow({ title, icon, color, items, lib, onAdd, loading }: {
  title: string; icon: string; color: string
  items: DiscoverItem[]; lib: MediaItem[]
  onAdd: (item: DiscoverItem) => void
  loading: boolean
}) {
  const libTitles = new Set(lib.map(x => x.title.toLowerCase()))
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)

  const updateArrows = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanLeft(el.scrollLeft > 8)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateArrows()
    el.addEventListener('scroll', updateArrows, { passive: true })
    const ro = new ResizeObserver(updateArrows)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', updateArrows); ro.disconnect() }
  }, [items, updateArrows])

  if (!loading && items.length === 0) return null

  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingLeft: 2 }}>
        <div style={{ width: 3, height: 16, borderRadius: 2, background: `linear-gradient(180deg, ${color}, ${color}44)` }}/>
        <span style={{ fontFamily: FONT, fontSize: 11.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color }}>
          {icon} {title}
        </span>
        {loading && <span style={{ fontFamily: FONT, fontSize: 10.5, color: C.muted, animation: 'pulse 1s infinite' }}>{tr('loading…', 'загрузка…')}</span>}
        {!loading && items.length > 0 && (
          <span style={{ fontFamily: FONT, fontSize: 10, color: C.muted }}>{items.length}</span>
        )}
        {!loading && items.length > 0 && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            {[{ dir: -1 as const, ic: '‹', can: canLeft }, { dir: 1 as const, ic: '›', can: canRight }].map(b => (
              <button key={b.dir} onClick={() => scrollRef.current?.scrollBy({ left: b.dir * 320, behavior: 'smooth' })} disabled={!b.can}
                style={{
                  width: 22, height: 22, borderRadius: 6, border: `1px solid ${b.can ? color + '45' : C.border}`,
                  background: b.can ? color + '14' : 'transparent',
                  color: b.can ? color : 'rgba(240,234,214,0.15)',
                  fontSize: 16.5, lineHeight: 1, cursor: b.can ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
                }}>{b.ic}</button>
            ))}
          </div>
        )}
      </div>

      <div ref={scrollRef}
        style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6, scrollbarWidth: 'none', scrollSnapType: 'x mandatory' }}>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ flex: '0 0 148px', height: 200, borderRadius: 12,
              background: C.card, border: `1px solid ${C.border}`,
              animation: 'pulse 1.5s ease-in-out infinite', scrollSnapAlign: 'start' }}/>
          ))
        ) : (
          items.map((item, i) => (
            <DiscoverCard key={i} item={item} onAdd={onAdd}
              inLibrary={libTitles.has(item.title.toLowerCase())} />
          ))
        )}
      </div>
    </div>
  )
}

// ─── Upcoming Episodes ────────────────────────────────────────────────────────
function UpcomingEpisodes({ lib }: { lib: MediaItem[] }) {
  const watching = lib.filter(x => x.status === 'watching' && x.type === 'tv')
  if (watching.length === 0) return null

  const withNext = watching.filter(x => {
    const d = daysUntil(x.next_episode_date)
    return d !== null && d >= 0 && d <= 30
  }).sort((a, b) => new Date(a.next_episode_date!).getTime() - new Date(b.next_episode_date!).getTime())

  const withCatchup = watching.filter(x =>
    x.episodes_released !== null && x.progress.episode < x.episodes_released)

  if (withNext.length === 0 && withCatchup.length === 0) return null

  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingLeft: 2 }}>
        <div style={{ width: 3, height: 16, borderRadius: 2, background: `linear-gradient(180deg, ${C.green}, ${C.green}44)` }}/>
        <span style={{ fontFamily: FONT, fontSize: 11.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.green }}>
          📅 {tr('Your Upcoming', 'Ваши ближайшие')}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
        {withCatchup.map(item => (
          <div key={item.id} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
            borderRadius: 10, background: 'rgba(10,18,8,0.85)', border: '1px solid rgba(74,222,128,0.25)' }}>
            <span style={{ fontSize: 20 }}>{item.emoji}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 700, color: C.cream }}>{item.title}</p>
              <p style={{ fontFamily: FONT, fontSize: 11, color: C.green }}>
                🍿 {item.episodes_released! - item.progress.episode} {tr('new eps to watch', 'нов. эп. к просмотру')} · {tr("you're on", 'вы на')} E{item.progress.episode}
              </p>
            </div>
            {item.air_schedule && <p style={{ fontFamily: FONT, fontSize: 10, color: C.muted, flexShrink: 0 }}>{item.air_schedule}</p>}
          </div>
        ))}
        {withNext.map(item => {
          const d = daysUntil(item.next_episode_date)!
          return (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
              borderRadius: 10, background: 'rgba(20,14,4,0.85)', border: '1px solid rgba(245,166,35,0.25)' }}>
              <span style={{ fontSize: 20 }}>{item.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 700, color: C.cream }}>{item.title}</p>
                <p style={{ fontFamily: FONT, fontSize: 11, color: C.amber }}>
                  {d === 0 ? tr('New episode today! 🎉', 'Новый эпизод сегодня! 🎉') : d === 1 ? tr('New episode tomorrow!', 'Новый эпизод завтра!') : `${tr('Next episode in', 'Новый эпизод через')} ${d} ${tr('days', 'дн.')}`}
                  <span style={{ color: C.muted, marginLeft: 5 }}>
                    ({new Date(item.next_episode_date!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})
                  </span>
                </p>
              </div>
              {item.air_schedule && <p style={{ fontFamily: FONT, fontSize: 10, color: C.muted, flexShrink: 0 }}>{item.air_schedule}</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Add Modal ────────────────────────────────────────────────────────────────
function AddModal({ defaultStatus, onClose, onAdd }: {
  defaultStatus: Status
  onClose: () => void
  onAdd: (item: MediaItem) => void
}) {
  const [query, setQuery] = useState('')
  const [phase, setPhase] = useState<'idle' | 'searching' | 'loading' | 'done'>('idle')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [result, setResult] = useState<Partial<MediaItem> | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [targetStatus, setTargetStatus] = useState<Status>(defaultStatus)
  const ref = useRef<HTMLInputElement>(null)

  const keyOf = (c: Candidate) => c.imdb_id ?? `tmdb-${c.tmdb_id}`

  const fetchOne = useCallback(async (c: Candidate) => {
    setPhase('loading'); setErr(null); setResult(null)
    try {
      const d = await fetchDetails(c)
      setResult(d); setPhase('done')
    } catch (e) {
      setErr(e instanceof Error ? e.message : tr('Failed to load details', 'Не удалось загрузить данные')); setPhase('idle')
    }
  }, [])

  const search = useCallback(async (q: string) => {
    if (!q.trim()) return
    setPhase('searching'); setErr(null); setCandidates([]); setResult(null); setSelectedKey(null)
    try {
      const list = await searchTitles(q.trim())
      setCandidates(list)
      if (list.length > 0) {
        setSelectedKey(keyOf(list[0]))
        await fetchOne(list[0])
      } else {
        setErr(tmdbKey() ? tr('No results found', 'Ничего не найдено') : tr('No results — add a TMDB key in Settings for search', 'Нет результатов — добавьте ключ TMDB в Настройках для поиска'))
        setPhase('idle')
      }
    } catch { setErr(tr('Network error', 'Ошибка сети')); setPhase('idle') }
  }, [fetchOne])

  useEffect(() => { ref.current?.focus() }, [])

  const add = () => {
    if (!result) return
    const item = result as MediaItem
    onAdd({
      id: uid(),
      title: item.title || query,
      year: item.year || new Date().getFullYear(),
      type: item.type ?? 'movie',
      genre: item.genre || [],
      synopsis: item.synopsis || '',
      emoji: item.emoji || '🎬',
      mood_color: item.mood_color || '#7d0000',
      director: item.director ?? null,
      creator: item.creator ?? null,
      cast: item.cast || [],
      imdb_rating: item.imdb_rating ?? null,
      total_seasons: item.total_seasons ?? null,
      tagline: item.tagline || '',
      next_episode_date: item.next_episode_date ?? null,
      air_schedule: item.air_schedule ?? null,
      episodes_in_season: item.episodes_in_season ?? null,
      episodes_released: item.episodes_released ?? null,
      runtime: item.runtime ?? null,
      imdb_id: item.imdb_id ?? null,
      status: item.release_date && daysUntil(item.release_date) !== null && daysUntil(item.release_date)! > 0
        ? 'coming-soon' : targetStatus,
      release_date: item.release_date ?? null,
      rating: 0,
      progress: { season: 1, episode: 0 },
      addedAt: new Date().toISOString(),
      notes: '',
      platform: item.platform ?? null,
      poster_url: item.poster_url ?? null,
      tmdb_id: item.tmdb_id ?? null,
    })
    onClose()
  }

  const isLoading = phase === 'searching' || phase === 'loading'
  const inp: React.CSSProperties = {
    flex: 1, padding: '8px 12px', borderRadius: 8, fontFamily: FONT, fontSize: 'var(--fs-sm)', outline: 'none',
    background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,107,0,0.25)', color: C.cream,
    userSelect: 'text', WebkitUserSelect: 'text',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'flex-end',
      background: 'rgba(0,0,0,0.8)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: '100%', maxHeight: '88%', overflowY: 'auto',
        background: 'rgba(12,7,2,0.98)', borderTop: '1px solid rgba(255,107,0,0.35)',
        borderTopLeftRadius: 14, borderTopRightRadius: 14, backdropFilter: 'blur(20px)' }}>
        <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderBottom: `1px solid ${C.faint}` }}>
          <div>
            <p style={{ fontFamily: FONT, fontSize: 10.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.orange }}>🦊 Galactic Pictures · {tr('Search', 'Поиск')}</p>
            <p style={{ fontFamily: FONT, fontSize: 13.5, fontWeight: 700, color: C.cream, marginTop: 3 }}>{tr('Find a movie or show', 'Найдите фильм или сериал')}</p>
          </div>
          <button onClick={onClose} style={{ color: C.muted, fontSize: 18, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 7 }}>
            <input ref={ref} value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search(query)}
              placeholder={tr('Search title…', 'Название…')} style={inp}/>
            <button onClick={() => search(query)} disabled={isLoading || !query.trim()}
              style={{
                padding: '8px 16px', borderRadius: 8, fontFamily: FONT, fontSize: 'var(--fs-sm)', fontWeight: 700, cursor: 'pointer',
                background: isLoading ? C.raised : C.orange, color: isLoading ? C.muted : '#fff',
                border: 'none', opacity: !query.trim() ? 0.4 : 1, transition: 'all 0.15s',
              }}>{isLoading ? '…' : tr('FIND', 'НАЙТИ')}</button>
          </div>

          {!result && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {['Severance', 'The Bear', 'Dune', 'Shogun', 'Arcane', 'Oppenheimer'].map(x => (
                <button key={x} onClick={() => { setQuery(x); search(x) }}
                  style={{
                    fontFamily: FONT, fontSize: 11, padding: '4px 9px', borderRadius: 6, cursor: 'pointer',
                    background: C.raised, color: C.muted, border: `1px solid ${C.faint}`, transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,107,0,0.4)'; e.currentTarget.style.color = C.orange }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = C.faint; e.currentTarget.style.color = C.muted }}>
                  {x}
                </button>
              ))}
            </div>
          )}

          {phase === 'searching' && <p style={{ fontFamily: FONT, fontSize: 11.5, color: C.amber }}>🔍 {tr('Searching…', 'Поиск…')}</p>}
          {phase === 'loading' && <p style={{ fontFamily: FONT, fontSize: 11.5, color: C.amber }}>📡 {tr('Loading details…', 'Загрузка данных…')}</p>}
          {err && <p style={{ fontFamily: FONT, fontSize: 11.5, color: C.red }}>{err}</p>}

          {candidates.length > 1 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {candidates.map(c => {
                const k = keyOf(c)
                return (
                  <button key={k} onClick={() => { setSelectedKey(k); fetchOne(c) }}
                    style={{
                      fontFamily: FONT, fontSize: 10.5, padding: '4px 9px', borderRadius: 6, cursor: 'pointer',
                      background: selectedKey === k ? 'rgba(255,107,0,0.15)' : C.raised,
                      color: selectedKey === k ? C.orange : C.muted,
                      border: `1px solid ${selectedKey === k ? 'rgba(255,107,0,0.4)' : C.faint}`,
                      transition: 'all 0.15s',
                    }}>
                    {c.title}{c.year ? ` (${c.year})` : ''} · {c.type === 'tv' ? tr('Series', 'Сериал') : tr('Film', 'Фильм')}
                  </button>
                )
              })}
            </div>
          )}

          {result && phase === 'done' && (() => {
            const r = result as MediaItem
            const tc = typeColorOf(r.type ?? 'movie')
            return (
              <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.faint}` }}>
                <div style={{ padding: '12px 14px', display: 'flex', gap: 12,
                  background: `linear-gradient(135deg, ${r.mood_color}55, ${r.mood_color}18)`,
                  borderBottom: `1px solid ${C.faint}` }}>
                  <div style={{ width: 46, height: 64, borderRadius: 8, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 26, flexShrink: 0, overflow: 'hidden', position: 'relative',
                    background: `${r.mood_color}38`, border: `1px solid ${r.mood_color}55` }}>
                    {r.poster_url
                      ? <img src={r.poster_url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}/>
                      : r.emoji}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <p style={{ fontFamily: FONT, fontSize: 13.5, fontWeight: 700, color: C.cream }}>{r.title}</p>
                      <span style={{ fontFamily: FONT, fontSize: 11.5, padding: '2px 5px', borderRadius: 4, fontWeight: 700,
                        letterSpacing: '0.1em', background: `${tc}20`, color: tc }}>{typeLabelOf(r.type ?? 'movie')}</span>
                    </div>
                    <p style={{ fontFamily: FONT, fontSize: 11, color: C.muted, marginTop: 3 }}>
                      {r.year} · {(r.genre ?? []).slice(0, 2).join(', ')}
                      {r.total_seasons ? ` · ${r.total_seasons}s` : ''}
                      {r.imdb_rating ? ` · ★ ${r.imdb_rating}` : ''}
                    </p>
                    {r.tagline && <p style={{ fontFamily: FONT, fontSize: 11, color: 'rgba(240,234,214,0.4)', fontStyle: 'italic', marginTop: 4 }}>"{r.tagline}"</p>}
                  </div>
                </div>
                <div style={{ padding: '10px 14px', background: C.card }}>
                  <p style={{ fontFamily: FONT, fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{r.synopsis}</p>
                  <p style={{ fontFamily: FONT, fontSize: 11, color: 'rgba(240,234,214,0.25)', marginTop: 6 }}>
                    {r.director ? `${tr('Dir.', 'Реж.')} ${r.director}` : r.creator ? `${tr('By', 'Автор')} ${r.creator}` : ''}
                    {(r.cast ?? []).length > 0 ? ` · ${r.cast.slice(0, 3).join(', ')}` : ''}
                  </p>
                  {r.air_schedule && <p style={{ fontFamily: FONT, fontSize: 10.5, color: 'rgba(240,234,214,0.2)', marginTop: 4 }}>📅 {r.air_schedule}</p>}
                </div>
                <div style={{ padding: '10px 14px', background: C.raised, borderTop: `1px solid ${C.faint}` }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 9 }}>
                    {(['watchlist', 'watching', 'watched', 'coming-soon'] as Status[]).map(s => {
                      const labels: Record<Status, string> = { watchlist: tr('Want to watch', 'Хочу посмотреть'), watching: tr('Watching now', 'Смотрю сейчас'), watched: tr('Already watched', 'Уже посмотрел'), 'coming-soon': tr('Coming soon', 'Скоро') }
                      return (
                        <button key={s} onClick={() => setTargetStatus(s)} style={{
                          padding: '6px 9px', borderRadius: 7, fontFamily: FONT, fontSize: 11, fontWeight: 600, textAlign: 'left',
                          cursor: 'pointer', transition: 'all 0.15s',
                          background: targetStatus === s ? 'rgba(255,107,0,0.15)' : C.card,
                          color: targetStatus === s ? C.orange : C.muted,
                          border: `1px solid ${targetStatus === s ? 'rgba(255,107,0,0.4)' : C.faint}`,
                        }}>{targetStatus === s ? '● ' : '○ '}{labels[s]}</button>
                      )
                    })}
                  </div>
                  <button onClick={add} style={{
                    width: '100%', padding: '10px 0', borderRadius: 9, fontFamily: FONT, fontSize: 'var(--fs-sm)', fontWeight: 700,
                    background: C.orange, color: '#fff', border: 'none', cursor: 'pointer',
                    boxShadow: '0 4px 20px rgba(255,107,0,0.4)',
                  }}>{tr('ADD TO LIBRARY', 'ДОБАВИТЬ В БИБЛИОТЕКУ')}</button>
                </div>
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

// ─── Rating Modal (5-category review) ─────────────────────────────────────────
function RatingModal({ item, onSubmit, onSkip }: {
  item: MediaItem
  onSubmit: (review: ItemReview) => void
  onSkip: () => void
}) {
  const cats = REVIEW_CATS[item.type] ?? REVIEW_CATS.movie
  const [scores, setScores] = useState<number[]>(() =>
    cats.map(cat => item.review?.categories.find(c => c.name === cat.name)?.score ?? 0))
  const [comment, setComment] = useState(item.review?.comment ?? '')

  const filled = scores.filter(s => s > 0).length
  const overall = filled === 5 ? Math.round(scores.reduce((a, b) => a + b, 0) / 5 * 10) / 10 : null

  const submit = () => {
    if (!overall) return
    onSubmit({
      categories: cats.map((cat, i) => ({ ...cat, score: scores[i] })),
      comment, reviewedAt: new Date().toISOString(), overall,
    })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 320, display: 'flex', alignItems: 'flex-end',
      background: 'rgba(0,0,0,0.85)' }}>
      <div style={{ width: '100%', maxHeight: '90%', overflowY: 'auto',
        background: 'rgba(12,7,2,0.98)', borderTop: '1px solid rgba(255,107,0,0.4)',
        borderTopLeftRadius: 14, borderTopRightRadius: 14, backdropFilter: 'blur(20px)' }}>
        {/* Header */}
        <div style={{ padding: '14px 18px 12px',
          background: item.poster_url
            ? `linear-gradient(to bottom, rgba(0,0,0,0.35), rgba(12,7,2,0.97)), url(${item.poster_url}) center/cover`
            : `linear-gradient(135deg, ${item.mood_color}45, ${item.mood_color}10)`,
          borderBottom: `1px solid ${C.faint}` }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ width: 46, height: 64, borderRadius: 8, overflow: 'hidden', flexShrink: 0, position: 'relative',
              background: `${item.mood_color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
              border: `1px solid ${item.mood_color}40` }}>
              {item.poster_url
                ? <img src={item.poster_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}/>
                : item.emoji}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: FONT, fontSize: 10.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: C.orange }}>🏆 {tr('Your Review', 'Ваш отзыв')}</p>
              <p style={{ fontFamily: FONT, fontSize: 15.5, fontWeight: 800, color: C.cream, margin: '3px 0 2px' }}>{item.title}</p>
              <p style={{ fontFamily: FONT, fontSize: 11, color: C.muted }}>{item.year} · {typeLabelOf(item.type)}</p>
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {cats.map((cat, i) => (
            <div key={cat.name}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontFamily: FONT, fontSize: 12, fontWeight: 700, color: C.cream }}>{cat.emoji} {catLabel(cat.name)}</span>
                {scores[i] > 0 && (
                  <span style={{ fontFamily: FONT, fontSize: 14.5, fontWeight: 900, color: scoreColor(scores[i]) }}>
                    {scores[i]}<span style={{ fontSize: 10.5, color: C.muted }}>/10</span>
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 3 }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => {
                  const active = n <= scores[i]
                  return (
                    <button key={n} onClick={() => setScores(prev => { const s = [...prev]; s[i] = n; return s })}
                      style={{
                        flex: 1, height: 26, borderRadius: 5, fontFamily: FONT, fontSize: 11, fontWeight: 700,
                        border: 'none', cursor: 'pointer', transition: 'all 0.1s',
                        background: active ? scoreColor(scores[i]) : C.raised,
                        color: active ? '#000' : 'rgba(240,234,214,0.35)',
                      }}>{n}</button>
                  )
                })}
              </div>
            </div>
          ))}

          {overall !== null && (
            <div style={{ padding: '12px', borderRadius: 12, textAlign: 'center',
              background: `${scoreColor(overall)}12`, border: `1px solid ${scoreColor(overall)}35` }}>
              <p style={{ fontFamily: FONT, fontSize: 30, fontWeight: 900, color: scoreColor(overall), lineHeight: 1 }}>
                {overall.toFixed(1)}</p>
              <p style={{ fontFamily: FONT, fontSize: 10.5, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.15em', marginTop: 4 }}>
                {tr('Your Overall Score', 'Ваша общая оценка')}</p>
              <p style={{ fontFamily: FONT, fontSize: 11.5, color: scoreColor(overall), marginTop: 4 }}>
                {overall >= 9 ? tr('Masterpiece 🏆', 'Шедевр 🏆') : overall >= 8 ? tr('Excellent 🌟', 'Отлично 🌟') : overall >= 7 ? tr('Really Good 👍', 'Очень хорошо 👍')
                  : overall >= 6 ? tr('Decent 😐', 'Неплохо 😐') : overall >= 5 ? tr('Average 🤷', 'Средне 🤷') : tr('Not for me 👎', 'Не моё 👎')}</p>
            </div>
          )}

          <textarea value={comment} onChange={e => setComment(e.target.value)}
            placeholder={tr('Your thoughts… (optional)', 'Ваши мысли… (необязательно)')} rows={3}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 9, fontFamily: FONT, fontSize: 'var(--fs-sm)',
              background: C.raised, border: `1px solid ${C.faint}`, color: C.cream,
              outline: 'none', resize: 'none', boxSizing: 'border-box', userSelect: 'text', WebkitUserSelect: 'text' }}/>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onSkip} style={{
              flex: 1, padding: '10px 0', borderRadius: 9, fontFamily: FONT, fontSize: 12, fontWeight: 700,
              background: 'transparent', color: C.muted, border: `1px solid ${C.faint}`, cursor: 'pointer' }}>{tr('Skip for now', 'Пока пропустить')}</button>
            <button onClick={submit} disabled={filled < 5} style={{
              flex: 2, padding: '10px 0', borderRadius: 9, fontFamily: FONT, fontSize: 'var(--fs-sm)', fontWeight: 700,
              background: filled < 5 ? 'rgba(255,107,0,0.15)' : C.orange,
              color: filled < 5 ? 'rgba(240,234,214,0.3)' : '#fff',
              border: 'none', cursor: filled < 5 ? 'default' : 'pointer',
              boxShadow: filled === 5 ? '0 4px 20px rgba(255,107,0,0.4)' : 'none', transition: 'all 0.2s' }}>
              {filled < 5 ? `${tr('Rate all 5 categories', 'Оцените все 5 категорий')} (${filled}/5)` : tr('✓ Submit Review', '✓ Отправить отзыв')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Library Card ─────────────────────────────────────────────────────────────
function LibraryCard({ item, onUpdate, onRemove, onMove }: {
  item: MediaItem
  onUpdate: (id: string, patch: Partial<MediaItem>) => void
  onRemove: (id: string) => void
  onMove: (id: string, status: Status) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshErr, setRefreshErr] = useState<string | null>(null)
  const [episodes, setEpisodes] = useState<EpisodeInfo[]>([])
  const [epSeason, setEpSeason] = useState<number>(0)
  const [epSeasonName, setEpSeasonName] = useState<string | null>(null)
  const [totalSeasons, setTotalSeasons] = useState<number>(item.total_seasons ?? 1)
  const [loadingEps, setLoadingEps] = useState(false)
  const [showAllEps, setShowAllEps] = useState(false)
  const [seasonRatingPending, setSeasonRatingPending] = useState<number | null>(null)
  const [showFinishedBanner, setShowFinishedBanner] = useState(false)
  const days = daysUntil(item.release_date)
  const isUpcoming = item.status === 'coming-soon' && days !== null && days > 0
  const tc = typeColorOf(item.type)
  const today = new Date().toISOString().slice(0, 10)

  // Episode list — TMDB direct
  useEffect(() => {
    if (!expanded || item.type !== 'tv' || !tmdbKey()) return
    setLoadingEps(true); setEpisodes([])
    fetchSeason({
      tmdb_id: item.tmdb_id ?? null,
      title: item.title, year: item.year,
      season: epSeason === 0 ? 'latest' : epSeason,
    })
      .then(d => {
        setEpisodes(d.episodes)
        setEpSeasonName(d.season_name)
        if (d.total_seasons) setTotalSeasons(d.total_seasons)
        if (d.resolved_season && epSeason === 0) setEpSeason(d.resolved_season)
        const patch: Partial<MediaItem> = {}
        if (d.tmdb_id && !item.tmdb_id) patch.tmdb_id = d.tmdb_id
        if (d.total_seasons && d.total_seasons !== item.total_seasons) patch.total_seasons = d.total_seasons
        if (Object.keys(patch).length) onUpdate(item.id, patch)
      })
      .catch(() => {})
      .finally(() => setLoadingEps(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, epSeason, item.type])

  // Refresh metadata (replaces the old IMDB re-import)
  const refresh = useCallback(async () => {
    setRefreshing(true); setRefreshErr(null)
    try {
      const d = await fetchDetails({
        imdb_id: item.imdb_id, tmdb_id: item.tmdb_id ?? null,
        title: item.title, year: item.year,
        type: item.type === 'tv' ? 'tv' : 'movie', cast: '', image_url: null,
      })
      const patch: Partial<MediaItem> = {}
      const keep = item.type === 'game'
      if (d.title) patch.title = d.title
      if (d.year) patch.year = d.year
      if (!keep && d.type) patch.type = d.type
      if (d.genre?.length) patch.genre = d.genre
      if (d.synopsis) patch.synopsis = d.synopsis
      if (d.emoji) patch.emoji = d.emoji
      if (d.mood_color) patch.mood_color = d.mood_color
      if (d.director !== undefined) patch.director = d.director
      if (d.creator !== undefined) patch.creator = d.creator
      if (d.cast?.length) patch.cast = d.cast
      if (d.imdb_rating) patch.imdb_rating = d.imdb_rating
      if (d.total_seasons) patch.total_seasons = d.total_seasons
      if (d.tagline) patch.tagline = d.tagline
      if (d.episodes_in_season != null) patch.episodes_in_season = d.episodes_in_season
      if (d.episodes_released != null) patch.episodes_released = d.episodes_released
      // Backfills items added before runtime was stored, so their invitations
      // stop claiming a generic 45 minutes.
      if (d.runtime != null) patch.runtime = d.runtime
      if (d.air_schedule) patch.air_schedule = d.air_schedule
      patch.next_episode_date = d.next_episode_date ?? null
      if (d.imdb_id) patch.imdb_id = d.imdb_id
      if (d.tmdb_id) patch.tmdb_id = d.tmdb_id
      if (d.poster_url) patch.poster_url = d.poster_url
      onUpdate(item.id, patch)
    } catch (e) {
      setRefreshErr(e instanceof Error ? e.message : tr('Refresh failed', 'Не удалось обновить'))
    } finally { setRefreshing(false) }
  }, [item, onUpdate])

  const MOVES = ([
    { s: 'watchlist' as Status, l: tr('Watchlist', 'К просмотру') },
    { s: 'watching' as Status, l: tr('Watching', 'Смотрю') },
    { s: 'watched' as Status, l: tr('Watched', 'Просмотрено') },
    { s: 'coming-soon' as Status, l: tr('Coming Soon', 'Скоро') },
  ]).filter(o => o.s !== item.status)

  return (
    <div style={{
      borderRadius: 10, overflow: 'hidden', background: C.card,
      border: `1px solid ${expanded ? item.mood_color + '35' : C.border}`,
      borderLeft: `3px solid ${item.mood_color}`,
      boxShadow: expanded ? '0 4px 24px rgba(0,0,0,0.5)' : 'none',
      transition: 'all 0.2s',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}>
        <div style={{ width: 34, height: 48, borderRadius: 7, flexShrink: 0, overflow: 'hidden',
          background: `${item.mood_color}22`, border: `1px solid ${item.mood_color}38`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, position: 'relative' }}>
          {item.poster_url
            ? <img src={item.poster_url} alt={item.title} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}/>
            : item.emoji}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <p style={{ fontFamily: FONT, fontSize: 13.5, fontWeight: 700, color: C.cream }}>{item.title}</p>
            <span style={{ fontFamily: FONT, fontSize: 11, padding: '1px 5px', borderRadius: 3, fontWeight: 700,
              letterSpacing: '0.1em', background: `${tc}18`, color: tc }}>{typeLabelOf(item.type)}</span>
          </div>
          <p style={{ fontFamily: FONT, fontSize: 10.5, color: C.muted, marginTop: 2 }}>
            {item.year} · {item.genre.slice(0, 2).join(' · ')}
            {item.imdb_rating ? ` · ★ ${item.imdb_rating}` : ''}
          </p>

          {item.type === 'tv' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4, flexWrap: 'wrap' }}>
              {item.status === 'watching' ? (() => {
                const totalWatched = Object.values(item.watchedEps ?? {}).reduce((sum, arr) => sum + arr.length, 0)
                return (
                  <p style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: C.orange }}>
                    S{String(item.progress.season).padStart(2, '0')} E{String(item.progress.episode).padStart(2, '0')}
                    {item.episodes_in_season ? `/${item.episodes_in_season}` : ''}
                    {totalWatched > 0 && <span style={{ fontSize: 11.5, fontWeight: 400, color: 'rgba(255,107,0,0.6)', marginLeft: 4 }}>({totalWatched} watched)</span>}
                  </p>
                )
              })() : item.total_seasons != null ? (
                <p style={{ fontFamily: FONT, fontSize: 10.5, fontWeight: 600, color: C.orange }}>
                  S{item.total_seasons}{item.episodes_in_season ? ` · ${item.episodes_in_season} eps` : ''}
                </p>
              ) : null}

              {item.seasonRatings && Object.keys(item.seasonRatings).length > 0 && (
                <div style={{ display: 'flex', gap: 3 }}>
                  {Object.entries(item.seasonRatings).map(([s, r]) => (
                    <span key={s} style={{ fontFamily: FONT, fontSize: 11.5, padding: '1px 4px', borderRadius: 3,
                      background: `${scoreColor(r)}18`, color: scoreColor(r), fontWeight: 700 }}>S{s} {r}</span>
                  ))}
                </div>
              )}

              {item.status === 'watching' && item.episodes_released !== null && item.progress.episode < item.episodes_released && (
                <p style={{ fontFamily: FONT, fontSize: 10.5, fontWeight: 700, color: C.green }}>
                  🍿 {item.episodes_released - item.progress.episode} new</p>
              )}

              {item.status !== 'watching' && item.episodes_released != null && (
                <p style={{ fontFamily: FONT, fontSize: 10.5, color: C.muted }}>
                  E{item.episodes_released}{item.episodes_in_season ? `/${item.episodes_in_season}` : ''} aired</p>
              )}

              {item.next_episode_date && (() => {
                const d = daysUntil(item.next_episode_date)
                if (d === null || d < 0) return null
                return (
                  <p style={{ fontFamily: FONT, fontSize: 10.5, fontWeight: 700, color: C.amber }}>
                    📅 {d === 0 ? tr('Today!', 'Сегодня!') : d === 1 ? tr('Tomorrow', 'Завтра')
                      : new Date(item.next_episode_date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                )
              })()}

              {item.air_schedule && <p style={{ fontFamily: FONT, fontSize: 11.5, color: 'rgba(240,234,214,0.25)' }}>{item.air_schedule}</p>}
            </div>
          )}

          {item.status === 'watched' && item.review && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
              <span style={{ fontFamily: FONT, fontSize: 13.5, fontWeight: 900, color: scoreColor(item.review.overall) }}>
                {item.review.overall.toFixed(1)}</span>
              <span style={{ fontFamily: FONT, fontSize: 11.5, color: C.muted }}>/ 10</span>
              <div style={{ display: 'flex', gap: 2, marginLeft: 2 }}>
                {item.review.categories.map(c => (
                  <span key={c.name} title={`${catLabel(c.name)}: ${c.score}`} style={{ fontSize: 10.5 }}>{c.emoji}</span>
                ))}
              </div>
            </div>
          )}
          {isUpcoming && <p style={{ fontFamily: FONT, fontSize: 11, color: C.amber, marginTop: 4, fontWeight: 700 }}>
            {days === 0 ? tr('Today!', 'Сегодня!') : days === 1 ? tr('Tomorrow', 'Завтра') : `${tr('In', 'Через')} ${days} ${tr('days', 'дн.')}`}</p>}
        </div>
        <span style={{ fontSize: 11.5, color: C.muted, flexShrink: 0, marginTop: 4, transition: 'transform 0.2s',
          transform: expanded ? 'rotate(180deg)' : 'none' }}>▾</span>
      </div>

      {expanded && (
        <div style={{ borderTop: `1px solid ${C.faint}` }}>
          <div style={{ padding: '10px 12px' }}>
            {item.review && (
              <div style={{ marginBottom: 9, padding: '8px 10px', borderRadius: 8,
                background: `${scoreColor(item.review.overall)}0a`, border: `1px solid ${scoreColor(item.review.overall)}28` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <span style={{ fontFamily: FONT, fontSize: 18, fontWeight: 900, color: scoreColor(item.review.overall) }}>
                    {item.review.overall.toFixed(1)}</span>
                  <div style={{ flex: 1, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {item.review.categories.map(c => (
                      <span key={c.name} style={{ fontFamily: FONT, fontSize: 10.5, color: C.muted }}>
                        {c.emoji} {catLabel(c.name)} <span style={{ color: scoreColor(c.score), fontWeight: 700 }}>{c.score}</span>
                      </span>
                    ))}
                  </div>
                </div>
                {item.review.comment && (
                  <p style={{ fontFamily: FONT, fontSize: 11, fontStyle: 'italic', color: C.muted }}>"{item.review.comment}"</p>
                )}
              </div>
            )}
            {item.tagline && item.tagline !== 'No tagline available' && (
              <p style={{ fontFamily: FONT, fontSize: 11, fontStyle: 'italic', color: C.muted, marginBottom: 4 }}>"{item.tagline}"</p>
            )}
            <p style={{ fontFamily: FONT, fontSize: 12, lineHeight: 1.6, color: 'rgba(240,234,214,0.6)' }}>{item.synopsis || tr('No synopsis.', 'Нет описания.')}</p>
            {(item.director || item.creator || item.cast.length > 0) && (
              <p style={{ fontFamily: FONT, fontSize: 10.5, color: 'rgba(240,234,214,0.25)', marginTop: 6 }}>
                {item.director ? `${tr('Dir.', 'Реж.')} ${item.director}` : item.creator ? `${tr('By', 'Автор')} ${item.creator}` : ''}
                {item.cast.length > 0 ? ` · ${item.cast.slice(0, 3).join(', ')}` : ''}
              </p>
            )}
          </div>

          <div style={{ padding: '10px 12px', background: C.raised, borderTop: `1px solid ${C.faint}`,
            display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* IMDB link + refresh */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              {item.imdb_id && (
                <a href={`https://www.imdb.com/title/${item.imdb_id}/`} target="_blank" rel="noopener noreferrer"
                  style={{ fontFamily: FONT, fontSize: 10.5, padding: '3px 9px', borderRadius: 6, color: C.amber,
                    background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.2)', textDecoration: 'none' }}>
                  ⭐ IMDB ↗</a>
              )}
              <button onClick={e => { e.stopPropagation(); refresh() }} disabled={refreshing}
                style={{ fontFamily: FONT, fontSize: 10.5, padding: '3px 9px', borderRadius: 6, cursor: 'pointer',
                  color: C.cyan, background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.2)' }}>
                {refreshing ? tr('↻ Refreshing…', '↻ Обновление…') : tr('↻ Refresh data', '↻ Обновить данные')}</button>
              {refreshErr && <span style={{ fontFamily: FONT, fontSize: 10.5, color: C.red }}>{refreshErr}</span>}
            </div>

            {/* ── Full episode list (TV) ── */}
            {item.type === 'tv' && (() => {
              const seasonTabs = Array.from({ length: totalSeasons }, (_, i) => totalSeasons - i)
              const aired = episodes.filter(e => e.air_date && e.air_date <= today)
              const upcoming = episodes.filter(e => !e.air_date || e.air_date > today)
              const visibleEps = showAllEps ? episodes : [...aired, ...upcoming.slice(0, 3)]

              if (!tmdbKey()) {
                return <p style={{ fontFamily: FONT, fontSize: 11, color: C.muted }}>
                  {tr('Add a TMDB key in Settings to track episodes', 'Добавьте ключ TMDB в Настройках, чтобы отслеживать эпизоды')}</p>
              }

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    {seasonTabs.map(s => (
                      <button key={s} onClick={e => { e.stopPropagation(); setEpSeason(s); setShowAllEps(false) }}
                        style={{
                          fontFamily: FONT, fontSize: 10.5, padding: '3px 9px', borderRadius: 5, cursor: 'pointer', fontWeight: 700,
                          background: epSeason === s ? 'rgba(255,107,0,0.15)' : C.card,
                          color: epSeason === s ? C.orange : C.muted,
                          border: `1px solid ${epSeason === s ? 'rgba(255,107,0,0.4)' : C.faint}`,
                        }}>S{s}</button>
                    ))}
                    {epSeasonName && <span style={{ fontFamily: FONT, fontSize: 10.5, color: C.muted }}>· {epSeasonName}</span>}
                    {item.air_schedule && (
                      <span style={{ fontFamily: FONT, fontSize: 10.5, color: 'rgba(240,234,214,0.25)', marginLeft: 'auto' }}>{item.air_schedule}</span>
                    )}
                  </div>

                  {loadingEps ? (
                    <p style={{ fontFamily: FONT, fontSize: 11, color: C.muted, padding: '8px 0', textAlign: 'center' }}>{tr('Loading episodes…', 'Загрузка эпизодов…')}</p>
                  ) : episodes.length === 0 ? (
                    <p style={{ fontFamily: FONT, fontSize: 11, color: C.muted, padding: '6px 0' }}>{tr('No episode data available', 'Нет данных об эпизодах')}</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {visibleEps.map(ep => {
                        const isAired = !!(ep.air_date && ep.air_date <= today)
                        const watchedInSeason = item.watchedEps?.[epSeason] ?? []
                        const isWatched = watchedInSeason.includes(ep.episode_number)
                        const isUp = !isAired
                        const epKey = `S${epSeason}E${ep.episode_number}`
                        const epRating = item.epRatings?.[epKey] ?? 0
                        const d = ep.air_date ? daysUntil(ep.air_date) : null
                        const dateLabel = !ep.air_date ? tr('TBA', 'Скоро')
                          : isAired ? new Date(ep.air_date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                          : d === 0 ? tr('Today', 'Сегодня') : d === 1 ? tr('Tomorrow', 'Завтра')
                          : new Date(ep.air_date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

                        const toggleWatched = (e: React.MouseEvent) => {
                          e.stopPropagation()
                          if (!isAired) return
                          const current = item.watchedEps?.[epSeason] ?? []
                          const next = isWatched
                            ? current.filter(n => n !== ep.episode_number)
                            : [...current, ep.episode_number].sort((a, b) => a - b)
                          onUpdate(item.id, {
                            watchedEps: { ...item.watchedEps, [epSeason]: next },
                            progress: { season: epSeason, episode: next.length > 0 ? Math.max(...next) : 0 },
                          })
                          if (!isWatched) {
                            const airedEps = episodes.filter(x => x.air_date && x.air_date <= today)
                            const hasUpcoming = episodes.some(x => !x.air_date || x.air_date > today)
                            const caughtUp = next.length >= airedEps.length && airedEps.length > 0
                            if (caughtUp) {
                              setSeasonRatingPending(epSeason)
                              if (!hasUpcoming && epSeason === totalSeasons) {
                                const allPrevDone = Array.from({ length: totalSeasons - 1 }, (_, i) => i + 1)
                                  .every(s => (item.watchedEps?.[s]?.length ?? 0) > 0)
                                if (allPrevDone) setShowFinishedBanner(true)
                              }
                            }
                          }
                        }

                        return (
                          <div key={ep.episode_number} title={ep.overview || undefined}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 6,
                              opacity: isUp ? 0.45 : 1, transition: 'background 0.12s' }}
                            onMouseEnter={e => { if (isAired) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}>
                            <button onClick={toggleWatched}
                              title={isWatched ? tr('Mark unwatched', 'Снять отметку') : isAired ? tr('Mark watched', 'Отметить просмотренным') : tr('Not aired yet', 'Ещё не вышло')}
                              style={{
                                width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                                border: `1.5px solid ${isWatched ? 'rgba(74,222,128,0.6)' : isAired ? 'rgba(240,234,214,0.25)' : 'rgba(240,234,214,0.1)'}`,
                                background: isWatched ? 'rgba(74,222,128,0.15)' : 'transparent',
                                cursor: isAired ? 'pointer' : 'default',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 10.5, color: isWatched ? 'rgba(74,222,128,0.9)' : 'transparent', padding: 0,
                              }}>{isWatched ? '✓' : ''}</button>
                            <span style={{ fontFamily: FONT, fontSize: 10.5, fontWeight: 700, width: 20, flexShrink: 0,
                              color: isWatched ? 'rgba(240,234,214,0.35)' : isUp ? C.amber : C.muted }}>E{ep.episode_number}</span>
                            <span style={{ flex: 1, fontFamily: FONT, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              color: isWatched ? 'rgba(240,234,214,0.35)' : isUp ? 'rgba(240,234,214,0.5)' : 'rgba(240,234,214,0.85)',
                              textDecoration: isWatched ? 'line-through rgba(240,234,214,0.2)' : 'none' }}>{ep.name}</span>
                            {isWatched && (
                              <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                                {[1, 2, 3, 4, 5].map(s => (
                                  <button key={s}
                                    onClick={e => { e.stopPropagation(); onUpdate(item.id, { epRatings: { ...item.epRatings, [epKey]: s === epRating ? 0 : s } }) }}
                                    title={`${tr('Rate episode', 'Оценить эпизод')} ${s}/5`}
                                    style={{ width: 7, height: 7, borderRadius: '50%', padding: 0, cursor: 'pointer', border: 'none',
                                      background: s <= epRating ? 'rgba(245,166,35,0.8)' : 'rgba(240,234,214,0.15)' }}/>
                                ))}
                              </div>
                            )}
                            <span style={{ fontFamily: FONT, fontSize: 11.5, flexShrink: 0, minWidth: 34, textAlign: 'right',
                              color: isUp ? C.amber : 'rgba(240,234,214,0.2)' }}>{dateLabel}</span>
                          </div>
                        )
                      })}
                      {upcoming.length > 3 && !showAllEps && (
                        <button onClick={e => { e.stopPropagation(); setShowAllEps(true) }}
                          style={{ fontFamily: FONT, fontSize: 10.5, color: C.muted, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', textAlign: 'left' }}>
                          + {upcoming.length - 3} {tr('more upcoming', 'ещё впереди')}</button>
                      )}
                      {showAllEps && upcoming.length > 3 && (
                        <button onClick={e => { e.stopPropagation(); setShowAllEps(false) }}
                          style={{ fontFamily: FONT, fontSize: 10.5, color: C.muted, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', textAlign: 'left' }}>
                          {tr('Show less', 'Свернуть')}</button>
                      )}
                    </div>
                  )}

                  {/* Season completion rating */}
                  {seasonRatingPending !== null && (
                    <div style={{ padding: '8px 10px', borderRadius: 8, marginTop: 3,
                      background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.22)',
                      display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12.5 }}>{episodes.some(e => !e.air_date || e.air_date > today) ? '✅' : '🎉'}</span>
                      <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: 'rgba(74,222,128,0.9)' }}>
                        {episodes.some(e => !e.air_date || e.air_date > today)
                          ? `${tr('Caught up on Season', 'Догнали сезон')} ${seasonRatingPending}!` : `${tr('Season', 'Сезон')} ${seasonRatingPending} ${tr('done!', 'завершён!')}`}</span>
                      <span style={{ fontFamily: FONT, fontSize: 10.5, color: C.muted }}>{tr('Rate it:', 'Оцените:')}</span>
                      <div style={{ display: 'flex', gap: 2 }}>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => {
                          const cur = item.seasonRatings?.[seasonRatingPending] ?? 0
                          return (
                            <button key={n} onClick={e => {
                              e.stopPropagation()
                              onUpdate(item.id, { seasonRatings: { ...item.seasonRatings, [seasonRatingPending]: n } })
                              setSeasonRatingPending(null)
                            }} style={{
                              width: 19, height: 19, borderRadius: 4, cursor: 'pointer',
                              fontFamily: FONT, fontSize: 10.5, fontWeight: 700,
                              background: n <= cur ? 'rgba(74,222,128,0.2)' : C.card,
                              color: n <= cur ? 'rgba(74,222,128,0.9)' : C.muted,
                              border: `1px solid ${n <= cur ? 'rgba(74,222,128,0.35)' : C.faint}`,
                            }}>{n}</button>
                          )
                        })}
                      </div>
                      <button onClick={e => { e.stopPropagation(); setSeasonRatingPending(null) }}
                        style={{ fontFamily: FONT, fontSize: 10.5, color: C.muted, background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto' }}>{tr('skip', 'пропустить')}</button>
                    </div>
                  )}

                  {/* Finished-show banner */}
                  {showFinishedBanner && (
                    <div style={{ padding: '8px 10px', borderRadius: 8, marginTop: 3,
                      background: 'rgba(255,107,0,0.09)', border: '1px solid rgba(255,107,0,0.28)',
                      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14.5 }}>🏁</span>
                      <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 700, color: C.orange }}>{tr('You finished', 'Вы досмотрели')} {item.title}!</span>
                      <button onClick={e => { e.stopPropagation(); setShowFinishedBanner(false); onMove(item.id, 'watched') }}
                        style={{ fontFamily: FONT, fontSize: 10.5, padding: '3px 10px', borderRadius: 6, cursor: 'pointer',
                          background: 'rgba(255,107,0,0.15)', color: C.orange, border: '1px solid rgba(255,107,0,0.35)', fontWeight: 700 }}>
                        → {tr('Mark as Watched', 'Отметить просмотренным')}</button>
                      <button onClick={e => { e.stopPropagation(); setShowFinishedBanner(false) }}
                        style={{ fontFamily: FONT, fontSize: 10.5, color: C.muted, background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto' }}>{tr('not yet', 'ещё нет')}</button>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Star rating (watched) */}
            {item.status === 'watched' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={e => e.stopPropagation()}>
                <span style={{ fontFamily: FONT, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.muted }}>{tr('Rating', 'Оценка')}</span>
                <StarRating value={item.rating} onChange={r => onUpdate(item.id, { rating: r })}/>
                {item.rating > 0 && <span style={{ fontFamily: FONT, fontSize: 10.5, color: C.muted }}>
                  {['', tr('Waste of time', 'Зря потратил время'), tr('Meh', 'Так себе'), tr('Decent', 'Неплохо'), tr('Really good', 'Очень хорошо'), tr('Masterpiece', 'Шедевр')][item.rating]}</span>}
              </div>
            )}

            {/* Notes */}
            <input value={item.notes} onClick={e => e.stopPropagation()}
              onChange={e => onUpdate(item.id, { notes: e.target.value })} placeholder={tr('Add a note…', 'Добавить заметку…')}
              style={{ width: '100%', padding: '7px 10px', borderRadius: 8, fontFamily: FONT, fontSize: 11.5, outline: 'none',
                background: C.card, border: `1px solid ${C.faint}`, color: C.cream, boxSizing: 'border-box',
                userSelect: 'text', WebkitUserSelect: 'text' }}/>

            {/* Type toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }} onClick={e => e.stopPropagation()}>
              <span style={{ fontFamily: FONT, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.muted }}>{tr('Type', 'Тип')}</span>
              <div style={{ display: 'flex', gap: 5 }}>
                {(['movie', 'tv', 'game'] as MediaType[]).map(t => {
                  const tcc = typeColorOf(t)
                  return (
                    <button key={t} onClick={() => onUpdate(item.id, { type: t })} style={{
                      fontFamily: FONT, fontSize: 10.5, padding: '3px 9px', borderRadius: 6, cursor: 'pointer', transition: 'all 0.15s',
                      background: item.type === t ? `${tcc}20` : C.card, color: item.type === t ? tcc : C.muted,
                      border: `1px solid ${item.type === t ? tcc + '40' : C.faint}`,
                    }}>{t === 'movie' ? tr('🎬 Film', '🎬 Фильм') : t === 'game' ? tr('🎮 Game', '🎮 Игра') : tr('📺 Series', '📺 Сериал')}</button>
                  )
                })}
              </div>
            </div>

            {/* Move + remove */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 5 }}
              onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {MOVES.map(o => (
                  <button key={o.s} onClick={() => onMove(item.id, o.s)} style={{
                    fontFamily: FONT, fontSize: 10.5, padding: '3px 9px', borderRadius: 6, cursor: 'pointer', transition: 'all 0.15s',
                    background: C.card, color: C.muted, border: `1px solid ${C.faint}`,
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,107,0,0.4)'; e.currentTarget.style.color = C.orange }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = C.faint; e.currentTarget.style.color = C.muted }}>→ {o.l}</button>
                ))}
              </div>
              <button onClick={() => onRemove(item.id)} style={{ fontFamily: FONT, fontSize: 10.5, color: C.red,
                background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5 }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}>{tr('Remove', 'Удалить')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Library View ─────────────────────────────────────────────────────────────
function LibraryView({ lib, onUpdate, onRemove, onMove, onRequestReview }: {
  lib: MediaItem[]
  onUpdate: (id: string, patch: Partial<MediaItem>) => void
  onRemove: (id: string) => void
  onMove: (id: string, status: Status) => void
  onRequestReview: (item: MediaItem) => void
}) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set(['watching', 'watchlist', 'watched', 'coming-soon', 'games']))

  const q = search.toLowerCase()
  const fil = q ? lib.filter(x => x.title.toLowerCase().includes(q)) : lib

  const SECS = [
    { id: 'watching', label: tr('Now Watching', 'Сейчас смотрю'), icon: '▶', color: C.green,
      items: fil.filter(x => x.status === 'watching' && x.type !== 'game') },
    { id: 'watchlist', label: tr('Watchlist', 'К просмотру'), icon: '🎬', color: C.amber,
      items: fil.filter(x => x.status === 'watchlist' && x.type !== 'game') },
    { id: 'watched', label: tr('Finished', 'Просмотрено'), icon: '✅', color: C.blue,
      items: fil.filter(x => x.status === 'watched') },
    { id: 'coming-soon', label: tr('Coming Soon', 'Скоро'), icon: '🗓', color: C.orange,
      items: fil.filter(x => x.status === 'coming-soon') },
    { id: 'games', label: tr('My Games', 'Мои игры'), icon: '🎮', color: C.purple,
      items: fil.filter(x => x.type === 'game') },
  ]

  const toggle = (id: string) =>
    setOpen(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const handleMove = useCallback((id: string, status: Status) => {
    onMove(id, status)
    if (status === 'watched') {
      const item = lib.find(x => x.id === id)
      if (item) onRequestReview({ ...item, status: 'watched' })
    }
  }, [lib, onMove, onRequestReview])

  const active = SECS.filter(s => s.items.length > 0)

  return (
    <div>
      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 7, marginBottom: 14 }}>
        {[
          { v: lib.filter(x => x.status === 'watching' && x.type !== 'game').length, l: tr('Watching', 'Смотрю'), c: C.green },
          { v: lib.filter(x => x.status === 'watchlist' && x.type !== 'game').length, l: tr('Watchlist', 'К просмотру'), c: C.amber },
          { v: lib.filter(x => x.status === 'watched').length, l: tr('Finished', 'Просмотрено'), c: C.blue },
          { v: lib.filter(x => x.type === 'game').length, l: tr('Games', 'Игры'), c: C.purple },
        ].map(s => (
          <div key={s.l} style={{ padding: '8px 4px', borderRadius: 10, textAlign: 'center',
            background: 'rgba(8,5,2,0.8)', border: `1px solid ${s.c}25` }}>
            <p style={{ fontFamily: FONT, fontSize: 19, fontWeight: 900, color: s.c, lineHeight: 1 }}>{s.v}</p>
            <p style={{ fontFamily: FONT, fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: 4 }}>{s.l}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      {lib.length > 3 && (
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder={tr('🔍  Search your library…', '🔍  Поиск по библиотеке…')}
          style={{ width: '100%', padding: '8px 12px', borderRadius: 9, fontFamily: FONT, fontSize: 'var(--fs-sm)', marginBottom: 12,
            background: C.raised, border: `1px solid ${C.faint}`, color: C.cream,
            outline: 'none', boxSizing: 'border-box', userSelect: 'text', WebkitUserSelect: 'text' }}/>
      )}

      {lib.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><FoxMascot size={72}/></div>
          <p style={{ fontFamily: FONT, fontSize: 'var(--fs-md)', color: C.muted }}>{tr('Your library is empty', 'Ваша библиотека пуста')}</p>
          <p style={{ fontFamily: FONT, fontSize: 11.5, color: 'rgba(240,234,214,0.2)', marginTop: 4 }}>
            {tr('Discover and add movies, shows & games', 'Открывайте и добавляйте фильмы, сериалы и игры')}</p>
        </div>
      ) : active.length === 0 ? (
        <p style={{ textAlign: 'center', padding: '30px 0', fontFamily: FONT, fontSize: 12.5, color: C.muted }}>
          {tr('No results for', 'Ничего не найдено по')} "{search}"</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {active.map(sec => {
            const isOpen = open.has(sec.id)
            const films = sec.items.filter(x => x.type === 'movie')
            const series = sec.items.filter(x => x.type === 'tv')
            const mixed = films.length > 0 && series.length > 0

            const renderCards = (arr: MediaItem[]) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {arr.map(item => (
                  <LibraryCard key={item.id} item={item} onUpdate={onUpdate} onRemove={onRemove} onMove={handleMove}/>
                ))}
              </div>
            )

            return (
              <div key={sec.id} style={{ borderRadius: 12, overflow: 'hidden',
                border: `1px solid ${sec.color}25`, background: C.surface }}>
                <button onClick={() => toggle(sec.id)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 13px', background: `${sec.color}0a`,
                  border: 'none', cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = `${sec.color}14` }}
                  onMouseLeave={e => { e.currentTarget.style.background = `${sec.color}0a` }}>
                  <div style={{ width: 3, height: 15, borderRadius: 2, background: sec.color, flexShrink: 0 }}/>
                  <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 800, letterSpacing: '0.16em',
                    textTransform: 'uppercase', color: sec.color, flex: 1, textAlign: 'left' }}>{sec.icon} {sec.label}</span>
                  <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 800, color: sec.color,
                    background: `${sec.color}20`, padding: '1px 8px', borderRadius: 20, marginRight: 5 }}>{sec.items.length}</span>
                  <span style={{ fontSize: 12.5, color: C.muted, transform: isOpen ? 'none' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>▾</span>
                </button>

                {isOpen && (
                  <div style={{ padding: '7px 10px 10px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {mixed ? (
                      <>
                        {films.length > 0 && (
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                              <div style={{ width: 2, height: 11, borderRadius: 1, background: C.amber }}/>
                              <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, color: C.amber,
                                textTransform: 'uppercase', letterSpacing: '0.14em' }}>🎬 {tr('Films', 'Фильмы')} · {films.length}</span>
                            </div>
                            {renderCards(films)}
                          </div>
                        )}
                        {series.length > 0 && (
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                              <div style={{ width: 2, height: 11, borderRadius: 1, background: C.blue }}/>
                              <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 700, color: C.blue,
                                textTransform: 'uppercase', letterSpacing: '0.14em' }}>📺 {tr('Series', 'Сериалы')} · {series.length}</span>
                            </div>
                            {renderCards(series)}
                          </div>
                        )}
                      </>
                    ) : renderCards(sec.items)}

                    {/* Finished: avg review score */}
                    {sec.id === 'watched' && (() => {
                      const reviewed = sec.items.filter(x => x.review)
                      if (reviewed.length === 0) return null
                      const avg = reviewed.reduce((s, x) => s + x.review!.overall, 0) / reviewed.length
                      return (
                        <div style={{ marginTop: 2, padding: '8px 12px', borderRadius: 10,
                          background: `${scoreColor(avg)}0a`, border: `1px solid ${scoreColor(avg)}22`,
                          display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ textAlign: 'center' }}>
                            <p style={{ fontFamily: FONT, fontSize: 19, fontWeight: 900, color: scoreColor(avg) }}>{avg.toFixed(1)}</p>
                            <p style={{ fontFamily: FONT, fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 2 }}>{tr('avg score', 'ср. оценка')}</p>
                          </div>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontFamily: FONT, fontSize: 11, color: C.muted }}>{reviewed.length} {tr('of', 'из')} {sec.items.length} {tr('reviewed', 'с отзывом')}</p>
                            <p style={{ fontFamily: FONT, fontSize: 10.5, color: 'rgba(240,234,214,0.25)', marginTop: 2 }}>
                              {tr('Films', 'Фильмы')}: {reviewed.filter(x => x.type === 'movie').length} · {tr('Series', 'Сериалы')}: {reviewed.filter(x => x.type === 'tv').length}</p>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Games View ───────────────────────────────────────────────────────────────
function GamesView({ lib, onAdd }: { lib: MediaItem[]; onAdd: (item: DiscoverItem) => void }) {
  const [data, setData] = useState<GamesData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!rawgKey()) { setLoading(false); return }
    getGames()
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (!rawgKey()) {
    return (
      <div style={{ marginBottom: 18, padding: '10px 14px', borderRadius: 10,
        background: 'rgba(20,12,28,0.8)', border: '1px solid rgba(168,85,247,0.25)',
        display: 'flex', alignItems: 'center', gap: 9 }}>
        <span style={{ fontSize: 18 }}>🎮</span>
        <p style={{ fontFamily: FONT, fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
          {tr('Add a free', 'Добавьте бесплатный')} <span style={{ color: C.purple }}>{tr('RAWG key', 'ключ RAWG')}</span> {tr('in Settings → Data Sources to see game releases with Metacritic scores (rawg.io/apidocs)', 'в Настройках → Источники данных, чтобы видеть релизы игр с оценками Metacritic (rawg.io/apidocs)')}
        </p>
      </div>
    )
  }

  const topSellers = (data?.topSellers ?? []).map(gameToDiscover)
  const newReleases = (data?.newReleases ?? []).map(gameToDiscover)
  const comingSoon = (data?.comingSoon ?? []).map(gameToDiscover)

  return (
    <div>
      <ScrollRow title={tr('Top Rated Games', 'Топ игр по оценкам')} icon="🔥" color={C.purple}
        items={topSellers} lib={lib} onAdd={onAdd} loading={loading}/>
      <ScrollRow title={tr('New Releases', 'Новые релизы')} icon="🆕" color={C.cyan}
        items={newReleases} lib={lib} onAdd={onAdd} loading={loading}/>
      <ScrollRow title={tr('Coming Soon', 'Скоро')} icon="📅" color={C.orange}
        items={comingSoon} lib={lib} onAdd={onAdd} loading={loading}/>
    </div>
  )
}

// ─── Main module ──────────────────────────────────────────────────────────────
export default function Pictures() {
  const [lib, setLib] = useState<MediaItem[]>(() => loadLib())
  const [mainTab, setMainTab] = useState<'discover' | 'library'>('discover')
  const [showAdd, setShowAdd] = useState(false)
  const [discover, setDiscover] = useState<DiscoverData | null>(null)
  const [discoverLoading, setDiscoverLoading] = useState(false)
  const [reviewTarget, setReviewTarget] = useState<MediaItem | null>(null)

  useEffect(() => { saveLib(lib) }, [lib])

  useEffect(() => {
    if (!tmdbKey()) return
    setDiscoverLoading(true)
    getDiscover()
      .then(d => setDiscover(d))
      .catch(() => {})
      .finally(() => setDiscoverLoading(false))
  }, [])

  const addItem = useCallback((item: MediaItem) => setLib(prev => [item, ...prev]), [])
  const updateItem = useCallback((id: string, patch: Partial<MediaItem>) =>
    setLib(prev => prev.map(x => x.id === id ? { ...x, ...patch } : x)), [])
  const removeItem = useCallback((id: string) => setLib(prev => prev.filter(x => x.id !== id)), [])
  const moveItem = useCallback((id: string, status: Status) =>
    setLib(prev => prev.map(x => x.id === id ? { ...x, status } : x)), [])

  const addFromDiscover = useCallback((item: DiscoverItem, status: Status = 'watchlist') => {
    if (lib.some(x => x.title.toLowerCase() === item.title.toLowerCase())) return
    const newItem: MediaItem = {
      id: uid(), title: item.title, year: item.year,
      type: item.type, genre: item.genre ? [item.genre] : [],
      synopsis: item.synopsis, emoji: item.emoji, mood_color: item.mood_color,
      director: null, creator: null, cast: [],
      imdb_rating: item.rating, total_seasons: item.current_season ?? null,
      status: item.release_date && daysUntil(item.release_date) !== null && daysUntil(item.release_date)! > 0 ? 'coming-soon' : status,
      tagline: item.tagline || '',
      next_episode_date: item.next_episode_date ?? null,
      air_schedule: item.air_schedule ?? null,
      episodes_in_season: item.episodes_total ?? null,
      episodes_released: item.episodes_aired ?? null,
      runtime: null,
      imdb_id: item.imdb_id, rating: 0,
      progress: { season: 1, episode: 0 },
      release_date: item.release_date, addedAt: new Date().toISOString(), notes: '',
      platform: item.platform,
      poster_url: item.poster_url,
      tmdb_id: item.tmdb_id,
    }
    setLib(prev => [newItem, ...prev])
  }, [lib])

  const watchingTv = lib.filter(x => x.status === 'watching' && x.type === 'tv')

  const MAIN_TABS = [
    { id: 'discover' as const, label: tr('DISCOVER', 'ОБЗОР'), icon: '🎬', color: C.amber },
    { id: 'library' as const, label: tr('MY LIBRARY', 'МОЯ БИБЛИОТЕКА'), icon: '📚', color: C.blue },
  ]

  return (
    <div className="fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>

      {/* Header */}
      <div style={{ padding: '8px 14px', flexShrink: 0, borderBottom: '1px solid rgba(255,107,0,0.14)',
        background: 'rgba(14,8,2,0.7)', display: 'flex', alignItems: 'center', gap: 11 }}>
        <FoxMascot size={42}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: FONT, fontSize: 13.5, fontWeight: 900, color: C.orange,
            letterSpacing: '0.18em', textShadow: `0 0 12px ${C.orange}` }}>GALACTIC PICTURES</p>
          <p style={{ fontFamily: FONT, fontSize: 11, color: 'rgba(255,107,0,0.45)', letterSpacing: '0.12em' }}>
            {tr('MOVIES · SHOWS · GAMES · RELEASES', 'ФИЛЬМЫ · СЕРИАЛЫ · ИГРЫ · РЕЛИЗЫ')}
          </p>
        </div>
        {/* Quick stats */}
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          {[
            { v: lib.filter(x => x.status === 'watching' && x.type !== 'game').length, l: tr('WATCHING', 'СМОТРЮ'), c: C.blue },
            { v: watchingTv.filter(x => x.episodes_released !== null && x.progress.episode < x.episodes_released!).length, l: tr('CATCH UP', 'ДОГНАТЬ'), c: C.green },
            { v: lib.filter(x => x.type === 'game').length, l: tr('GAMES', 'ИГРЫ'), c: C.purple },
          ].map(s => (
            <div key={s.l} style={{ textAlign: 'right' }}>
              <p style={{ fontFamily: FONT, fontSize: 15.5, fontWeight: 900, color: s.c, lineHeight: 1 }}>{s.v}</p>
              <p style={{ fontFamily: FONT, fontSize: 11, color: C.muted, letterSpacing: '0.1em', marginTop: 2 }}>{s.l}</p>
            </div>
          ))}
        </div>
        <button onClick={() => setShowAdd(true)} style={{
          width: 28, height: 28, borderRadius: 7, fontSize: 17.5, fontWeight: 700, flexShrink: 0,
          color: C.orange, border: '1px solid rgba(255,107,0,0.3)',
          background: 'rgba(255,107,0,0.1)', cursor: 'pointer', transition: 'all 0.15s',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,107,0,0.2)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,107,0,0.1)'}>+</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,107,0,0.12)', flexShrink: 0,
        background: 'rgba(8,5,2,0.5)' }}>
        {MAIN_TABS.map(t => (
          <button key={t.id} onClick={() => setMainTab(t.id)} style={{
            flex: 1, padding: '8px 4px', cursor: 'pointer',
            fontFamily: FONT, fontSize: 'var(--fs-xs)', fontWeight: mainTab === t.id ? 700 : 400,
            letterSpacing: '0.1em',
            color: mainTab === t.id ? t.color : 'rgba(148,163,184,0.35)',
            textShadow: mainTab === t.id ? `0 0 8px ${t.color}` : 'none',
            background: 'transparent',
            borderBottom: mainTab === t.id ? `2px solid ${t.color}` : '2px solid transparent',
            transition: 'all 0.15s',
          }}>{t.icon} {t.label}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 20px' }}>
        {mainTab === 'discover' && (
          <>
            {!tmdbKey() && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                borderRadius: 10, background: 'rgba(20,14,4,0.85)', border: '1px solid rgba(245,166,35,0.25)',
                marginBottom: 16 }}>
                <span style={{ fontSize: 17.5 }}>🎬</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontFamily: FONT, fontSize: 11.5, color: C.amber, fontWeight: 600 }}>
                    {tr('Add a TMDB key for posters, search & live data', 'Добавьте ключ TMDB для постеров, поиска и живых данных')}</p>
                  <p style={{ fontFamily: FONT, fontSize: 10, color: C.muted, marginTop: 2 }}>
                    {tr('Free at themoviedb.org/settings/api → Settings → Data Sources', 'Бесплатно: themoviedb.org/settings/api → Настройки → Источники данных')}</p>
                </div>
              </div>
            )}
            <UpcomingEpisodes lib={lib}/>
            <ScrollRow title={tr('Now in Cinemas', 'Сейчас в кино')} icon="🎥" color={C.amber}
              items={discover?.cinema ?? []} lib={lib}
              onAdd={item => addFromDiscover(item, 'watchlist')} loading={discoverLoading}/>
            <ScrollRow title={tr('Coming Soon This Month', 'Скоро в этом месяце')} icon="🗓" color={C.orange}
              items={discover?.comingSoon ?? []} lib={lib}
              onAdd={item => addFromDiscover(item, 'coming-soon')} loading={discoverLoading}/>
            <ScrollRow title={tr('Trending on Streaming', 'В тренде на стримингах')} icon="📡" color={C.blue}
              items={discover?.streaming ?? []} lib={lib}
              onAdd={item => addFromDiscover(item, 'watchlist')} loading={discoverLoading}/>
            <GamesView lib={lib} onAdd={item => addFromDiscover(item, 'watchlist')}/>
          </>
        )}

        {mainTab === 'library' && (
          <LibraryView lib={lib} onUpdate={updateItem} onRemove={removeItem}
            onMove={moveItem} onRequestReview={item => setReviewTarget(item)}/>
        )}
      </div>

      {showAdd && (
        <AddModal defaultStatus="watchlist" onClose={() => setShowAdd(false)} onAdd={addItem}/>
      )}
      {reviewTarget && (
        <RatingModal item={reviewTarget}
          onSubmit={review => { updateItem(reviewTarget.id, { review }); setReviewTarget(null) }}
          onSkip={() => setReviewTarget(null)}/>
      )}
    </div>
  )
}
