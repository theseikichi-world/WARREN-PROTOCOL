// ─── What a routine LOOKS like, as a function of what it is ───────────────────
// Five nodes on a tree used to be five identical rectangles that differed by a
// number underneath. The number is precise and cold: 0.82 tells you nothing at
// a glance, and nothing at all about the standard it is being held to.
//
// So the node carries its own history on its edge. TWO AXES, both already in the
// data and neither able to lie about the other:
//
//   THE RING is automatism — dashed, thin, thick, gold. How little the routine
//   still costs you.
//   THE STARS are the threshold ladder — which of its three standards it is
//   being held to. How much it asks.
//
// A gold frame with no stars is an easy thing mastered; two stars on a thin ring
// is impossible by construction. That is the point of splitting them: the
// picture cannot flatter you, because each mark is a different fact.
//
// Pure over (node, tasks) so the whole vocabulary can be tested without a DOM.

import type { Task } from '../scrap7/types'
import type { ChainNode } from './types'
import { THRESHOLD_UNLOCK_AT } from './types'
import { nodeScore, isUnlocked } from './chain'

/** How much of itself the routine still asks for. Ordered — each contains the last. */
export type Ring = 'locked' | 'open' | 'training' | 'strong' | 'integrated'

/** The score at which a routine stops being new and starts being yours. */
export const STRONG_AT = 0.65

export interface NodeSkin {
  ring:  Ring
  /**
   * Rungs above the first, drawn as stars: 0, 1 or 2. Read straight off
   * `thresholdIndex`, which only ever moves through `raiseThreshold` — a rung
   * is bought with automatism, so a star is something that cost you.
   */
  stars: number
  /**
   * The top standard, made automatic. Not a third state of anything — the
   * conjunction of both axes at their end, which is the only thing in the app
   * that takes months and cannot be shortcut.
   */
  held:  boolean
}

export function nodeSkin(node: ChainNode, tasks: Task[]): NodeSkin {
  const score = nodeScore(node, tasks)
  const top   = node.thresholdIndex >= node.thresholds.length - 1
  const integrated = !!node.scrapTaskId && score >= THRESHOLD_UNLOCK_AT

  const ring: Ring =
    !isUnlocked(node)    ? 'locked'
    : !node.scrapTaskId  ? 'open'
    : integrated         ? 'integrated'
    : score >= STRONG_AT ? 'strong'
    : 'training'

  return {
    ring,
    // Capped at two: three standards means two rungs above the first, and a
    // ladder someone wrote with six rungs must not draw six stars.
    stars: Math.max(0, Math.min(2, node.thresholdIndex)),
    held:  integrated && top && node.thresholds.length > 1,
  }
}
