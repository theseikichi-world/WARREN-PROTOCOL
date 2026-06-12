# WARREN — Dev Log
> Tauri v2 + Vite + React 19 + TypeScript desktop app. No Tailwind. All inline styles.
> localStorage for persistence. No backend. No Supabase.
> This file is the handoff document for new context windows.

---

## Stack

| Layer       | Tech                                  |
|-------------|---------------------------------------|
| Shell       | Tauri v2 (Rust backend)               |
| Frontend    | Vite + React 19 + TypeScript          |
| Routing     | React Router v6                       |
| Styling     | Inline styles only — no Tailwind      |
| State       | localStorage (key per module)          |
| AI          | **Claude only** — official `@anthropic-ai/sdk` via `aiChat()` in `src/settings.ts` |
| Icons       | Custom SVG components in `src/components/CyberIcon.tsx` |
| Font        | `var(--font)` — monospace/cyberpunk   |

**Project root:** `C:\Users\Seikichi\Projects\warren`
**Dev server:** `npm run tauri dev` (or use `start.bat`)
**Type check:** `npx tsc --noEmit`

---

## Architecture

### Entry point
- `src/main.tsx` → `src/App.tsx`
- `App.tsx`: IntroScreen (matrix boot animation) → TitleBar + Sidebar + `<Routes>`

### Guild system
- `src/guild.ts`: defines `ModuleId` and `GUILD` array (all 11 members)
- Sidebar renders guild members; clicking routes to their module

### Module routing
```
/scrap7/*  → src/modules/scrap7/Scrap7.tsx
/log/*     → src/modules/log/Log.tsx
/ardo/*    → src/modules/ardo/Ardo.tsx
/ravi, /hoot, /otty, /pomu, /kana, /maggi, /pavi, /ferri → stub (locked or "In development")
```

### Cross-module sync
L.O.G → SCRAP-7: writes directly to `scrap7_v3` localStorage key, then:
```ts
window.dispatchEvent(new CustomEvent('warren:sync', { detail: { source: 'log' } }))
```
SCRAP-7 listens in `useEffect` and reloads from localStorage.

---

## Modules Built

### 1. SCRAP-7 — Lucky Akki (Raccoon)
**Neon:** `#00ff88`
**localStorage key:** `scrap7_v3`
**Path:** `/scrap7`

**Algorithm:** Loop Habit Tracker exponential smoothing
- `score` ∈ [0.0, 1.0] (was `strength` 0-100; migrated in `loadState`)
- On hit: `score = score * (1 - ALPHA) + ALPHA` where `ALPHA = 0.05`
- On miss: `score = score * (1 - ALPHA)`
- Tiers: new (<1%) → spark → forming → building → strong → hardened → forged

**Key files:**
- `src/modules/scrap7/types.ts` — `Habit`, `Task`, `getHabitTier(score)`, `SPRINT_INTERVALS_MIN`
- `src/modules/scrap7/store.ts` — `trackHabit`, `applyDailyReset`, `skipHabitDay`
- `src/modules/scrap7/Scrap7.tsx` — main UI, HabitCard, command bar
- `src/modules/scrap7/commandParser.ts` — natural language parsing (with typo tolerance)

**Command flow (two tiers):**
- **Tier 1 (`commandParser.ts`, regex, instant):** only handles *unambiguous* commands — greetings, complete/track, delete, list, count, next, explicit `add X to habits/daily/todo`, `every <weekday> X`, `remind me to X`, bare `add X` (→ modal). Conversational/ambiguous input deliberately falls through.
- **Tier 2 (AI, `scrap7.assistant` model):** returns **structured JSON** `{ reply, tasks: [{ text, type, category, schedule, days }], delete: [number] }`, parsed by `parseScrap7Json()`. The model picks the type (todo = finite project, daily = endless routine, habit = streak-tracked behaviour), gives a clean imperative title, and dedups against existing tasks. Existing tasks are passed **numbered**; the model removes/re-tabs by putting those numbers in `delete` (processed before creates, so "move to another tab" = delete old # + add corrected). Client-side `fuzzyMatchTask` is a second dedup safety net before `createTask`.
- Removed the old greedy `"i want to…"` / `"can you add…"` regex that used to mangle sentences into badly-named habits.

**Features:**
- HabitCard: done = dimmed + checkmark glow (no strikethrough)
- Skip button (—) on hover
- warren:sync listener for L.O.G task sync

---

### 2. L.O.G — Long-range Objective Graph (Beaver)
**Neon:** `#c084fc`
**localStorage key:** `log_v1`
**Path:** `/log`

**Hierarchy:** Dream → Mission → Task (todo / daily / habit)

**Key files:**
- `src/modules/log/types.ts` — `Dream`, `Mission`, `LogTask`, `Signal`, `LogTaskType`
- `src/modules/log/store.ts` — CRUD, `syncTaskToScrap7()`
- `src/modules/log/Log.tsx` — star tree UI, `AnalysisPanel`, AI integration

**Priority = list order (top = #1).** Each dream card has **▲ / ▼ buttons** beside its `#n` badge (`moveDream(state, id, ±1)` swaps with the neighbor). This replaced the HTML5 drag-to-rank, which didn't fire reliably in the Tauri WebView. (An interactive drag star-map was prototyped then removed — the user preferred the list.)

**Per-dream AI analysis (persisted):**
- Button: "🦫 ANALYZE WITH L.O.G" → `aiChat()` with `LOG_ANALYSIS_SYSTEM`
- Returns `{ analysis, missions: [{ title, description, priority, deadline_days, tasks: [{ text, type }] }] }`
- **Persisted on `dream.analysis`** (`setDreamAnalysis`/`clearDreamAnalysis`) — survives tab switches (was the lost-on-unmount bug). `AnalysisPanel` "added" state is idempotent (checks existing missions/tasks), so reopening won't double-add.
- Task names are constrained to short imperative phrases (clean SCRAP-7 names).

**Constellation synthesis (cross-dream):**
- Header "⟡ SYNTHESIZE" (≥2 dreams) → `aiChat()` with `CONSTELLATION_SYSTEM`, dreams sent in priority order.
- Returns `{ synthesis, links: [{ dreams[], insight }], plan: [{ text, type, serves }] }` → persisted on `state.constellation`.
- `ConstellationPanel` shows the synthesis, interconnections, and a unified plan; each plan item deploys to SCRAP-7 individually or "DEPLOY ALL". `PlanItem.deployed` flag prevents dup re-deploys.

**SCRAP-7 sync:** `syncTaskToScrap7()` / `syncPlanItemToScrap7()` are thin wrappers over SCRAP-7's **`createExternalTask()`** (scrap7/store) — the single owner of the Task shape. It loads via `loadState` (so migrations apply), upserts by id, persists, and dispatches `warren:sync`. L.O.G no longer hand-builds Task objects or raw-writes `scrap7_v3`. Provenance is typed: `Task.logMission` / `Task.logDream`.

---

### 3. A.R.D.O — Adaptive Recall & Drilling Operator (Turtle)
**Neon:** `#00e4a0`
**localStorage key:** `ardo_v1`
**Path:** `/ardo`

**Algorithm stack:**
- SM-2 spaced repetition: `newEF = max(1.3, EF + 0.1*score - 0.08*(4-score)^2)`
- Ebbinghaus: `R(t) = e^(-t/S)` where `S = intervalDays / -ln(0.9)`
- Sprint (intra-day): stages at 0, 20min, 1hr, 4hr, 8hr, 1day, 3day, 7day

**Key files:**
- `src/modules/ardo/types.ts` — all types, `SPRINT_INTERVALS_MIN`, `SPRINT_STAGE_LABELS`
- `src/modules/ardo/store.ts` — `addText`, `autoChunk`, `startSprint`, `advanceSprint`, `markTextLearned`, `reviveText`, SM-2 logic, exports `type ArdoState`
- `src/modules/ardo/Ardo.tsx` — full UI

**Text types:** poem | monologue | role | song | prose
**Languages:** RU | EN | CN | other

**Chunking (autoChunk):**
- poem/song → split on double newline (stanzas/verses)
- role → detect `CHARACTER:` markers
- prose → paragraph groups (every 2 paras)

**Session modes:**
- LEARN — show chunk, listen (TTS), advance
- RECALL — first line cue → hint 30% → reveal → rate 1-4
- SPRINT — intra-day SRS with live countdown badge
- FULL RUN — whole text, blank stage + number prompter sidebar
- KARAOKE (songs only) — see below

**Status system (no delete):**
- `status: 'active' | 'learned'`
- "✦ LEARNED" button on hover (glows gold when all chunks mastered)
- `markTextLearned()` / `reviveText()` — soft archive only
- Learned texts go to REPERTOIRE tab (gold styling)

**Memory Curve (SVG):**
- Per-text Ebbinghaus visualization
- Chunk heatmap (green=≥75%, yellow=50-75%, orange=25-50%, red=<25%, grey=new)
- 50% retention danger line
- Sprint dot on curve when sprint active

**Dashboard tabs:** ACTIVE | REPERTOIRE

**TTS:** `speak(text, lang)` via Web Speech API, rate 0.85

---

### KARAOKE Mode (A.R.D.O — songs only)
**Trigger:** `🎵 KARAOKE` button on song-type TextCard + REPERTOIRE GloryCard

**How it works:**
- Flattens all chunks into individual lines (splits on `\n`)
- Displays 1 line at a time: 2 previous (dimmed), current (large + amber glow), 3 upcoming (fading)
- Advance: tap anywhere / SPACE / → arrow / TAP button
- Back: ← arrow / PREV button
- Restart: ↺ button
- ESC to exit

**Auto-advance (BPM mode):**
- Input BPM + bars per line (1 / 2 / 4)
- Calculates ms per line: `(60/BPM) * 4 * bars * 1000`
- Manual tap resets timer (re-syncs to beat)

---

### 4. SOLARIS — The Solar System's Kitchen (Panda)
**Neon:** `#ffb13c` (solar gold) + `#ff7a45` (warm orange)
**localStorage key:** `solaris_v1`
**Path:** `/solaris` — but guild `id` is still `'pomu'` (so CyberIcon `case 'pomu'` + entitlements keep working)
**Lore:** orbital agri-station that grows fresh food in space and delivers personalised meals calibrated to each crew member's body + goal.

**Key files:**
- `src/modules/solaris/types.ts` — `SolarisProfile`, `FoodEntry`, `DayLog`, `Targets`, `computeTargets()`, `sumDay()`, meta tables
- `src/modules/solaris/store.ts` — load/save, `setProfile`, `addEntry`, `removeEntry`, `getDay`, `getStreak`, exports `type SolarisState`
- `src/modules/solaris/Solaris.tsx` — full UI

**Nutrition math (`computeTargets`):**
- BMR = Mifflin–St Jeor: `10*kg + 6.25*cm - 5*age + (male? +5 : -161)`
- TDEE = BMR × activity factor (pod 1.2 / light 1.375 / standard 1.55 / active 1.725 / pilot 1.9)
- Target kcal = TDEE + goal adj (cut -500 / maintain 0 / bulk +350), floored at 1200
- Protein = weight × (cut 2.2 / bulk 2.0 / maintain 1.8) g/kg
- Fat = 27% of kcal ÷ 9; Carbs = remaining kcal ÷ 4

**Screens:**
- **Onboarding / CREW CALIBRATION** — vitals + sex + activity + goal + diet pref, with live ration preview. Shown automatically when `profile === null`.
- **Dashboard** — `OrbitRing` (SVG circular calorie ring with dotted orbit), 3 `MacroBar`s, delivery CTA, meal manifest grouped by slot (DAWN CYCLE / SOLAR NOON / DUSK CYCLE / ORBIT SNACK)
- **AddFoodForm** — overlay; name + calories + P/C/F + slot
- **DeliveryPanel** — AI meal synthesis (see below)
- Profile re-calibration via ⚙ button

**AI Delivery (`DeliveryPanel`):**
- "🛰️ SYNTHESISE DELIVERY" → `aiChat()` with `DELIVERY_SYSTEM` prompt
- Sends REMAINING budget (target − consumed) + goal + diet pref
- AI returns JSON array of meals: `{ name, slot, calories, protein, carbs, fat, why }`
- Robust parse: strips ``` fences, slices first `[` … last `]`
- Each meal has "⬇ ACCEPT DELIVERY" (adds to today's log) + "ACCEPT ALL & CLOSE"

**Streak:** consecutive days with ≥1 logged entry; an unlogged "today" doesn't break it.

---

### 5. INFINITY-8 PROTOCOL — the day that flows endlessly (Raven)
**Neon:** `#22d3ee` (infinity cyan)
**localStorage key:** `infinity8_v1`
**Path:** `/infinity8` (guild `id` stays `'ravi'` — reuses the old MYSTIC RAVI slot, icon, entitlement)
**Concept:** a **conductor** module — owns no tasks. It reads commitments from other modules, lays them on a day timeline around fixed life-anchors, and surfaces the **FREE TIME** left so you can relax guilt-free.

**Key files:**
- `src/modules/infinity8/store.ts` — `Inf8State` (anchors, durations, events), `buildDay()` scheduler, `getTodayCommitments()` (reads SCRAP-7), time helpers
- `src/modules/infinity8/Infinity8.tsx` — timeline UI, anchor + event sheets

**Data flow (read-only aggregation):**
- Reads SCRAP-7 (`loadState`, `todayScheduledDailies`): due dailies (`done = completed`) + positive habits (`done = lastTrackedDate===today && todayCount>=target`). Default 20 min each (overridable in `state.durations`).
- Toggling a commitment in the calendar writes back to SCRAP-7 (`completeTask`/`uncompleteTask`/`trackHabit`) + dispatches `warren:sync`. Listens for `warren:sync` to refresh.

**`buildDay(anchors, commitments, events)`:** places meals/work/events as fixed blocks, computes free gaps in `[wake, sleep]`, greedily fills gaps with commitments, returns ordered `blocks[]` + `freeMinutes` + done counts. Overflow commitments stack past sleep.

**The guilt-free core:** headline is **FREE TODAY** (green), plus a banner that flips to **"✓ DAY CLEARED — the next Xh are yours, go enjoy them guilt-free"** when all commitments are done. Progress ring shows done/total.

**Built (v1):** single-day timeline, anchors editable in a sheet, one-off events, check-off commitments.

**Built (v2 — smart layer):**
- **Sleep config:** wake + bedtime + quick 6/7/8/9h buttons (sets bedtime = wake − Nh); `sleepHours()` shows current length.
- **Breaks:** `anchors.breakMin` (0/5/10/15) → `buildDay` inserts slim rest dividers between consecutive activities.
- **Circadian ordering (deterministic):** `classifyPeriod()` keyword-tags each commitment (workouts→afternoon, focus/learning→morning, …); `buildDay` orders by `PERIOD_RANK` so morning-suited items land in earlier gaps. Pinned times persist in `state.prefTime`.
- **Adaptation:** "😴 OVERSLEPT — RESHUFFLE" sets a today-only `overrides[date].wake = now`; `effectiveAnchors()` reflows the whole day from now. Events ("something came up") already reflow around fixed blocks. RESET clears the override.
- **⚡ OPTIMIZE WEEK (AI, bidirectional):** `aiChat` with `OPTIMIZE_SYSTEM` (chronobiology-aware). Sends wake/sleep + all recurring SCRAP-7 commitments with their current schedule. Returns `{ rationale, changes:[{id,days,bestTime,note}], additions:[{text,type,days,bestTime,note}] }`. `OptimizePanel` shows it; **APPLY writes back into SCRAP-7** — `updateTask(id,{schedule})` to spread dailies across the week (e.g. MWF / TThSa, rest day) and `createTask` for fun/mobility additions; best-time pins to `prefTime`. AI task id `infinity8.optimize` (default Sonnet, in `AI_TASKS`).

**Built (v3 — proportional timeline):** the day renders to scale — block **height = duration** (`PPM = 1.75` px/min; 1h ≈ 105px) against an **hour grid** (labels in a left gutter, `TOP_PAD` for the WAKE cap), red **now-line**. Fonts at `var(--fs-sm)` with text-shadow for contrast over the wallpaper; badges only on tall (≥44px) blocks; breaks are faint dividers; free gaps render proportionally (you see how big they are). `Timeline` + `TimelineBlock` (absolute-positioned) replaced the fixed-height list.

**Current-block highlight:** the block containing "now" glows (full-color border + `0 0 14px` shadow + bold label + pulsing **● NOW** pill).

**Hub integration:** `getNowSnapshot()` (store) builds today's plan and returns `{ current, next, freeMinutes, doneCount, committedCount, awake }`. `App.tsx` `NowCard` (replaced the stale MYSTIC RAVI card) shows "● HAPPENING NOW / ● FREE NOW", the current activity + time left (or next-up), and FREE TODAY; click → `/infinity8`. Refreshes on `warren:sync` / focus / 30s.

**OPTIMIZE was invisible — fixed:** APPLY wrote `schedule` onto SCRAP-7 habits correctly, but (a) `HabitCard` never displayed a schedule, and (b) neither SCRAP-7 nor INFINITY-8 filtered habits by weekly schedule — so changes were saved but inert/invisible (and most items were habits). Fixes: `HabitCard` + daily card now show a cyan **day badge** (e.g. `Mo We Fr`); `getTodayCommitments` filters positive habits by today's weekday (`dueToday`), so the timeline thins per day after OPTIMIZE. (Dailies already used `todayScheduledDailies`.)

**Readability over transparent window:** the app root is `rgba(6,11,22, opacity)` (desktop shows through). INFINITY-8 timeline got a scrim panel + opaque block bases (dark base + inset color tint) + opaque banner so content reads over any wallpaper.

**Deferred:** week grid view, L.O.G gap-filling, SOLARIS meal-time pull, A.R.D.O review blocks.

---

### 6. GALACTIC PICTURES — Movies · Shows · Games (Fox)
**Neon:** `#ff6b00` (fox orange) · **Guild:** NEW 12th member `id: 'foxy'`, unit GPX, path `/pictures`
**localStorage:** `pictures_v1` (auto-migrates old `foxy-library`), caches: `pictures_discover_v1`, `pictures_games_v1` (30-min TTL)
**Origin:** full port of **Muppet Foxy** from old Guildhall (`app/dashboard/foxy` + `app/api/foxy/*`) — every feature kept, UI restyled to Warren (opaque cards over transparent window, var(--font), compact).

**Key files:**
- `src/modules/pictures/types.ts` — MediaItem (statuses, review, watchedEps/epRatings/seasonRatings), DiscoverItem, REVIEW_CATS, genre→emoji/mood maps (`vibeFor`)
- `src/modules/pictures/api.ts` — data layer
- `src/modules/pictures/Pictures.tsx` — full UI

**API rework (old Next.js server routes → direct CORS-friendly calls):**
- **TMDB** (key in Settings → Data Sources): search/multi, movie+tv details w/ credits+external_ids (replaces IMDB scraping — better data), season episode lists, now_playing / upcoming / trending-tv discover
- **RAWG** (key in Settings): top-rated / new / upcoming games w/ Metacritic; local `vibeFor` enrichment (no AI tokens)
- **IMDB suggestion API** tried first for search (rich autocomplete), TMDB fallback
- **Claude fallback** (`pictures.metadata` AI task, Haiku) for title details only when no TMDB key
- Dropped (CORS-impossible in webview): kino.kz scraper, IMDB page scraping, Steam store API

**Features (all preserved from Foxy):**
- Animated fox ragdoll mascot (sway/ear-twitch/tail-wag/blink/float)
- **Discover:** Your Upcoming (catch-up + next-ep countdown), Now in Cinemas, Coming Soon This Month, Trending on Streaming, 3 game rows — horizontal scroll rows w/ arrows + skeletons; "✓ In Library" dedup
- **Add modal:** search → candidate chips → full detail preview → status picker → add. Auto coming-soon for future releases
- **Library:** stats bar, search, collapsible sections (Now Watching/Watchlist/Finished/Coming Soon/My Games), films/series sub-grouping, avg review score in Finished
- **Library card:** poster, type badge, season/ep progress + "(N watched)", season-rating chips, "🍿 N new", next-ep countdown, air schedule; expanded: review box, synopsis, credits, IMDB link, **↻ Refresh data** (TMDB re-fetch), **per-season episode list** (season tabs, watched toggles → progress, per-ep 5-dot ratings, +N upcoming expand), **caught-up/season-done 1-10 rating prompt**, **finished-show banner → Mark as Watched**, 5-star rating, notes, type toggle, move/remove
- **Rating modal:** 5 categories ×10 per type (movie/tv/game sets), overall + verdict, comment — auto-prompts on move-to-watched

---

### 7. CAPTAIN'S JOURNAL — Diary & Log (Owl)
**Neon:** `#ffd700` (captain's gold) · **Guild:** reuses `id: 'hoot'` (WISE HOOT renamed; owl = first officer), path `/journal`
**localStorage:** `journal_v1`

**Key files:** `src/modules/journal/store.ts` (entries, streak, sticker collection), `src/modules/journal/Journal.tsx`

**Core principle:** `entry.raw` (the user's words) is **never modified or lost**. AI adds alongside it.

**Flow:** ✍️ Composer ("TODAY'S PAGE IS BLANK" CTA, stardate header) → "✨ ENHANCE & SEAL" or "SEAL AS-IS" (no AI). **Seal is instant** — the entry lands in the log immediately; enhancement then **streams onto the card live** ("🦉 THE OWL IS POLISHING…" box with typing cursor).

**Streaming format** (`journal.enhance` AI task, Sonnet, responds in the entry's language): polished prose first (streamed via `aiStream`), then a `<<<DEBRIEF>>>` marker, then metadata JSON `{ stickers×3-5, mood, themes, reflection }` parsed at stream end (`parseEnhanceOutput`, tolerates a missing marker or old-style full-JSON replies). `aiStream` in settings.ts is the SSE helper: same request as `aiChat` + `stream: true`, `onText(full)` per delta, one retry on transient pre-stream errors, mid-stream drop returns partial text.

**Features:**
- **RAW / ✨ toggle** per entry — switch between original and polished text
- **Stickers** — physical-sticker styling (cream bg, white border, random rotation, hover pop) strewn across the card's top edge; **🎟 Sticker Collection** sheet shows every unique sticker earned
- **🦉 First-Officer's Debrief** — AI reflection box (2-4 warm sentences) + #theme chips, mood emoji/color tints the card
- Day-log streak 🔥, re-enhance, "burn page" delete, entries newest-first

---

## Settings

**File:** `src/settings.ts`
**Key:** `warren_settings`

```ts
type Settings = {
  // ...appearance/behavior fields...
  aiApiKey: string   // Anthropic key, sk-ant-...
  aiModel:  string   // one of CLAUDE_MODELS ids
}
```

**AI provider:** Claude only (all OpenAI/Groq/LM Studio/freecc code removed).
**SDK:** `@anthropic-ai/sdk`, called with `dangerouslyAllowBrowser: true` (Tauri webview is a browser context — adds the `anthropic-dangerous-direct-browser-access` header). Key lives only in `localStorage`.

**Models (`CLAUDE_MODELS`):**
- `claude-haiku-4-5` — fastest / cheapest
- `claude-sonnet-4-6` — balanced (**default**, `DEFAULT_MODEL`)
- `claude-opus-4-8` — most capable / priciest

**Function:** `aiChat(messages, settings, { maxTokens?, model? })` — direct `fetch` to `https://api.anthropic.com/v1/messages`. Maps `system` role out, sends rest as user/assistant turns. No `temperature`/`thinking` (keeps it valid across all three models). System prefix gets `cache_control: ephemeral` (opportunistic token reuse; no-op below the model's min cacheable size). Friendly errors (401 = bad key, 429 = rate limit, out-of-credit hint).

**Per-task model routing (`AI_TASKS` + `modelForTask`):**
- `settings.taskModels: Record<taskId, modelId>` — per-task overrides; resolver falls back to the task's `defaultModel`, then global `aiModel`.
- Tasks + defaults: `scrap7.assistant` → **Haiku 4.5**, `solaris.delivery` → **Sonnet 4.6**, `log.analysis` → **Opus 4.8**.
- Each call site passes `{ model: modelForTask(settings, '<id>') }`. L.O.G uses `maxTokens 2048`, Solaris `1536`, default `1024`.
- SettingsPanel shows a "Per-task models" section (one `<select>` per task) when a key is set.

**Migration in `loadSettings()`:** old `aiProvider`/`aiBaseUrl` ignored; non-`claude-*` `aiModel` (e.g. `gpt-4o-mini`) reset to default; non-`sk-ant-` key cleared.

**SettingsPanel:**
- Orange warning when no key
- Green "Claude connected · <model>" when key set
- Key input (`sk-ant-...`) + 3-button model picker

---

## Guild Roster (guild.ts)

| ID      | Name    | Animal  | Role              | Neon      | Status      |
|---------|---------|---------|-------------------|-----------|-------------|
| scrap7  | SCRAP-7 | Raccoon | Habit Engineer    | #00ff88   | ✅ Built     |
| ravi    | INFINITY-8 | Raven | Time Protocol   | #22d3ee   | ✅ Built (id stays `ravi`, path `/infinity8`) |
| log     | L.O.G   | Beaver  | Goal Scientist    | #c084fc   | ✅ Built     |
| ardo    | A.R.D.O | Turtle  | Memory Trainer    | #00e4a0   | ✅ Built     |
| hoot    | WISE HOOT | Owl   | Diary/Journal     | #60a5fa   | stub        |
| otty    | SWIFT OTTY | Otter | Exercise         | #f97316   | stub        |
| pomu    | SOLARIS | Panda  | Solar Kitchen     | #ffb13c   | ✅ Built (id stays `pomu`, path `/solaris`) |
| kana    | SUNNY KANA | Cat  | Weather/AQI       | #fbbf24   | stub        |
| maggi   | CLEVER MAGGI | Magpie | News/Telegram | #a78bfa   | stub        |
| pavi    | FANCY PAVI | Peacock | Acting Routine | #34d399   | stub        |
| ferri   | SLY FERRI | Ferret | Casting Bot     | #e879f9   | stub        |

---

## Known Bugs / Edge Cases

- SM-2: first reviews use fixed intervals (`INIT_INTERVALS`) before algorithm stabilizes
- Sprint + standard SRS are separate — sprint doesn't feed into SM-2 cards
- `autoChunk` for `role` type detects `CHARACTER:` pattern; edge cases with non-standard formatting
- Karaoke BPM auto-advance may drift if user taps mid-interval (timer resets on manual tap)

---

## Pending Features

- [ ] Performance mode (audio recording + playback comparison in A.R.D.O)
- [ ] Onboarding calibration test (5-min retention test to set learning pace)
- [ ] Tauri push notifications for A.R.D.O review reminders
- [ ] WISE HOOT (diary/journal)
- [ ] SWIFT OTTY (exercise tracker)
- [ ] HAPPY POMU (food/calories)
- [ ] SUNNY KANA (weather/AQI)
- [ ] CLEVER MAGGI (news/Telegram)
- [ ] FANCY PAVI (acting routine)
- [ ] SLY FERRI (casting bot)
- [ ] MYSTIC RAVI (AI daily briefing)

---

## Tooling

- **Lint:** `npm run lint` — ESLint 9 flat config (`eslint.config.js`): typescript-eslint
  recommended + react-hooks + react-refresh. `no-explicit-any` off; unused-vars warn (allows `_` prefix).
- **Tests:** `npm test` (vitest, node env, `src/**/*.test.ts`). 34 tests cover the fragile pure math:
  `computeTargets`/`sumDay` (SOLARIS), `buildDay`/`classifyPeriod`/`sleepHours`/time-helpers (INFINITY-8),
  `applyReview` SM-2 (A.R.D.O), `getHabitTier` (SCRAP-7). Add a test when you touch store math.
- **Build:** `npm run build` (`tsc && vite build`). Test files type-check but aren't bundled.

---

## Changelog

### 2026-06 (Session 4, hardening pass)
- **SOLARIS favourite dishes**. New shared `favorites: SavedDish[]` on state (migrated in as `[]`).
  Each AI-suggested dish now has a ☆/★ toggle to save it; `saveFavorite` (dedupes by name) /
  `removeFavorite` store helpers. New `FavoritesScreen` (reached via a "★ SAVED DISHES (N)" button
  on the dish panel's empty state) lists saved dishes with full macros, pantry chips, expandable
  recipe and YouTube link, and "⬇ I ATE THIS" to re-log straight to the manifest (via the
  loop-safe `persistWith`). +1 test (save/dedupe/remove) → 65 total; verified live in preview.
- **SOLARIS smart-kitchen upgrades** (on top of the AI suite):
  - **Servings multiplier** — a "🍽 EATING 1/2/3/4" stepper on the dish panel. The prompt scales
    recipe ingredient amounts to that many servings while keeping macros per single serving (so
    logging still records one person's portion).
  - **Recipe + YouTube** — each suggested dish now returns 3-6 scaled cooking steps (expandable
    "👨‍🍳 RECIPE") and a "▶ YOUTUBE" search link for a how-to video.
  - **Pantry analyzer** (`PantryAnalyzer`, new `solaris.analyze` Sonnet task, reached via 🔬 ANALYSE
    on the pantry screen) — reads the pantry against the active member's targets and returns a plain
    summary, a **coverage** list (each macro/food-group flagged good/low/missing with a colour dot),
    and a **cost-tiered shopping list** (CHEAP/MID/PREMIUM badges) honouring a THRIFTY/BALANCED/PREMIUM
    budget toggle; each suggestion has a "+ PANTRY" to add it. tsc/build/lint clean, 63 tests; all
    new screens verified live in preview.
- **SOLARIS AI suite — meal logging, photos, pantry → dishes**.
  - **Vision helper**: refactored the shared POST+retry out of `aiChat` into `postWithRetry`;
    added `aiVision(system, text, images, settings)` and `aiVisionJson<T>` that send base64
    image content blocks (images-before-text, per Anthropic guidance). New `ImageInput` type;
    `parseJsonLoose` shared by aiJson/aiVisionJson. New `image.ts` util downscales any photo to
    ≤1024px JPEG base64 to keep tokens/upload sane. AI_TASKS gained `solaris.mealparse` (Sonnet)
    and `solaris.pantry` (Haiku); `solaris.delivery` relabelled "dishes".
  - **Log a meal**: `MealLogPanel` — type *and/or* snap what you ate → AI returns FoodEntry-shaped
    items → review cards → add individually or all. Text path uses `aiJson`, photo path
    `aiVisionJson`.
  - **Shared pantry**: `PantryScreen` — add items by hand (name+qty) or **scan a grocery photo**
    (vision → bulk add, dedup case-insensitive). Store gained `addPantryItems`. Reached via a 🧺
    header button.
  - **"What should I eat?"** (absorbs the old delivery): `DeliveryPanel` is now pantry-aware —
    when the pantry has items it suggests dishes built mainly from them and tags each dish with the
    🧺 items it "uses"; empty pantry falls back to budget-only ideas. Accept = "I ate this" → logs it.
  - +1 pure test (pantry add/bulk/dedupe/remove) → 63 total. tsc/build/lint clean; all three
    screens verified live in preview (AI calls themselves need the user's key).
- **SOLARIS hydration → weighted drinks log**. Water is no longer a single ml number;
  each member's `water` is now a per-day `DrinkEntry[]`. New `DRINKS` table gives every
  drink a hydration `factor` (water 100%, tea 90%, juice/milk 85–90%, coffee 80%) and a
  default serving; `effectiveHydration()` sums ml×factor so the meter reflects *real*
  hydration. UI: ½-cup quick-add (`HALF_CUP_ML`), per-drink chips (💧☕🍵🧃🥛), a custom
  amount field, and an expandable day log showing each drink with its weighted value and a
  remove ✕. Store API swapped `getWater/addWater` → `getDrinks/addDrink/removeDrink`;
  `loadSolarisState` migrates any legacy numeric water total into a single water entry.
  +1 test (weighted log + legacy-water migration) → 62 total. Verified live (coffee 200→160,
  tea 200→180). Decisions logged: "Request today's delivery" will be **merged into the
  upcoming pantry→dishes** feature (one "what should I eat?" suggester); hydration is weighted.
- **SOLARIS → family households (foundation pass)**. State refactored from a single
  `{ profile, days }` to a crew: `SolarisState = { members: Member[], activeMemberId, pantry }`
  where each `Member` owns its own profile, food log and per-day water; the pantry is shared.
  Migration wraps any legacy single profile into one member ("You"). New algorithms in types.ts:
  `computeBmi()` (BMI + Underweight/Healthy/Overweight/Obese band, colour, healthy-kg range,
  gentle goal advice) and `recommendedWaterMl()` (per-kg target scaled by activity, 250 ml cups).
  UI: crew switcher (avatars + kcal-left, tap to switch, "+" to add), add/edit/delete member
  flow, BMI chip on the dashboard + in the calibration preview, and a per-member hydration meter
  with cup +/−. Delivery + food logging now run against the active member. +12 tests
  (BMI, water, member CRUD isolation, water clamp, migration) → 61 total. Verified live in preview
  (two-member household, per-body targets confirmed). Still to come: AI meal-logging chat,
  ingredient/meal photo upload (needs a vision helper), and pantry→dish suggestions.
- **Guild Suggests** — cross-module free-time invitations. New pure engine
  `infinity8/suggestions.ts` reads each module (Pictures mid-binge shows / watchlist films /
  games, A.R.D.O due cards, L.O.G next dream step + constellation plan, Journal blank page) and
  emits weighted `Suggestion`s tagged `play | grow | care` (entertainment is first-class).
  Gap-fit pickers (`suggestionsForGap` / `topSuggestion` / `assignToFreeBlocks`) match
  invitations to free blocks by duration — big blocks draw a film, small gaps a drill or page —
  one per module for variety, never repeated across blocks. Rendered as clickable chips inside
  INFINITY-8 free blocks (→ navigate to that module) and as a "THE GUILD SUGGESTS" row on the
  Hub NOW card when free. +10 picker tests (49 total). Verified live in preview.
- **Journal enhancement streams live**: new `aiStream()` SSE helper; prompt reformatted to
  prose → `<<<DEBRIEF>>>` → metadata JSON; polish types out on the card in real time; seal
  is instant (no more blocking composer spinner).
- **AI 400 regression fixed**: current Claude models removed `temperature` + assistant-prefill —
  both stripped from `aiChat`/`aiJson`; JSON enforced by prompt + robust parsing (retry kept).
- **`createExternalTask()`**: cross-module task creation centralized in scrap7/store
  (shared `buildTask`, migrations apply, upsert by id, `warren:sync`). L.O.G sync is now a
  thin wrapper; raw `scrap7_v3` writes eliminated. +5 task-shape tests (39 total).
- **ESLint + vitest added** — flat config, 34 store-math tests (all green), 0 lint errors.
- **Git initialized** — repo at project root, pushed to `github.com/theseikichi-world/WARREN-PROTOCOL` (`main`).
- **AI layer hardened**: `aiChat` gained assistant-**prefill**, `temperature`, and one **retry**
  (2s backoff) on 429/529/5xx/network. New **`aiJson<T>(messages, settings, {prefill: '{'|'['})`**
  (temperature 0 default, parse-retry) replaced 6 duplicated JSON parsers — ALL structured-output
  call sites now go through it. Journal uses temperature 0.7 (creative writing).
- **Backup**: `src/backup.ts` + Settings → Backup section (⬇ export file / ⧉ copy JSON /
  ⬆ paste-import with validation + reload). Exports every localStorage key except discover caches.
- **Removed dead `@supabase/supabase-js` dependency**; entitlements stays as a local-only stub.

### 2026-06 (Session 4)
- **CAPTAIN'S JOURNAL** (hoot slot): diary where AI polishes your text (original always kept,
  RAW/✨ toggle), awards 3-5 physical-style **stickers** per entry (+ collection book), detects
  mood/themes, and writes a "First-Officer's Debrief" reflection. New `journal.enhance` AI task.
- **GALACTIC PICTURES**: full port of Muppet Foxy (old Guildhall) as a NEW 12th guild member
  (Fox, #ff6b00, `/pictures`). Every feature kept; server routes replaced with direct TMDB/RAWG
  calls (keys in Settings → Data Sources) + Claude fallback. Settings gained `tmdbApiKey`/`rawgApiKey`.

### 2026-06 (Session 3)
- **Ripped out the multi-provider AI config; rebuilt on Claude only** via direct REST
  (`fetch` to the Messages API + `anthropic-dangerous-direct-browser-access`; the SDK
  pulls Node-only `node:crypto`/`fs` and won't bundle for the webview). New `Settings`
  = `{ aiApiKey, aiModel, taskModels }`. 3-model picker, Sonnet 4.6 default. `loadSettings()` migrates old configs.
- **Per-task model routing**: SCRAP-7 chat → Haiku, SOLARIS → Sonnet, L.O.G → Opus by
  default; each overridable in Settings. System-prompt prompt-caching added.
- **SCRAP-7 command rework**: conversational input now goes to the AI, which returns
  structured JSON (proper title, correct type, dedup) instead of the regex butchering
  sentences. Type rule: todo = finite project · daily = endless routine · habit = streak.
- **INFINITY-8 PROTOCOL** (reused MYSTIC RAVI slot): a calendar/conductor module. Reads
  SCRAP-7 commitments, lays the day on a timeline around wake/sleep/meal anchors, auto-fills
  free gaps, and surfaces FREE TIME with a guilt-free "day cleared" banner. MVP = today view.
- **L.O.G rework**: (1) fixed analysis being lost on tab switch — now persisted on the
  dream. (2) "⟡ SYNTHESIZE" cross-dream constellation analysis: finds interconnections +
  a unified plan, deploy-to-SCRAP-7 per item with clean refactored names. Sync now supports
  to-dos. (3) Priority reorder via **▲/▼ buttons** (`moveDream`) — reliable in the WebView,
  unlike HTML5 drag. (A drag star-map was tried and removed by user preference.)
- Renamed "Glory Hall" → **REPERTOIRE** throughout Ardo.tsx (bad association)
- Added **KARAOKE mode** in A.R.D.O for song-type texts (line-by-line, BPM auto-advance)
- Created this DEVLOG file
- Rebuilt HAPPY POMU → **SOLARIS** (Solar System's Kitchen): calorie/macro tracker with
  Mifflin–St Jeor targets, orbital ring UI, meal manifest, AI "delivery" meal synthesis

### 2026-06 (Session 2)
- Built **A.R.D.O** module: SRS + SM-2 + chunking + sprint mode + memory curve
- Removed delete button, replaced with `markTextLearned` / `reviveText` system
- TTS via Web Speech API (`speak()`)
- Fixed `ArdoState` / `LogState` not exported (cascade of implicit `any` errors)

### 2026-06 (Session 1)
- Rewrote project as Tauri + Vite + React (was Next.js)
- Built **SCRAP-7** habit module with Loop Habit Tracker exponential smoothing
- Built **L.O.G** goal module with AI dream analysis + Scrap-7 sync
- Fixed command parser typo tolerance (`habb?its?`)
- Fixed default AI provider (was `freecc` → now OpenAI)
- Added SettingsPanel warnings for misconfiguration
