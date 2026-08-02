# WARREN — HANDOFF

Pick-up document for a fresh session. Read this, then `WARREN_VISION.md` for the
long-range plan. Together they should mean nothing has to be re-derived.

**State as of the last commit:** `7024ab2` · 249 tests · tsc/build/lint clean.

---

## 1. What Warren is now

A single-user desktop app (Tauri 2 + React 18 + TS + Vite, ~20k lines) that is
being converted from a horizontal dashboard of independent modules into **one
vertical progression system**: a human RPG where a goal drives everything and
every number is read off real behaviour.

**Storage is localStorage only.** No DB, no backend, no accounts, no sync. Keys:

| Key | Owner |
|---|---|
| `scrap7_v4` | tasks/habits (**v3 kept untouched as a rollback point**) |
| `warren_progression_v1` | goals, chains, XP, quest ledger |
| `log_v1` `ardo_v1` `solaris_v1` `journal_v1` `pictures_v1` `infinity8_v1` | modules |
| `warren_settings` `warren_locale` | app |
| `bigscreen_favs_v1` `bigscreen_launches_v1` | Warren OS (dormant) |

Everything is EN/RU via inline pairs: `t(en, ru)`, imported as `tr` inside
modules to avoid clashing with local `t` loop variables.

---

## 2. The system, in one diagram

```
DREAMS (unlimited, in L.O.G — the inbox)
   └─ PROMOTE TO UPLINK → the guide proposes → you edit every node
       └─ UPLINK  (2 slots: primary 1.0× / secondary 0.6×, 2nd at level 5)
           └─ PROTOCOL — a tech tree of ROUTINES
               └─ ROUTINE = a SCRAP-7 habit carrying INTEGRATION (score 0–1)
                   └─ integration ≥ 0.60 unlocks the next routine
                       └─ routines grant INSTRUMENTS (modules)
                           └─ instruments deepen by use (FIRMWARE v0–v3)
```

### Vocabulary (keep it consistent)
UPLINK = goal · BANDWIDTH = slots · PROTOCOL = chain · ROUTINE = node ·
INTEGRATION = automatism score · UPTIME = streak · BREACH = chapter event ·
CACHE = inventory · CREDITS · FIRMWARE v0–v3 = tool tier.

---

## 3. Where the code lives

### `src/modules/progression/` — everything new
| File | Role |
|---|---|
| `types.ts` | `Goal`, `Chapter`, `ChainNode`, `Milestone`, `ProgressionState`, tier meta, constants |
| `store.ts` | slots, cooldown, freeze/thaw, `syncChain`, `installNode`, `recordRun`, `syncQuests` |
| `chain.ts` | pure gating: `unlockRequirements`, `evaluateUnlocks`, `chapterState`, `nodeState` |
| `layout.ts` | tech-tree geometry — depth from the graph, fixed grid, connector edges |
| `seed.ts` | the ACTOR + CAPOEIRA chains — now the source of `TEMPLATES`, not installed |
| `draft.ts` | `ChainDraft`, validation, `applyDraft`/`draftToGoal`, `TEMPLATES` |
| `guide.ts` | dream → proposed chain: prompt + `normalizeProposal` (paranoid, pure) |
| `ChainForge.tsx` | the editor + live layout preview; nothing commits from anywhere else |
| `NewUplink.tsx` | the picker (dream / template / blank) and the guide call |
| `xp.ts` | XP events, level curve (`level² × 40`), level gates |
| `stats.ts` | six character attributes derived from real module data |
| `quests.ts` | main quest line + objective measurement |
| `tools.ts` | FIRMWARE tiers (SOLARIS implemented) |
| `SkillTree.tsx` | the tree diagram + node detail panel |
| `CharacterSheet.tsx` | level, XP, standing, main quest, attributes, milestones |
| `Uplinks.tsx` | the screen — tabs CHARACTER \| PRIMARY \| SECONDARY |
| `BandwidthStrip.tsx` | hub widget |

### Touched elsewhere
- `scrap7/types.ts` — `TaskOrigin`, `Task.origin`, `Task.frozen`, `taskOrigin()`,
  `feedsProgression()`, `isUnbound()`
- `scrap7/store.ts` — v4 key + origin migration, half-rate decay for frozen
- `log/Log.tsx` — `LOG_FROZEN = false`; PROMOTE TO UPLINK on each dream card
- `solaris/Solaris.tsx` — UI gated by firmware tier
- `pictures/radar.ts` + `ReleaseRadar.tsx` — hub release radar
- `App.tsx` — `WARREN_OS_ENABLED`/`INF8_ENABLED` dormancy flags, `/uplinks` route
- `guild.ts` — `built` flag; INFINITY-8 set to `false`

---

## 4. Rules that must not be broken

These were each decided deliberately; breaking one silently breaks the product.

1. **Nothing installs itself.** `syncChain` never creates a habit. `installNode`
   is the only path, and it's a user decision (Cyberpunk perk point).
2. **Creation is idempotent.** Habit ids derive from the routine id
   (`chain:goal-actor:reading`) and are created only when absent. Never call
   `createExternalTask` on an existing id — it would rebuild the task and wipe
   an accumulated score.
3. **Freeze never deletes.** Archiving a goal sets `Task.frozen`; the habit stays
   visible and trackable, decays at half ALPHA, and keeps its streak.
4. **Only `origin: 'chain'` feeds progression.** L.O.G-synced tasks (`'log'`)
   earn nothing and never appear in UNBOUND; UNBOUND is `'manual'` only.
5. **Locked things state their condition** — `⊘ REQUIRES: Reading aloud @ 0.60
   — currently 0.41`, never an empty progress bar.
6. **A quest cannot be completed by pressing a button.** Objectives are measured
   from data; quests clear because the record says so. Order holds — a later
   objective met early never skips the line.
7. **Firmware is derived from use**, never stored or bought, and cannot skip a
   tier.
8. **Gate complexity, never utility.** Tier 0 of any instrument fully solves the
   problem it exists for.
9. **An inventory item may protect a streak but never advance integration.**
10. **Rewards inform, never congratulate.** Show the curve, the delta, the
    estimate. One user, and he knows when he's being flattered.
11. **`ALPHA = 0.05` is not to be changed.** The score curve is Loop Habit
    Tracker's and it's correct.
12. **Don't delete features.** Anything cut goes behind the `built` flag.
13. **A routine's KEY is permanent.** Node ids derive from it and habit ids
    derive from those, so the integration score hangs off the key. Titles are
    free to change; keys are never re-derived. This is what makes editing a
    live protocol safe.
14. **Editing never deletes a habit either.** A routine dropped from a chain is
    released to SCRAP-7 (`origin: 'manual'`), score and streak intact.

---

## 5. Build order — progress

From the original spec (`§10`):

| # | Step | State |
|---|---|---|
| 1 | Cut surface + RELEASE RADAR | ✅ `e7a501b` |
| 2 | Goal slots + task origin + L.O.G freeze | ✅ `8e7d62c` |
| 3 | Chain engine + gating | ✅ `13a64d8` |
| — | Tech-tree redesign (user feedback) | ✅ `4500b0a` |
| — | Character, XP, levels | ✅ `3fe5e6e` |
| — | Main quest line | ✅ `98a5c58` |
| — | SOLARIS firmware tiers | ✅ `6b1820f` |
| 9 | **Dream → tree pipeline** (was step 9, taken early) | ✅ `7024ab2` |
| 4 | **Miss penalties + threshold upgrades** | ⬜ next in spec |
| 5 | FUEL multiplier from SOLARIS | ⬜ |
| 6 | Inventory + credits (CACHE) | ⬜ |
| 7 | Level gates — *partly done in `xp.ts`* | 🟡 |
| 8 | Tool tiers for A.R.D.O + JOURNAL | ⬜ |

### The obvious next one
**Move habits out of SCRAP-7.** Habits show in both the tree and SCRAP-7's
Habits tab. UPLINK should be the only habit surface; SCRAP-7 keeps todos +
dailies; hand-made habits land in an UNBOUND section to attach or archive.
`isUnbound()` in `scrap7/types.ts` already exists and **has no UI consuming it**
— that section is the missing half. The forge's release path (rule 14) writes
exactly the state that section is designed to show, so this is now the natural
follow-on rather than a parallel candidate.

---

## 6. Known gaps and honest caveats

- **The guide's proposal quality is untested against a real key.** The prompt,
  the normaliser and every failure mode are covered by tests and were driven
  live, but the browser profile has no API key, so no real proposal has been
  read end to end. Worth doing once on the desktop app before trusting it.
- **A blank routine's key is `routine`/`routine-2`** — keys are permanent and
  derived at creation, so one added before it's named keeps the placeholder.
  Internal only; ids are never shown. Deliberate: re-deriving keys would break
  rule 13.
- **UNBOUND has no UI.** The forge's release path sets `origin: 'manual'`
  correctly, so a released habit is an ordinary SCRAP-7 habit today. The copy
  says exactly that and does not promise a section that doesn't exist.
- **Habits appear twice** — in the tree and in SCRAP-7's Habits tab.
- **Miss penalties and threshold upgrades are specced but not built** — spec
  step 4. `THRESHOLD_UNLOCK_AT` / `THRESHOLD_COST` constants exist unused.
- **FUEL multiplier** — `awardXp` takes a `fuelMultiplier` argument that is
  always 1 today.
- **XP_TABLE / xpProgress / levelThreshold in `scrap7/types.ts` are dead code** —
  never imported. `progression/xp.ts` is the live economy. Worth deleting.
- **Data durability is the standing risk.** localStorage in a WebView2 profile;
  one Windows reset loses months of integration. Export/import exists in
  Settings → Backup (API keys stripped). A disk-backed store is the real fix.
- **Warren OS + INFINITY-8 are dormant**, not deleted. `WARREN_OS_ENABLED` in
  `App.tsx`; INFINITY-8 via `built: false` in `guild.ts`.
- **Windows Store roadmap** exists but nothing is done: identifier is still
  `com.warren.app` (change *before* release — it names the data folder), no
  privacy policy, MSIX vs EXE undecided.

---

## 7. Working practices that worked

- **Verify live, don't assert.** Every claim in this project was checked by
  driving the running app through the browser tools and reading real state back
  — idempotency by running sync 7×, freeze by counting habits before/after.
- **Pure functions + tests for every rule.** All gating, scoring, layout and
  quest logic is pure over its inputs, so it tests without a browser. 210 tests.
- **Clean up seeded test data** in the browser tab afterwards. The browser tab's
  localStorage is separate from the desktop app's WebView2 profile — the user's
  real data is never touched by verification.
- **The dev server owns port 1420.** If the user is running `npm run tauri dev`,
  attach with `preview_start {url: "http://localhost:1420"}` — do **not** start
  a second server, it will collide and break their app. (This happened twice.)
- **Console errors with stale `?t=` timestamps** are mid-edit HMR artifacts.
  Confirm on a fresh tab before treating one as a real bug.
- Commit messages: what changed and *why*, with the verification result.

---

## 8. Fast orientation for a new session

```bash
git log --oneline v0.1.0-dashboard..HEAD   # everything since the rework began
npm test                                    # 210 green
```

- `WARREN_VISION.md` — the idea vault: morning flow, ranked RPG mechanics with
  reasons for the rejected ones, the one-app-vs-several decision, open questions.
- `WARREN_DEVLOG.md` — history of the pre-progression era.
- `v0.1.0-dashboard` tag — the full dashboard era, restorable with
  `git checkout v0.1.0-dashboard`.

**Ask before assuming** on: whether the next step is spec step 4 (miss
penalties + threshold upgrades) or moving habits out of SCRAP-7 (§5).
