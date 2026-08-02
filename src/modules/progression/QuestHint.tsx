import { useEffect, useState } from 'react'
import { t as tr } from '../../i18n'
import { QUEST_LINE, type Quest } from './quests'
import { useQuestNav } from './questNav'

// The banner that rides along with a quest — see questNav.ts for the mechanism.

const GOLD = '#ffd700'

/** What you came here to do, restated at the top of wherever you landed. */
export function QuestHintBanner() {
  const nav = useQuestNav()
  const [dismissed, setDismissed] = useState(false)
  const quest: Quest | undefined = QUEST_LINE.find(q => q.id === nav?.questId)

  useEffect(() => { setDismissed(false) }, [nav?.questId])

  if (!quest || dismissed) return null

  return (
    <div style={{
      position: 'absolute', top: 8, left: 12, right: 12, zIndex: 40,
      display: 'flex', alignItems: 'flex-start', gap: 9, padding: '9px 11px', borderRadius: 9,
      background: 'rgba(8,14,26,0.96)', border: `1px solid ${GOLD}45`,
      boxShadow: `0 6px 22px rgba(0,0,0,0.55), 0 0 16px ${GOLD}18`,
      animation: 'slideUp 0.25s ease',
    }}>
      <span style={{ fontSize: 10, color: GOLD, flexShrink: 0, marginTop: 1 }}>⚑</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: 'var(--font)', fontSize: 8, fontWeight: 900, letterSpacing: '0.16em',
          color: GOLD }}>{tr(quest.title, quest.ru)}</p>
        <p style={{ fontFamily: 'var(--font)', fontSize: 8, lineHeight: 1.6, marginTop: 3,
          color: 'rgba(215,232,248,0.82)' }}>{tr(quest.brief, quest.briefRu)}</p>
      </div>
      <button onClick={() => setDismissed(true)}
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0,
          color: 'rgba(148,163,184,0.45)', fontSize: 11, padding: '0 2px' }}>✕</button>
    </div>
  )
}
