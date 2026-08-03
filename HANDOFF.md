# WARREN — HANDOFF

Pick-up document for a fresh session. Read this, then `WARREN_VISION.md` for the
long-range plan. Together they should mean nothing has to be re-derived.

**State as of the last commit:** `ede7c66` · 339 tests · tsc/build/lint clean.

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
| `warren_settings` `warren_locale` | app + operator profile |
| `warren_tours_v1` | which guided tours have played |
| `bigscreen_favs_v1` `bigscreen_launches_v1` | Warren OS (dormant) |

Everything is EN/RU via inline pairs: `t(en, ru)`, imported as `tr` inside
modules to avoid clashing with local `t` loop variables.

---

## 2. The system, in one diagram

```
DREAMS (unlimited, in PATHFINDER — the inbox)
   └─ PROMOTE TO UPLINK → the guide proposes → you edit every node
       └─ UPLINK  (2 slots: primary 1.0× / secondary 0.6×, 2nd at level 5)
           └─ PROTOCOL — a tech tree of ROUTINES
               └─ ROUTINE = a SCRAP-7 habit carrying AUTOMATISM (score 0–1)
                   └─ automatism ≥ 0.60 unlocks the next routine
                       └─ routines grant INSTRUMENTS (modules)
                           └─ instruments deepen by use (FIRMWARE v0–v3)

CHARACTER tab (no tree, no gating, answers to no goal)
   └─ LIFE SUPPORT — the basics, from templates or your own, 3 XP a run
       └─ slots open with levels (1 · 2 · 4 · 6 · 8 · 12); deleting one deletes it
```

### Vocabulary (keep it consistent)
UPLINK = goal · BANDWIDTH = slots · PROTOCOL = chain · ROUTINE = node ·
AUTOMATISM = the 0–1 score · STREAK = days unbroken · BREACH = chapter event ·
LIFE SUPPORT = baseline habits · CACHE = inventory · CREDITS ·
FIRMWARE v0–v3 = tool tier.

**The gauges say the plain thing.** AUTOMATISM and STREAK replaced INTEGRATION
and UPTIME because they're read every day and the in-world names taught nothing.
Flavour belongs on what you read once. (Internal identifiers still say
`integration`/`integrated` — renaming those is churn with no user benefit.)

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
| `NewUplink.tsx` | dream → guide call → forge. Reached from PATHFINDER only |
| `lifeSupport.ts` | LIFE SUPPORT templates — the basics, no tree, no gating |
| `LifeSupportPanel.tsx` | that section of the character sheet; slots, picker, custom |
| `Initiation.tsx` | the arrival. Plays once, flagged by `initiatedAt` |
| `LevelUp.tsx` | threshold crossed — says what opened; once per `celebratedLevel` |
| `questNav.ts` | quest→destination state: the brief and the spotlight travel with you |
| `QuestHint.tsx` | the banner restating why you're on this screen |
| `xp.ts` | XP events, level curve (derived from `stageXp`), **the quest gate**, level gates |
| `stats.ts` | six character attributes derived from real module data |
| `quests.ts` | quest STAGES, objective measurement, and where each step happens |
| `QuestPanel.tsx` | the quest log — lives on the **hub**, not the character sheet |
| `tools.ts` | FIRMWARE tiers (SOLARIS implemented) |
| `SkillTree.tsx` | the tree diagram + node detail panel |
| `CharacterSheet.tsx` | level, XP, standing, main quest, attributes, milestones |
| `Uplinks.tsx` | the screen — tabs CHARACTER \| PRIMARY \| SECONDARY |
| `BandwidthStrip.tsx` | hub widget; when empty it is the door to PATHFINDER |

### Touched elsewhere
- `scrap7/types.ts` — `TaskOrigin`, `Task.origin`, `Task.frozen`, `taskOrigin()`,
  `feedsProgression()`, `isUnbound()`
- `scrap7/store.ts` — v4 key + origin migration, half-rate decay for frozen
- `log/Log.tsx` — **PATHFINDER** (module id + route stay `log`); PROMOTE TO UPLINK
- `solaris/Solaris.tsx` — UI gated by firmware tier
- `pictures/radar.ts` + `ReleaseRadar.tsx` — hub release radar
- `App.tsx` — `WARREN_OS_ENABLED`/`INF8_ENABLED` dormancy flags, `/uplinks` route
- `guild.ts` — `built` flag, `group: instrument | utility`; INFINITY-8 `false`
- `profile.ts` + `Onboarding.tsx` — first-run gate; chronotype from mid-sleep
- `tour.ts` + `TourOverlay.tsx` — per-surface walkthroughs, anchored by `data-tour`
- `moduleAccess.ts` — which level opens which module; **invariant tested**
- `boot.ts` — the boot log, read off real state
- `settings.ts` — profile fields (`gender`, `wakeTime`, `sleepTime`, `onboardedAt`)

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
4. **Two origins earn, and by very different amounts.** `'chain'` is goal work
   at full rate; `'baseline'` is LIFE SUPPORT at 3 XP a run — every basic done
   in a day must stay under one tier-4 routine run, and there's a test pinning
   that. `'log'` and `'manual'` earn nothing.
5. **Locked things state their condition** — `⊘ REQUIRES: Reading aloud @ 0.60
   — currently 0.41`, never an empty progress bar.
6. **A quest cannot be completed by pressing a button.** Objectives are measured
   from data; quests clear because the record says so. Within a STAGE they're a
   checklist in any order; between stages the order is strict, so a later
   objective met early never skips the story. It must always be **one tap from
   the doing**: every quest carries a `target` and names its destination.
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
15. **XP alone never levels you up.** Each early level has a stage of quests
    behind it (`gatedLevel` in `xp.ts`). A held level states what is holding it
    — "⊘ LEVEL 2 HELD — 4 objectives left" — never a full bar that does nothing.
16. **Scarcity is what makes the tree a tree.** Both live slots cap concurrent
    training (primary 5, secondary 3). With unlimited installs a tech tree is a
    checklist and picking a branch means nothing. An automatic routine stops
    counting, so mastering something is what frees a slot.
17. **An uplink comes from a dream.** No templates, no blank protocol — those
    are goals you never chose. PATHFINDER is the only door, and there is no
    second entrance in UPLINKS: an empty slot points back at PATHFINDER.
18. **The operator's hours are a hard constraint.** Collected at first run and
    fed to the guide. A cue outside waking hours, or an early-morning chain for
    an owl, fails for reasons unrelated to willpower. Chronotype comes from
    mid-sleep, never from asking "are you a morning person?".
19. **Life support is slotted** (1 at LV1, then 2·4·6·8·12). The template shelf
    is deliberately larger than anyone can run; the SLOT CAP is what bounds the
    baseline economy, and there's a test pinning that rather than the shelf size.
    **Deleting a basic really deletes it** — no adopt-back list. This is the one
    place that differs from rules 3/14, and deliberately: an abandoned basic is
    abandoned, whereas a routine dropped from a chain still has a goal behind it.
20. **A quest points at the control, not just the screen.** The brief travels
    with the navigation and the destination highlights what to press. Landing on
    a module and being left to hunt is the failure this replaces.
21. **A gated level costs exactly what its stage pays** (`levelCost` derives from
    `stageXp`). Finish the stage, fill the bar, level up — one motion. Add a
    quest to a stage and its level expands to match, automatically.
22. **Starting over is total.** Reset wipes the profile and the tour flags too,
    so FIRST CONTACT and every walkthrough replay. Only the API key and
    appearance survive — a credential says nothing about being new.
23. **One overlay at a time.** Intro → FIRST CONTACT → the arrival → tours, in
    that order, decided in one place in `App.tsx`. They are all full-screen, so
    independent booleans stack. Module tours additionally wait for the *hub*
    tour: the first welcome comes first, and an abandoned tour stays unseen so
    it resumes rather than being lost.
24. **Every launch lands on the hub.** HashRouter restores the last route from
    the URL, so a restart — or a reset done inside a module — used to reopen a
    screen with nothing left on it.
25. **Never point at nothing.** A tour step whose anchor is missing or collapsed
    is dropped from the run. Better still, don't have empty anchors: a surface
    with nothing in it should say so and offer the way out.
26. **A tour is marked seen when it STARTS.** Marking on completion meant an
    abandoned tour re-ambushed you next visit, which reads as a bug. There is a
    session guard behind the flag; Settings → REPLAY clears both (it reloads).
27. **Real work gets a visible beat.** A quest clearing flares over the panel
    with its XP; crossing a level is a full screen naming what opened. Both are
    still informational — they report what changed, they don't congratulate.
    `levelReward()` derives that list from the gates, slots and stages, so it
    cannot drift, and it says so plainly when a level opened nothing.
28. **Never animate the position of something that occupies layout.** A
    transform-based entrance can leave a residual translate and paint the
    element over its neighbour — exactly how the quest banner ended up on the
    module's header. Use `fadeInPlace` for anything in the flow.
29. **A module opens with a level, and never after the quest that needs it.**
    `moduleAccess.ts` holds the table; `moduleAccess.test.ts` pins the invariant
    that every quest destination is unlocked at or before that quest's stage.
    Break it and the starting zone hands you an unreachable objective. Rule 8
    still holds: a level withholds a whole instrument, never a feature of one
    you already use.
30. **A locked thing is visible, dimmed, and says what opens it.** Hiding it
    would erase the shape of what's coming; doing nothing on click is worse than
    saying "OPENS AT LEVEL 4". Same principle as rule 5.
31. **An effect that schedules timers must cancel them, and must not depend on
    a callback prop.** A parent's inline `onDone` is a new identity every
    render; the boot log listed it as a dependency and restarted its own chain
    on every re-render, printing each line two to four times.

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

### Requested but not yet built (from rounds of use, 2026-08-02)
Decided with the user; do these in roughly this order.

0. **PATHFINDER rename is user-facing only.** `ModuleId` is still `'log'`, the
   route is still `/log`, and `log_v1` is still the storage key. Renaming those
   buys nothing and would break saved data — but a grep for "L.O.G" now only
   hits comments and internal names, which is the intended end state.
1. **Retire SCRAP-7's Habits tab.** Half-done: the Character tab is now the
   home for LIFE SUPPORT + YOUR OWN HABITS, so habits *have* somewhere to live.
   What remains is removing the Habits tab from SCRAP-7 (leaving todos +
   dailies) so habits stop appearing in two places.
2. **Gamified L.O.G.** The user finds it messy — dream cards, star-map framing
   and the mission/task hierarchy need a readable, game-like pass.
3. **SOLARIS levels.** Surface the firmware tier as a visible level with the
   next unlock and its condition stated ("v1 Calories — 5 hydration days, you
   have 2"). The tier logic in `tools.ts` already exists; this is legibility.
4. **The rest of the tree work.** Scarcity landed (rule 16) and the guide is
   asked for 12-18 branching nodes with capstones, but **no real proposal has
   been read back** — see the caveat below. Optional/side nodes and a visual
   treatment for capstones are still open.
5. **Use the profile beyond the guide prompt.** Wake/sleep hours are collected
   and sent to the guide, but nothing else reads them yet — life-support cues
   are still fixed strings, and an owl gets "with breakfast" the same as a lark.
   `dayShape()` is there when a module wants it.
6. **Anchor the remaining tours.** Hub and UPLINKS have `data-tour` anchors on
   real controls; L.O.G, SCRAP-7, SOLARIS, JOURNAL, A.R.D.O and PICTURES have
   written copy but no anchors, so their steps just centre. Adding an anchor is
   one attribute — the tour needs no code of its own.

---

## 6. Known gaps and honest caveats

- **The guide's proposal quality is still untested against a real key**, and it
  now matters more: the prompt asks for 12-18 nodes with parallel branches and
  a capstone per chapter, and nothing has verified the model actually produces
  that shape. The normaliser guarantees it *opens*, not that it's a good tree.
  Worth one real run on the desktop app.
- **Stage 1 assumes the dream pipeline works.** CHOOSE ONE DREAM cannot be
  cleared without promoting a dream, which needs either an API key or the BY
  HAND path. With neither a key nor a dream written, a new user is stuck at
  level 1 — by design, but it makes L.O.G load-bearing on first run.
- **A blank routine's key is `routine`/`routine-2`** — keys are permanent and
  derived at creation, so one added before it's named keeps the placeholder.
  Internal only; ids are never shown. Deliberate: re-deriving keys would break
  rule 13.
- **Habits still appear twice** — in the tree / character sheet and in SCRAP-7's
  Habits tab. Next step 1 above closes this.
- **A released life-support template can't be re-added from the picker.**
  `availableTemplates` filters on habit id, and releasing keeps the `life:` id.
  It shows under YOUR OWN HABITS with ADOPT instead, which is arguably the
  better route — but the picker count reads 2/8 while only 7 are offered.
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

**Ask before assuming** on: whether spec step 4 (miss penalties + threshold
upgrades) should jump the queue ahead of the four requested items in §5.
