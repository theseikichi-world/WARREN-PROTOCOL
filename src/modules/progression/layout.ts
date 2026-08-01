// ─── Tech-tree layout — prerequisites become a diagram ────────────────────────
// Pure geometry: depth from the prerequisite graph, then fixed-size cells so
// connector lines are arithmetic instead of DOM measurement.

import type { ChainNode } from './types'

export const NODE_W = 132
export const NODE_H = 76
export const GAP_X  = 18
export const GAP_Y  = 46

export interface Placed {
  node: ChainNode
  depth: number
  col:   number
  x:     number   // centre
  y:     number   // centre
}

export interface TreeLayout {
  placed: Placed[]
  edges:  { from: Placed; to: Placed }[]
  width:  number
  height: number
}

/**
 * Depth = longest path from an entry node, so a routine always sits below
 * everything it needs. Cycles can't hang the walk: each node resolves once.
 */
export function computeDepths(nodes: ChainNode[]): Map<string, number> {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const depth = new Map<string, number>()
  const visiting = new Set<string>()

  const resolve = (id: string): number => {
    const cached = depth.get(id)
    if (cached !== undefined) return cached
    if (visiting.has(id)) return 0            // defensive: broken graph, don't recurse
    const node = byId.get(id)
    if (!node || node.prerequisiteIds.length === 0) { depth.set(id, 0); return 0 }

    visiting.add(id)
    const d = 1 + Math.max(...node.prerequisiteIds.map(resolve))
    visiting.delete(id)
    depth.set(id, d)
    return d
  }

  for (const n of nodes) resolve(n.id)
  return depth
}

/** Place every node on a grid and derive the connector edges. */
export function layoutTree(nodes: ChainNode[]): TreeLayout {
  if (nodes.length === 0) return { placed: [], edges: [], width: 0, height: 0 }

  const depths = computeDepths(nodes)
  const rows = new Map<number, ChainNode[]>()
  for (const n of nodes) {
    const d = depths.get(n.id) ?? 0
    rows.set(d, [...(rows.get(d) ?? []), n])
  }

  const maxCols = Math.max(...[...rows.values()].map(r => r.length))
  const width   = maxCols * NODE_W + (maxCols - 1) * GAP_X
  const depthList = [...rows.keys()].sort((a, b) => a - b)
  const height  = depthList.length * NODE_H + (depthList.length - 1) * GAP_Y

  const placed: Placed[] = []
  depthList.forEach((d, rowIndex) => {
    const row = rows.get(d)!
    const rowWidth = row.length * NODE_W + (row.length - 1) * GAP_X
    const offset   = (width - rowWidth) / 2          // centre each row
    row.forEach((node, col) => {
      placed.push({
        node, depth: d, col,
        x: offset + col * (NODE_W + GAP_X) + NODE_W / 2,
        y: rowIndex * (NODE_H + GAP_Y) + NODE_H / 2,
      })
    })
  })

  const byId = new Map(placed.map(p => [p.node.id, p]))
  const edges: { from: Placed; to: Placed }[] = []
  for (const p of placed) {
    for (const pid of p.node.prerequisiteIds) {
      const from = byId.get(pid)
      if (from) edges.push({ from, to: p })
    }
  }

  return { placed, edges, width, height }
}
