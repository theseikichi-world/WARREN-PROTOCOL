import { useEffect, useState } from 'react'
import { loadProgression } from './store'
import type { Dream } from '../log/types'
import { DreamsPanel } from './DreamsPanel'
import { NewUplink } from './NewUplink'

// ─── DREAMS, as a surface of its own ──────────────────────────────────────────
// The dream list and the promote flow used to be a tab inside UPLINKS, which
// put the place a goal is BORN inside the screen that shows goals already
// running. They are different moments: one is choosing, the other is working.
//
// This is the pair of them — the list, and the interview-read-forge run that
// turns one dream into an uplink — with no tab bar around it, so it can be the
// thing a hub card maximizes into.

export function DreamsSurface({ onCommitted }: { onCommitted?: () => void }) {
  const [goals, setGoals] = useState(() => loadProgression().goals)
  const [promoting, setPromoting] = useState<Dream | null>(null)

  useEffect(() => {
    const refresh = () => setGoals(loadProgression().goals)
    window.addEventListener('warren:sync', refresh)
    window.addEventListener('focus', refresh)
    return () => { window.removeEventListener('warren:sync', refresh); window.removeEventListener('focus', refresh) }
  }, [])

  return (
    <div className="fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px' }}>
        <DreamsPanel
          promotedIds={new Set(goals.map(g => g.sourceDreamId).filter((id): id is string => !!id))}
          onPromote={d => setPromoting(d)} />
      </div>

      {/* One press runs the interview, the read and the forge. It lands back
          here rather than in another module. */}
      {promoting && (
        <NewUplink accent="#00f5ff" dream={promoting}
          onClose={() => setPromoting(null)}
          onCommitted={() => {
            setPromoting(null)
            setGoals(loadProgression().goals)
            onCommitted?.()
          }} />
      )}
    </div>
  )
}
