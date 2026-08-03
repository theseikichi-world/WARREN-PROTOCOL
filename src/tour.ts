// ─── Guided tours — one per surface ───────────────────────────────────────────
// Warren is eleven screens deep and almost nothing on them is labelled in a way
// a first-time visitor could guess. A tour runs the first time you open each
// surface: a few short cards, each optionally pointing at a real control.
//
// Anchoring is by `data-tour="key"` on the element. A step with no anchor still
// works — it just centres — so a surface can be explained before its controls
// are tagged, and tagging deepens it later without touching the copy.
//
// Seen-flags live in their own key so wiping progress replays every tour: after
// a reset you are a new user again, and that includes not knowing the app.

export interface TourStep {
  /** `data-tour` value to highlight. Omit for a centred card. */
  anchor?: string
  title:   string
  titleRu: string
  body:    string
  bodyRu:  string
}

export interface Tour {
  id:    string
  steps: TourStep[]
}

export const TOURS: Record<string, Tour> = {
  hub: {
    id: 'hub',
    steps: [
      { title: 'THIS IS THE HUB', titleRu: 'ЭТО ХАБ',
        body: 'Everything starts here. It shows what today needs and nothing it does not — the modules are one tap away on the right.',
        bodyRu: 'Всё начинается здесь. Показывает, что нужно сегодня, и ничего лишнего — модули справа, в один тап.' },
      { anchor: 'quest-panel', title: 'YOUR QUESTS', titleRu: 'ВАШИ ЗАДАНИЯ',
        body: 'The main line lives here. Each one says where it happens and takes you there — tap a quest rather than hunting for the screen. Finishing a stage is what raises your level; XP alone will not.',
        bodyRu: 'Основная линия здесь. Каждое задание говорит, где оно происходит, и переносит вас туда. Уровень поднимает завершение этапа, а не один только опыт.' },
      { anchor: 'bandwidth', title: 'BANDWIDTH', titleRu: 'ПОЛОСА',
        body: 'Two uplinks, no more. Dreams are unlimited and time is not, so this strip is the honest picture of what you are actually pursuing.',
        bodyRu: 'Два канала, не больше. Мечты бесконечны, время — нет, и эта полоса показывает, за чем вы правда идёте.' },
      { anchor: 'sidebar', title: 'INSTRUMENTS & UTILITIES', titleRu: 'ИНСТРУМЕНТЫ И УТИЛИТЫ',
        body: 'Above the divider: instruments — they build your character and feed the sheet. Below it: utilities, which serve the day and never touch a stat.',
        bodyRu: 'Над разделителем — инструменты: они строят персонажа. Под ним — утилиты: служат дню и не влияют на характеристики.' },
    ],
  },

  uplinks: {
    id: 'uplinks',
    steps: [
      { title: 'UPLINKS', titleRu: 'КАНАЛЫ',
        body: 'Your character, and the two goals you are actually chasing. Everything on the sheet is read off what you did — nothing here can be allocated.',
        bodyRu: 'Ваш персонаж и две цели, за которыми вы идёте. Всё на листе — отражение реальных действий, ничего нельзя распределить вручную.' },
      { anchor: 'life-support', title: 'LIFE SUPPORT', titleRu: 'ЖИЗНЕОБЕСПЕЧЕНИЕ',
        body: 'The floor: sleep, daylight, moving. Slots open as you level, because eight basics added at once is a list you abandon by Thursday.',
        bodyRu: 'Основа: сон, свет, движение. Слоты открываются с уровнями — восемь основ сразу превращаются в список, брошенный к четвергу.' },
      { anchor: 'uplink-tabs', title: 'PRIMARY & SECONDARY', titleRu: 'ОСНОВНОЙ И ВТОРИЧНЫЙ',
        body: 'Each uplink holds a protocol — a tree of routines. The second slot opens at level 5, and the secondary earns at 0.6×.',
        bodyRu: 'В каждом канале — протокол, дерево рутин. Второй слот открывается на 5 уровне и приносит 0.6× опыта.' },
      { title: 'A GOAL COMES FROM A DREAM', titleRu: 'ЦЕЛЬ РОЖДАЕТСЯ ИЗ МЕЧТЫ',
        body: 'You do not create one here. Write a dream in PATHFINDER and promote it — the guide proposes a chain of routines and you edit every node before a single habit exists.',
        bodyRu: 'Здесь его не создают. Запишите мечту в PATHFINDER и продвиньте её — гид предложит цепь рутин, а вы правите каждый узел до появления первой привычки.' },
    ],
  },

  log: {
    id: 'log',
    steps: [
      { title: 'PATHFINDER — THE DREAM INBOX', titleRu: 'PATHFINDER — ВХОДЯЩИЕ МЕЧТЫ',
        body: 'Write down everything you want, without filtering. This is the one place in Warren with no limit — the narrowing happens later.',
        bodyRu: 'Записывайте всё, чего хотите, без фильтра. Единственное место в Warren без ограничений — сужение произойдёт позже.' },
      { title: 'THEN PROMOTE ONE', titleRu: 'ЗАТЕМ ПРОДВИНЬТЕ ОДНУ',
        body: 'PROMOTE TO UPLINK turns a dream into a protocol of daily routines. Two dreams can hold a slot at a time; that choice is the whole game.',
        bodyRu: 'ПРОДВИНУТЬ В КАНАЛ превращает мечту в протокол ежедневных рутин. Слот держат две мечты — этот выбор и есть вся игра.' },
    ],
  },

  scrap7: {
    id: 'scrap7',
    steps: [
      { title: 'ORBIT — WHAT COMES ROUND', titleRu: 'ORBIT — ЧТО ВОЗВРАЩАЕТСЯ',
        body: 'One list: things that have to happen. Some come back — mark them REPEATS and they return when you complete them. Nothing here is scored and nothing here builds you; that lives in UPLINKS.',
        bodyRu: 'Один список: то, что должно случиться. Часть возвращается — отметьте ПОВТОРЯЕТСЯ, и задача вернётся после выполнения. Здесь ничего не оценивается и не строит вас — это в UPLINKS.' },
      { title: 'AND WHEN IT LANDS', titleRu: 'И КОГДА ЭТО ЛЯЖЕТ',
        body: 'TIMELINE lays the same list across your actual waking hours and shows the free time left over. It owns nothing — it is this list, seen as a day.',
        bodyRu: 'ТАЙМЛАЙН раскладывает тот же список по вашим реальным часам бодрствования и показывает свободное время. Он ничем не владеет — это тот же список, но как день.' },
    ],
  },

  solaris: {
    id: 'solaris',
    steps: [
      { title: 'SOLARIS — THE KITCHEN', titleRu: 'SOLARIS — КУХНЯ',
        body: 'It starts as hydration and nothing else. Log water for five days and calories open; keep going and macros, then the pantry, follow.',
        bodyRu: 'Начинается только с воды. Пять дней записи — откроются калории; дальше макросы, затем кладовая.' },
      { title: 'IT OPENS BY USE', titleRu: 'ОТКРЫВАЕТСЯ ОТ ИСПОЛЬЗОВАНИЯ',
        body: 'Firmware tiers cannot be bought or skipped. What is hidden is only ever extra surface — whatever you need today is already here.',
        bodyRu: 'Уровни прошивки нельзя купить или перескочить. Скрыто только лишнее — всё нужное сегодня уже здесь.' },
    ],
  },

  journal: {
    id: 'journal',
    steps: [
      { title: "THE CAPTAIN'S JOURNAL", titleRu: 'ЖУРНАЛ КАПИТАНА',
        body: 'Write one entry, any length. It feeds INSIGHT on your character sheet and it is the instrument that tells you what the numbers cannot.',
        bodyRu: 'Одна запись, любой длины. Питает ОСОЗНАННОСТЬ на листе персонажа и говорит то, чего не скажут цифры.' },
    ],
  },

  ardo: {
    id: 'ardo',
    steps: [
      { title: 'A.R.D.O — MEMORY', titleRu: 'A.R.D.O — ПАМЯТЬ',
        body: 'Paste a text and drill it until it is yours. Spaced repetition decides when to show each line back to you.',
        bodyRu: 'Вставьте текст и отрабатывайте, пока он не станет вашим. Интервальное повторение решит, когда показать строку снова.' },
    ],
  },

  pictures: {
    id: 'pictures',
    steps: [
      { title: 'GALACTIC PICTURES', titleRu: 'GALACTIC PICTURES',
        body: 'Films, shows and games you are tracking. A utility: it serves the day and never touches a stat, so nothing here is a chore.',
        bodyRu: 'Фильмы, сериалы и игры, за которыми вы следите. Утилита: служит дню и не влияет на характеристики.' },
    ],
  },
}

// ─── Seen state ───────────────────────────────────────────────────────────────

const KEY = 'warren_tours_v1'

export function seenTours(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed as Record<string, string> : {}
  } catch {
    return {}
  }
}

export const hasSeenTour = (id: string): boolean => !!seenTours()[id]

export function markTourSeen(id: string): void {
  try { localStorage.setItem(KEY, JSON.stringify({ ...seenTours(), [id]: new Date().toISOString() })) }
  catch { /* quota */ }
}

/**
 * Replay everything — Settings offers this, and a reset gets it for free.
 * Reloads, because tours are also guarded per-session in memory (see RouteTour)
 * and clearing the flags alone would not bring them back until the next launch.
 */
export function forgetTours(): void {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}

/** Which tour belongs to a route, if any. */
export function tourForPath(pathname: string): Tour | null {
  if (pathname === '/') return TOURS.hub
  const key = Object.keys(TOURS).find(k => k !== 'hub' && pathname.startsWith(`/${k}`))
  return key ? TOURS[key] : null
}
