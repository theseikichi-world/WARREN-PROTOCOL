# WARREN — VISION

A human RPG. Not a habit tracker with badges bolted on: a character sheet where
every number is a reading off a real life, and the game layer exists to make the
real work legible and worth returning to.

This file is the idea vault. Nothing here is lost because it wasn't built yet.
Status tags: **[BUILT]** · **[NEXT]** · **[PLANNED]** · **[FUTURE]** · **[OPEN QUESTION]**

---

## 1. The spine

```
DREAMS (unlimited, in L.O.G)
   └─ the guide helps you choose — life is finite
       └─ UPLINK (max 2: primary + secondary, second earned at level 5)
           └─ PROTOCOL — a tech tree of ROUTINES
               └─ each routine is a habit carrying an INTEGRATION score (0–1)
                   └─ integration gates the next routine
                       └─ routines grant INSTRUMENTS (modules)
                           └─ instruments deepen by use (FIRMWARE tiers)
```

**[BUILT]** two uplink slots, tech tree with gating, install-by-choice,
integration scoring, XP, levels, character sheet, main quest line.

---

## 2. The morning flow — the target experience

The thing being built toward. Wake up, open Warren, and in one screen:

- **[PLANNED] World signal.** Very important news only — the "the war is over"
  tier — then tech, games, chosen by AI. An explicit antidote to doom-scrolling:
  the feed's job is to let you *stop* reading, not to keep you reading.
- **[PLANNED] Weather as advice, not data.** Not "+15, 60% humidity" but "take
  a coat, it drops to +9 by the time you come back, and take an umbrella."
- **[BUILT] Release radar.** Cinema, tracked shows, new episodes, games.
- **[PLANNED] Steam library link** — import owned games into GALACTIC PICTURES.
- **[PLANNED] AI-suggested side quests.** The guide notices an opening — you're
  drilling monologues, so it suggests a book on scene study — and offers it as a
  quest you may accept or ignore.
- **[BUILT] Then the character tab:** avatar, level, XP, stats, main quest,
  side quests, routines still undone today.

---

## 3. Instruments, introduced one at a time

Titan Quest's starting zone: the game hands you one verb, waits until you've
used it, then hands you the next.

**[BUILT] Main quest line** — journal → hydration → first routine → seven runs →
seven-day log → first text → first routine to `strong`.

**[NEXT] Instruments open small.** A module's first tier must solve the problem
completely, just simply. SOLARIS starts as *hydration only* — no calories, no
macros, no pantry — and grows as it's used. **Gate complexity, never utility:**
if you need a feature today, it ships today; only noise is locked.

| Instrument | Tier 0 | Later |
|---|---|---|
| JOURNAL | free-form entry | prompts → tagged library → AI pattern surfacing |
| SOLARIS | hydration only | calories → macros → pantry → analyzer |
| A.R.D.O | paste + read aloud | SM-2 → cue-line mode → beat breakdown |

**[FUTURE] Journal AI.** Reads what you wrote and suggests — how to make
tomorrow better, what pattern it noticed, what you keep avoiding.

**[FUTURE] Sport coach** — its own instrument, separate from SOLARIS.

---

## 4. RPG mechanics worth stealing

Ranked by fit. Each is judged on one question: does it make the real work more
likely, or does it just decorate it?

### Strong fit

- **[NEXT] Miss penalties with a free first miss.** Never-miss-twice as a
  mechanic: first miss free, second −0.06, third+ −0.10. Already specced.
- **[NEXT] Threshold ladders.** Raising a routine's bar costs −0.20 integration
  because the behaviour genuinely changed. Honest, not punitive.
- **[NEXT] CACHE (inventory).** CRYO freeze, FIREWALL auto-save, OVERCLOCK 2× day,
  ROLLBACK retro-log, WAGER stake. **Rule: an item may protect a streak but never
  advance integration.** You buy permission to have a life, not progress.
- **[PLANNED] Prestige / emblems.** Outperform a routine and its emblem evolves —
  colour, then shape, then frame. WoW artifact traits. *You explicitly said
  future; the base loop needs history behind it first.*
- **[PLANNED] Set bonuses.** Three routines from one chapter all `strong` → a
  small standing bonus. Rewards coherence over scattering.
- **[PLANNED] Dailies vs weeklies.** WoW's rhythm: some things reset daily, some
  weekly. Tier III/IV routines are naturally weekly.
- **[PLANNED] The guide as a character.** JARVIS with a personality — dry, funny,
  occasionally unimpressed. Warren already has module voices; the guide is the
  one that speaks across all of them.
- **[PLANNED] Codex / lore log.** Every breach cleared writes a line in your own
  history. Skyrim's book of achievements, but the entries are true.

### Careful fit

- **[OPEN QUESTION] Real-world events → XP.** Marathon, free yoga, a workshop.
  Real, but the most abusable mechanic here. Options, none fully solved:
  - reward *attendance you logged in advance* (declare before, confirm after) —
    friction beats verification
  - cap event XP per week, so it can never out-earn the daily loop
  - require a journal entry about it — the credit is for the writing, as with
    LOG AS STUDY in PICTURES
  - **my recommendation:** treat it as a *side quest you accept*, cap it hard,
    and never make it competitive with routine work. If it pays more than a
    month of showing up, the incentive is wrong.
- **[OPEN QUESTION] Character class at onboarding.** Fun, but risks boxing you
  in. Better as a *title you earn* from what you actually did — "you have been
  drilling and journaling; the guild calls that a Method Actor."

### Rejected, with reasons

- **Hearts / lives.** Punishes bad weeks and teaches quitting. Integration decay
  already models the truth.
- **Leaderboards / social comparison.** One user, and comparison is the fastest
  way to make an intrinsic activity extrinsic.
- **Loot boxes / random rewards.** Variable-ratio reward is exactly the
  slot-machine pattern the news feed above is meant to be an antidote to.
- **Streak-only scoring.** Why integration exists: a streak breaks, a habit
  doesn't.

---

## 5. Tone

**Rewards inform, never congratulate.** Show the curve, the estimate, the delta.
Over-praise for routine actions erodes the motivation it's imitating, and this
app has exactly one user who knows when he's being flattered.

Vocabulary: UPLINK (goal) · BANDWIDTH (slots) · PROTOCOL (chain) · ROUTINE (node)
· INTEGRATION (automatism) · UPTIME (streak) · BREACH (chapter event) ·
CACHE (inventory) · CREDITS · FIRMWARE v0–v3 (tool tier).

---

## 6. Open architecture decisions

- **[NEXT] Habits leave SCRAP-7.** They currently show in both the tree and
  SCRAP-7's Habits tab. UPLINK should be the only habit surface; SCRAP-7 keeps
  todos and dailies. Existing habits land in an UNBOUND section to attach or
  archive.
- **[NEXT] Dream → tree pipeline.** L.O.G unfreezes as the dream inbox; the
  guide proposes a chain from a dream; every node editable before it commits.
  The seeded ACTOR/CAPOEIRA chains are scaffolding until this exists.
- **[PLANNED] FUEL multiplier.** SOLARIS as a passive multiplier on all XP
  (<40 → ×0.8, >70 → ×1.2) rather than a chain participant.
- **[PLANNED] Data durability.** localStorage in a WebView2 profile is one
  Windows reset from losing months of integration. Export/import exists; a
  disk-backed store is the real fix, and it must land before there's a lot to
  lose.
