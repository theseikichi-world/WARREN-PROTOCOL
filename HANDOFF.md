# WARREN — HANDOFF

Pick-up document for a fresh session. Read this, then `WARREN_VISION.md` for the
long-range plan. Together they should mean nothing has to be re-derived.

**State as of the last commit:** `381e03e` + the SPINE rework and the INTERVIEW ·
447 tests · tsc/lint clean. **Uncommitted.**

---

## 1. What Warren is now

A single-user desktop app (Tauri 2 + React 18 + TS + Vite, ~20k lines) that is
being converted from a horizontal dashboard of independent modules into **one
vertical progression system**: a human RPG where a goal drives everything and
every number is read off real behaviour.

**Storage is localStorage only.** No DB, no backend, no accounts, no sync. Keys:

| Key | Owner |
|---|---|
| `scrap7_v4` | ORBIT tasks + every habit (**v3 kept as a rollback point**) |
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
               └─ ROUTINE = a habit carrying AUTOMATISM (score 0–1)
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
| `spine.ts` | **the one read** — verdict + acts + typed shelf, `normalizeRead`, `readToDraft`, `deepenAct`, and `readFromAnalysis` for the migration |
| `shelf.ts` | where a candidate is allowed to land: `deployState`, `applyToGoal` (pure), `deployToDay` |
| `ShelfPanel.tsx` | the shelf, rendered under the tree in UPLINKS — reads the spine through `goal.sourceDreamId` |
| `record.ts` | what actually happened last time: HOLDING / STRUGGLING / ABANDONED, and the brief built from them |
| `anchor.ts` | when a routine happens — `after` / `at` / `period`, the derived label, and the parser for legacy prose |
| `InterviewPanel.tsx` | the guide's dialogue — one question at a time, every one skippable |
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
| `WeekStrip.tsx` | hub widget — the week's dots and the day streak |

### `src/sync.ts` + `api/sync.ts` — the desktop/web bridge

One encrypted blob per "room", pushed and pulled whole through the existing
`backup.ts` export/import. `syncOnce` is the only round — the SYNC NOW button
and the automatic runs (launch, and window hidden) both go through it, so a
manual sync can never be safer than an automatic one. Settings owns the
conflict dialog because only the user knows which device did the real work.

Setup is two things the code cannot do for itself: a Vercel Blob store (which
provides `BLOB_READ_WRITE_TOKEN`) and, while Deployment Protection is on, a
Protection Bypass token — the desktop app carries no Vercel SSO cookie, and
`describe()` in `sync.ts` special-cases that failure because it is the one
everybody hits first.

### Touched elsewhere
- `scrap7/types.ts` — `TaskOrigin`, `Task.origin`, `Task.frozen`, `taskOrigin()`,
  `feedsProgression()`, `isUnbound()`
- `scrap7/` — **ORBIT** (module id + route + storage stay `scrap7`). One task
  list; `'daily'` is the stored spelling of "repeats". INFINITY-8 is its
  TIMELINE view, not a module.
- `scrap7/store.ts` — v4 key + origin migration, half-rate decay for frozen,
  `orbitTasks()`, `pickableCategories()`
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
64. **PATHFINDER IS A TAB, NOT A MODULE.** Its entire job was to be the door an
    uplink comes through (rule 17), and a door is not a room. Writing a dream and
    planning the goal is one intention; splitting it across two modules meant
    leaving the goal screen to write the thing the goal screen is about.
    UPLINKS is now `DREAMS | CHARACTER | PRIMARY | SECONDARY`, and `DreamsPanel`
    holds the list, the editor and PROMOTE. `guild.ts` has `log: built: false`,
    `/log` REDIRECTS to `/uplinks` (old links, quest destinations and muscle
    memory all still say /log), and `Log.tsx` stays on disk unrouted per rule 12.
65. **A dream is title, description, PROMOTE. Nothing else.** The mission/task
    hierarchy under a dream is retired: ACTS do that job, ordered, carrying
    pressure, with a shelf wired to progression — which missions never were. Two
    ways to break down the same dream was one too many.
63. **Sound is synthesised, quiet, and never load-bearing.** `sound.ts` builds
    every cue from oscillators at play time — no samples, because the CSP is
    strict, a bundle this size should not carry audio, and a filtered blip IS
    the sound. `MASTER_GAIN` is 0.12 and a test pins it low: if a cue is ever the
    loudest thing in the room it is wrong. Rule 10 holds — a level-up is three
    notes, not a fanfare; nothing applauds.
    Every failure path degrades to SILENCE, never to an error: no Web Audio, a
    refused context, a tab with no gesture yet. The context is created lazily on
    the first cue, because browsers refuse one before a user gesture. Seven cues
    (`tick check xp level quest deny open`) cover everything, so no call site
    invents its own and the app cannot develop an accent it did not mean to.
61. **ORBIT's list shows the WHOLE day, and every row says where it came from.**
    Routines were excluded on the reasoning that BUILDS YOU lives in UPLINKS.
    That line is right about *ownership* and wrong for a LIST: a day is not two
    days, and being unable to see all of it made "did I finish today"
    unanswerable — which is exactly the question PERFECT DAYS will be built on.
    `taskSource` returns `uplink | basic | yours`, scored work sorts first, and
    the badge names it. A row that looks scored and isn't would make the whole
    day-state model a lie, so YOURS is labelled rather than left blank.
62. **Tracking works from anywhere, through one path.** Rule 31 forbade tracking
    outside UPLINKS because it would move a score without paying its XP. That was
    a symptom of there being no shared path — UPLINKS knew to call `recordRun`
    for a routine and `recordBaselineRun` for a basic and nothing else did.
    `trackFromList` is that path: score, streak and XP move together wherever the
    tap happened. A habit is done when today's DOSE is met (`habitDoneToday`),
    never when a checkbox is ticked — it has no `completed` flag to read.
58. **THE DAY ENDS AT BEDTIME.** `todayKey` has been wrong twice: it was the UTC
    date while INFINITY-8 used the local one (they disagreed for hours a day),
    and then the local calendar date, which still splits a night owl's evening in
    half. With a bedtime of 02:00, work at 01:00 belongs to the day that started
    yesterday morning. `sleepCutoffMin` only moves the boundary for a bedtime in
    the small hours — rolling an 23:00 sleeper at 23:00 would close the day while
    they were still awake in it. The deadline does not extend: miss it and the
    day closed, which is the point.
    Everything now goes through `todayKey` / `dateKey` / `shiftDateKey` /
    `daysBetweenKeys` in `scrap7/types.ts`. No `toISOString().slice(0,10)`.
59. **`unlockAll` opens every door and withholds nothing else.** Not everyone
    wants to be levelled at, and the gates made the app hard to inspect. Quests,
    XP and levels all still run — the switch is about doors. Settings → "Open
    every module".
60. **ORBIT is the module's only name in the UI.** The rename left ~57 visible
    "SCRAP-7" strings behind. The lowercase `scrap7` ids, routes and storage keys
    stay — renaming `scrap7_v4` would migrate the one thing that cannot be
    re-earned.
56. **An anchor is structured, and the scheduler obeys it.** The cue was one text
    box carrying an event, a weekday set and a clock time — and *nothing read
    it*. The timeline decided when to run a routine with `classifyPeriod`, which
    regex-matches keywords in the **title**; the sentence you typed was drawn and
    thrown away. `RoutineAnchor` is now `after` a habit / `at` a clock time /
    `period` for ORBIT to place, plus `minutes`. All three produce a concrete
    placement, so rule 18 is intact — "3x a week" is still unsayable. What went
    is the typing.
    `buildDay` lays an `at` routine as a fixed block before the gaps are cut, and
    runs an `after` routine immediately with no break, beating circadian order —
    that is what "straight after" means.
57. **The cue is derived, never stored twice.** `anchorLabel` builds it at commit
    from the anchor and the live habit name, so renaming a routine renames every
    cue anchored to it. Prose survives only where there is no anchor: a protocol
    written before this keeps its sentence untouched and stays committable
    (`validateDraft` accepts an anchor OR prose), until it is edited.
    `parseAnchor` reads the guide's prose — it still writes "straight after
    morning coffee", because that is what a person says — and only anchors to a
    habit that actually exists. A dangling anchor is worse than none.
29b. **The panel never shows a stage ahead of your level.** Stage N is worked at
    level N and every module it points at opens at level N or earlier — so a
    stage shown early is an objective behind a locked door. `stageState` takes
    the level and clamps to it. This is the mirror of the `moduleAccess` test:
    there, no quest may point past its stage; here, no stage may be shown past
    the level.
    The two diverge when the quest ledger runs ahead of the XP bank, which a
    **retune of quest rewards does to every existing save** — rewards bank once,
    at the moment a quest clears. `questFloorXp` repairs it on load: banked XP is
    raised to what the cleared quests actually pay. It is a floor and never a
    deduction, because routine and baseline XP live in the same total.
29a. **A UTILITY IS NEVER GATED.** A.R.D.O and PICTURES answer to no goal, feed
    no gate and cost no bandwidth, so a level lock on them withheld a toy rather
    than pacing anything — rule 8 in its own words. Their depth is still earned:
    A.R.D.O's firmware tiers come from use. `moduleAccess.test.ts` pins it for
    every built module whose `group` is `utility`.
    The journal moved the other way — to **level 3**, with FIRST LIGHT moved to
    stage 3 to match, because on day one there is nothing to write about yet.
    Moving a quest between stages changes what its level costs (rule 21): setup
    is two quests now, so they pay 80 and 40 against a flat level-1 cost of 120.
29. **A module opens with a level, and never after the quest that needs it.**
    `moduleAccess.ts` holds the table; `moduleAccess.test.ts` pins the invariant
    that every quest destination is unlocked at or before that quest's stage.
    Break it and the starting zone hands you an unreachable objective. Rule 8
    still holds: a level withholds a whole instrument, never a feature of one
    you already use.
30. **A locked thing is visible, dimmed, and says what opens it.** Hiding it
    would erase the shape of what's coming; doing nothing on click is worse than
    saying "OPENS AT LEVEL 4". Same principle as rule 5.
31. **No habit lives outside a system.** A goal routine is `'chain'`, a basic is
    `'baseline'`, and nothing else may be a habit — `adoptOrphanHabits()` runs at
    startup and moves any stray into LIFE SUPPORT with its history. Over the slot
    cap is fine: the cap governs ADDING, not keeping. SCRAP-7's chat cannot make
    one, and `track_habit` there is deliberately unhandled (tracking from outside
    UPLINKS would move a score without awarding its XP).
32. **The line is BUILDS YOU vs JUST HAS TO HAPPEN**, not repeats vs doesn't.
    UPLINKS owns what builds you — scored, streaked, capped, because attention is
    finite. ORBIT owns everything else, uncapped and unscored: capping your
    obligations would be absurd, you don't choose them. Two capped systems for
    recurring things is what made dailies feel like a slot-cap escape hatch.
33. **ORBIT has ONE kind of thing: a task, which may repeat.** No tabs — the
    repeat mark is a property of a task, not a category. `taskType: 'daily'` is
    only the stored spelling of "repeats", kept so nothing migrates.
34. **INFINITY-8 is a view, not a module.** It owns no tasks; it reads ORBIT's,
    as LIST | TIMELINE on the same screen. Its anchors default from the operator
    profile — the wake/sleep hours from FIRST CONTACT are what make it a day
    someone actually lives. Its `built: false` only keeps it out of the sidebar;
    the code is live in two places (ORBIT's timeline, the hub's NOW card).
35. **The hub is glance and navigation; a module is where you work.** Every hub
    card shows a number and taps through — quests, bandwidth, the week strip,
    NOW. Anything with controls on it (durations, rescheduling, optimise) belongs
    next to the thing it edits. That's why the timeline signal is on the hub and
    the timeline itself is not.
36. **A task's category is a label and attaches nothing.** Offering "Life
    support" or an uplink's title implied a link the data never had, so
    `pickableCategories` hides anything another system owns.
37. **An effect that schedules timers must cancel them, and must not depend on
    a callback prop.** A parent's inline `onDone` is a new identity every
    render; the boot log listed it as a dependency and restarted its own chain
    on every re-render, printing each line two to four times.
38. **Nothing renders below ~10.5px.** The app spent months at 6–8px, which is
    squinting distance. Sizes are inline numbers, not tokens, so a rescale is a
    scripted pass over `fontSize:` plus the `--fs-*` variables — and bigger type
    breaks fixed columns, so widths holding text have to move with it.
39. **An icon draws the module's job, not a mascot.** The animals are guild-era
    flavour that survives only in `guild.ts` descriptions. See `CyberIcon.tsx`.
40. **Sync never guesses.** `decideSync` compares what changed on *each* side
    since the last agreed state; if both moved it returns `conflict` and stops.
    Warren's data is a score accruing over months, and last-write-wins loses a
    forty-day streak in a way nobody notices for a week. Every pull snapshots
    first (`warren_sync_snapshot_v1`), and RESTORE SNAPSHOT in Settings is the
    way back.
41. **A pull must reload the page.** It replaces localStorage under a running
    app whose stores hold state in memory; without the reload the next write
    stamps the old data back over everything that just arrived.
42. **The server holds ciphertext and cannot name you.** The room id is
    `SHA-256("warren-sync-v1:" + passphrase)` and the payload is AES-GCM sealed
    on the device. `api/sync.ts` is deliberately incapable of reading a journal
    entry. The passphrase and bypass token are in `SECRET_FIELDS`, so an export
    never carries the key to its own room.
43. **Vercel Blob caches for a year by default and the room's URL never
    changes.** `cacheControlMaxAge: 0` on the `put` is load-bearing — without it
    the other device reads a months-old record and the whole feature lies.
44. **One read of a dream, and ONE BUTTON.** PATHFINDER's analysis and the guide
    were separate AI calls over the same dream with separate schemas, and only
    one was wired to progression: analysis output went to SCRAP-7 with origin
    `'log'`, which `feedsProgression` says earns nothing. `spine.ts` is the
    merge — one call returns the VERDICT, the ACTS and the SHELF.
    **A dream card has exactly one button and it is PROMOTE.** PATHFINDER is the
    inbox: you write there and choose there. The read, the forge, the tree and
    the shelf are all on the far side of that one press, in UPLINKS. Writing a
    dream and planning a goal is one intention, and it was split across two
    screens and three presses.
45. **A candidate's KIND is its destination.** `routine` → a chain node, `task` →
    ORBIT as `'manual'`, `basic` → LIFE SUPPORT as `'baseline'`, `proof` → the
    act's boss. Every card says where it lands before it is pressed, and the
    origin is written explicitly rather than inferred. Nothing auto-deploys —
    rule 1 still holds, and adding a routine to the tree is not installing it.
46. **Routines are asked for ONE act at a time.** The slot cap is
    `PRIMARY_MAX_NODES`, so a fifteen-node proposal was always ten things that
    could not be started, drawn as though they were available — and it was both
    the hardest shape for a model to get right and the hardest for a person to
    review. Later acts are `planned`: they carry title, pressure and boss with
    no routines until `deepenAct` fills them against real scores.
47. **Exactly one act is CRITICAL.** `normalizeRead` demotes the rest to `high`.
    A spine where everything is urgent has told you nothing; the critical act is
    the bottleneck the verdict named, and it is where the goal is actually won.
48. **Acts are BANDS in the diagram.** `layoutTree` used to know only about
    prerequisite depth, so a multi-act protocol drew as one undifferentiated
    grid — the structure was in the data and invisible, which is what made a
    proposal read as shapeless. A cross-band prerequisite does not indent the
    band below it; the edge between them is what shows the handover.
49. **The diagram fits the panel; the panel is never resized to fit it.**
    `fitScale` shrinks to the measured width, never grows, and stops at 0.6 —
    past that the labels break rule 38, so the rare too-wide act scrolls instead.
    Both the forge and the live tree use it, and they must keep matching: the
    preview teaches nothing if it doesn't look like what it commits.
50. **Nobody types a category.** The read infers it. Asking the operator to file
    their own dream was making them do the machine's work; the field still
    exists and still groups the list (rule 12).
51. **The guide asks before it plans.** It used to know two things about the
    person it was writing a life plan for — wake time and sleep time — and
    invented everything else. `askInterview` generates 3-5 questions for THIS
    dream, each carrying its own reason, and the answers are constraints in the
    spine prompt. Every question is skippable and a skipped one contributes
    nothing: an interview you cannot leave is a form in a costume. Answers
    persist on the dream so a re-read never re-asks.
52. **Ask for facts, never for identity.** Money, free hours, geography,
    equipment, deadlines, what already failed. No class, no alignment, no "are
    you structured or chaotic" — same reason chronotype comes from mid-sleep
    rather than from asking (rule 18), and the same reason stats are derived
    rather than allocated. People answer identity questions aspirationally.
    A character-creation screen was considered and rejected: it is the most fun
    thing to build here and the least load-bearing.
53. **The record goes into every call.** `record.ts` sorts habits into HOLDING,
    STRUGGLING and ABANDONED off score, streak, tracking history and last-tracked
    date, and the brief tells the guide to anchor to what holds, avoid stacking on
    what struggles, and never re-propose an abandoned routine in the same shape.
    Without it the guide proposes a fourth morning routine after three have died.
    Frozen routines are excluded — they stopped by decision, not by failure
    (rule 3), and a never-tracked habit proves nothing either way.
54. **An effect that spends money fires once.** StrictMode double-invokes effects
    in development, so promoting a dream billed two interview calls. Guarded by
    dream id in `NewUplink`. Same family as rule 37.
55. **A habit is an orphan unless it is `chain` or `baseline`.** `isOrphanHabit`
    tested for `'manual'` and so missed the worst case: a habit synced from
    L.O.G carried `'log'`, was not adopted, was not in `orbitTasks` (todos and
    due dailies only) and was in no chain. It decayed on every reset and was
    drawn on no screen at all.

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

### The queue, in the order I'd take it

**0. End-to-end the sync.** Everything below the network is tested (19 tests:
the decision table, the AES round trip, the room hash), but `api/sync.ts` has
never spoken to a real Blob store — none existed when it was written. First run
with two devices is the real test: push from desktop, pull on web, then change
both and confirm it asks instead of picking.

**1. The three streak defects** (asked about, not yet decided — see §6).
Small fixes, but each changes what a number *means*, so pick before building.

**2. Gamified PATHFINDER — the SPINE landed; the rest of the module has not.**
The read, the shelf and the act bands are built (rules 44-51). Still messy and
untouched: the dream cards themselves, the star-map framing, and the old
mission/task hierarchy, which now sits *underneath* the shelf doing much the
same job. Deciding whether missions survive at all is the next real question —
an act with a shelf is very close to what a mission was for.

**3. SOLARIS levels.** Surface the firmware tier as a visible level with the
next unlock and its condition stated ("v1 Calories — 5 hydration days, you have
2"). The logic in `tools.ts` exists; this is legibility only.

**4. The rest of the tree work.** Scarcity landed (rule 16) and the guide is
asked for 12-18 branching nodes with capstones, but **no real proposal has ever
been read back** — see §6. Optional/side nodes and a visual treatment for
capstones are still open.

**5. Life-support cues ignore the profile.** The timeline and the guide read
wake/sleep now; template cues are still fixed strings, so an owl gets "with
breakfast". `dayShape()` is there when that's worth doing.

**6. Anchor the remaining tours.** Hub and UPLINKS have `data-tour` anchors on
real controls; PATHFINDER, ORBIT, SOLARIS, JOURNAL, A.R.D.O and PICTURES have
written copy but no anchors, so their steps just centre. One attribute each.

**7. The hub is filling up.** Week strip, NOW card, quest panel, bandwidth,
release radar, four tiles. The quest panel earns its size during the starting
zone and collapses to one line afterwards — worth a layout pass once that
steady state is visible, not before.

## 6. Known gaps and honest caveats

### Undecided — the user asked, I answered, no choice made yet
**Three streak defects.** There are three separate streaks and they disagree:

1. `Task.streak` — per habit/task. Habits: `trackHabit` bumps it, `applyDailyReset`
   zeroes it on a miss (frozen routines exempt). Repeating ORBIT tasks:
   `completeTask` bumps it — **and nothing ever breaks it**, because the reset's
   miss-detection lives only in the `habit` branch.
2. `calcStreak()` — the hub week strip. Union of `trackingHistory` +
   `completionHistory`, counted back from today. **A completed to-do does not
   count**: `completeTask` only writes `completionHistory` for `'daily'`. Under
   the one-list model that's arbitrary — clearing *Standup* keeps the streak,
   clearing *Fix the bike* doesn't.
3. The STREAK attribute (`stats.ts`) — `max(streak)` over chain routines only,
   scaled /66. **Life support is invisible to it**: someone whose only habits are
   basics reads `—` forever despite a 40-day run.

My read: (1) and (3) are plainly bugs; (2) is a judgement call about whether
"showing up" includes one-off tasks (I'd say yes). Each changes what a number
means, so decide before building.

### Real caveats
- **No real model has answered `SPINE_SYSTEM` or `INTERVIEW_SYSTEM` yet.** The
  code is thoroughly exercised: 35 spine tests, 16 shelf tests, 15 record tests,
  and the whole promote flow was driven end to end in the browser against a
  stubbed Anthropic endpoint — interview → answers → spine → forge, with the
  request bodies read back to confirm the profile, the answers and the record all
  arrive in the prompt. What is unproven is the *model's* behaviour on these
  prompts. The one real data point is the OLD prompt, which asked for 3-5
  chapters and returned 2; the new one asks for far less, which is the bet.
- **Prompt quality is now the main open risk, not plumbing.** Two things to watch
  on the first real run: whether the interview asks about a genuinely abandoned
  routine by name when the record contains one, and whether the spine visibly
  obeys a hard constraint (say "no budget") rather than proposing a coach anyway.
  Both are prompt-instructed and neither can be unit-tested.
- **`deepenAct` is written and wired to nothing.** The scoped per-act call and
  its normaliser are tested, but no button calls it — a planned act is filled by
  hand in the forge today. That is the next piece of the spine to land.
- **`guide.ts` and `guide.test.ts` are dead** and still on disk; deleting them
  was blocked by a permission prompt. Nothing imports either. `dreamBrief` and
  `GRANTABLE_TOOLS` now live in `spine.ts`.
- **The old mission/task hierarchy still exists under the shelf** and its
  hand-added tasks still sync through `syncTaskToScrap7` with origin `'log'`,
  so they still earn nothing. Habits made that way are now adopted into life
  support on load (rule 51) rather than being invisible, but the overlap between
  a MISSION and an ACT is unresolved — see the queue.
- **The boot-log fix is verified by inspection, not by eye.** The duplicate-line
  bug (a timer chain restarting on every re-render) is fixed by a ref + stable
  deps + cleanup, and `boot.test.ts` pins the script's uniqueness — but the intro
  runs ~4s, shorter than a tool round-trip, so it was never caught mid-render.
  Worth one look on next launch: eleven distinct lines.
- **Stage 1 assumes the dream pipeline works.** CHOOSE ONE DREAM cannot clear
  without promoting a dream, which needs an API key or the BY HAND path. With
  neither a key nor a dream written, a new user is stuck at level 1 — by design,
  but it makes PATHFINDER load-bearing on first run.
- **A released life-support template can't be re-added from the picker.**
  `availableTemplates` filters on habit id and a deleted basic frees its id, so
  this only bites for the `life:own-*` custom ones. Low impact.
- **A blank routine's key is `routine`/`routine-2`.** Keys are permanent and
  derived at creation, so one added before it's named keeps the placeholder.
  Internal only. Deliberate: re-deriving keys would break rule 13.
- **Miss penalties and threshold upgrades are specced but not built** — spec
  step 4. `THRESHOLD_UNLOCK_AT` / `THRESHOLD_COST` exist unused.
- **FUEL multiplier** — `awardXp` takes a `fuelMultiplier` that is always 1.
- **XP_TABLE / xpProgress / levelThreshold in `scrap7/types.ts` are dead code** —
  never imported. `progression/xp.ts` is the live economy. Worth deleting.
- **Data durability is the standing risk.** localStorage in a WebView2 profile;
  one Windows reset loses months of automatism. Export/import exists in
  Settings → Backup (API keys stripped). A disk-backed store is the real fix.
- **Warren OS is dormant** (`WARREN_OS_ENABLED` in `App.tsx`). INFINITY-8's
  `built: false` is NOT dormancy — see rule 34, its code runs in two places.
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

**Ask before assuming** on: the three streak defects in §6 — each one changes
what a number means, and the user has been shown the analysis but hasn't chosen.

**Session note (2026-08-03).** This handoff was written at the end of a long
session and is current as of `0be9abd`. Everything in §4 was decided *with* the
user, usually after being shown a trade-off — if a rule looks arbitrary, it
isn't, and the commit that introduced it explains why. `git log --oneline` reads
as a design diary; the messages carry the reasoning, not just the diff.
