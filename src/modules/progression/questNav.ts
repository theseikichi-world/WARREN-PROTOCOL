import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { type Quest, type Spotlight } from './quests'

// ─── Arriving with a purpose ──────────────────────────────────────────────────
// Tapping a quest used to drop you on a screen and leave. That's only half the
// job: SOLARIS is a whole kitchen, and "reach your water target" doesn't say
// which of the six panels to touch. So the quest travels with you — a banner
// says what you came for, and screens that can highlight their own control
// listen for the same signal.
//
// The state rides on the router rather than a store: it is scoped to one
// navigation and should evaporate the moment you go anywhere else.

export interface QuestNav {
  /** Quest id, so the banner can restate the brief in the user's language. */
  questId?: string
  /** What the destination should point at, when it knows how. */
  spotlight?: Spotlight
}

export const questNav = (quest: Quest, spotlight?: Spotlight): QuestNav =>
  ({ questId: quest.id, ...(spotlight ? { spotlight } : {}) })

/** The quest that sent you here, if any. */
export function useQuestNav(): QuestNav | null {
  const location = useLocation()
  const state = location.state as QuestNav | null
  return state && (state.questId || state.spotlight) ? state : null
}

/** Whether this screen was opened to do a specific thing. */
export function useSpotlight(which: Spotlight): boolean {
  const nav = useQuestNav()
  const [on, setOn] = useState(nav?.spotlight === which)

  // A spotlight is an arrival cue, not a permanent state — it fades on its own
  // so the screen doesn't stay decorated forever.
  useEffect(() => {
    if (nav?.spotlight !== which) { setOn(false); return }
    setOn(true)
    const id = setTimeout(() => setOn(false), 9000)
    return () => clearTimeout(id)
  }, [nav?.spotlight, which])

  return on
}

