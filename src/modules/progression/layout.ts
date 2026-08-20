// ─── Tech-tree layout — prerequisites become a diagram ────────────────────────
// Pure geometry: depth from the prerequisite graph, then fixed-size cells so
// connector lines are arithmetic instead of DOM measurement.
//
// ACTS ARE BANDS. The layout used to know only about prerequisite depth, so a
// protocol with four acts rendered as one undifferentiated grid — the structure
// was in the data and invisible on screen, which is what made a proposal read as
// shapeless. Each act is now its own band, stacked in story order, and an edge
// that crosses from one band to the next is the act handing over to the one
// after it.
//
// Nothing here measures the DOM or reads a container, so the whole thing stays
// testable. Fitting to the available width is a scalar the caller applies.

import type { ChainNode } from './types'

export const NODE_W = 158
export const NODE_H = 90
export const GAP_X  = 18
export const GAP_Y  = 46

/** Room above each band for its act label. */
export const BAND_HEAD = 26
/** A planned act draws as a strip, not a grid — it has nothing in it yet. */
export const BAND_EMPTY_H = 34
export const BAND_GAP = 22

export interface Placed {
  node: ChainNode
  depth: number
  col:   number
  x:     number   // centre
  y:     number   // centre
}

export interface Band {
  index:   number
  title:   string
  /** Named but not yet filled. Draws as a silhouette stating what opens it. */
  planned: boolean
  y:       number   // top of the band's label
  height:  number   // label + content
}

export interface TreeLayout {
  placed: Placed[]
  edges:  { from: Placed; to: Placed }[]
  bands:  Band[]
  width:  number
  height: number
}

/** The slice of a chapter this file needs. Keeps `Chapter` out of the geometry. */
export interface LayoutChapter {
  title:    string
  nodeIds:  string[]
  planned?: boolean
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
    if (!node) { depth.set(id, 0); return 0 }
    // Only prerequisites present in this set count. Within a band that means a
    // cross-act requirement doesn't push the whole band down a row for nothing.
    const deps = node.prerequisiteIds.filter(p => byId.has(p))
    if (deps.length === 0) { depth.set(id, 0); return 0 }

    visiting.add(id)
    const d = 1 + Math.max(...deps.map(resolve))
    visiting.delete(id)
    depth.set(id, d)
    return d
  }

  for (const n of nodes) resolve(n.id)
  return depth
}

/** Rows of one band, centred, returned relative to the band's own top. */
function placeBand(nodes: ChainNode[], width: number): { placed: Placed[]; height: number } {
  const depths = computeDepths(nodes)
  const rows = new Map<number, ChainNode[]>()
  for (const n of nodes) {
    const d = depths.get(n.id) ?? 0
    rows.set(d, [...(rows.get(d) ?? []), n])
  }

  const depthList = [...rows.keys()].sort((a, b) => a - b)
  const height = depthList.length * NODE_H + (depthList.length - 1) * GAP_Y

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

  return { placed, height }
}

/** Widest row across every band — one width so the bands line up. */
function overallWidth(groups: ChainNode[][]): number {
  let maxCols = 1
  for (const nodes of groups) {
    const depths = computeDepths(nodes)
    const counts = new Map<number, number>()
    for (const n of nodes) {
      const d = depths.get(n.id) ?? 0
      counts.set(d, (counts.get(d) ?? 0) + 1)
    }
    for (const c of counts.values()) maxCols = Math.max(maxCols, c)
  }
  return maxCols * NODE_W + (maxCols - 1) * GAP_X
}

/**
 * Place every node and derive the connector edges.
 *
 * Without chapters this is the flat grid it always was — the live skill tree
 * still calls it that way for a single act's worth of nodes. With chapters,
 * each one becomes a band in story order and any node belonging to no chapter
 * falls into a trailing band rather than disappearing.
 */
export function layoutTree(nodes: ChainNode[], chapters?: LayoutChapter[]): TreeLayout {
  if (nodes.length === 0 && !chapters?.length) {
    return { placed: [], edges: [], bands: [], width: 0, height: 0 }
  }

  const byId = new Map(nodes.map(n => [n.id, n]))

  // Group into bands. No chapters means one nameless band holding everything.
  const groups: { title: string; planned: boolean; nodes: ChainNode[] }[] = []
  if (!chapters || chapters.length === 0) {
    groups.push({ title: '', planned: false, nodes })
  } else {
    const claimed = new Set<string>()
    for (const c of chapters) {
      const own = c.nodeIds.map(id => byId.get(id)).filter((n): n is ChainNode => !!n && !claimed.has(n.id))
      for (const n of own) claimed.add(n.id)
      groups.push({ title: c.title, planned: c.planned === true, nodes: own })
    }
    const rest = nodes.filter(n => !claimed.has(n.id))
    if (rest.length) groups.push({ title: '', planned: false, nodes: rest })
  }

  const width = overallWidth(groups.filter(g => g.nodes.length > 0).map(g => g.nodes))

  const placed: Placed[] = []
  const bands:  Band[]   = []
  let y = 0

  groups.forEach((g, i) => {
    const labelled = !!g.title
    const head = labelled ? BAND_HEAD : 0
    if (g.nodes.length === 0) {
      bands.push({ index: i, title: g.title, planned: g.planned, y, height: head + BAND_EMPTY_H })
      y += head + BAND_EMPTY_H + BAND_GAP
      return
    }
    const band = placeBand(g.nodes, width)
    for (const p of band.placed) placed.push({ ...p, y: p.y + y + head })
    bands.push({ index: i, title: g.title, planned: g.planned, y, height: head + band.height })
    y += head + band.height + BAND_GAP
  })

  const height = Math.max(0, y - BAND_GAP)

  const byNodeId = new Map(placed.map(p => [p.node.id, p]))
  const edges: { from: Placed; to: Placed }[] = []
  for (const p of placed) {
    for (const pid of p.node.prerequisiteIds) {
      const from = byNodeId.get(pid)
      if (from) edges.push({ from, to: p })
    }
  }

  return { placed, edges, bands, width, height }
}

/**
 * How much to shrink so the diagram fits the space it was given.
 *
 * The forge used to scroll horizontally inside a panel narrower than the graph,
 * which meant reading a proposal started with resizing the window. Never scales
 * up — a two-node chain drawn at 3× would be absurd — and never below `min`,
 * because past that the labels stop being readable and a diagram you can't read
 * is worse than one you have to scroll. Rule 38 is the floor here.
 */
export function fitScale(contentWidth: number, available: number, min = 0.6): number {
  if (contentWidth <= 0 || available <= 0) return 1
  return Math.max(min, Math.min(1, available / contentWidth))
}
