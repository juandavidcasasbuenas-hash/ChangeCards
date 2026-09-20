import { useEffect, useState } from 'react'
import { Doodle, Icon } from './primitives.jsx'
import { LENSES, lensClass, formatDuration } from './discovery.js'

const STEPS = [
  ['planning', 'Map the territory'], ['searching', 'Follow six leads'], ['writing', 'Find the nuggets'],
  ['checking', 'Check what holds up'], ['curating', 'Lay out your safari'],
]
const HEADLINES = {
  planning: 'Every good safari starts with a question.', searching: 'Looking in a few unexpected places.',
  writing: 'There’s something interesting in here.', checking: 'A closer look before you take a look.', curating: 'Your discoveries are coming together.',
}

export default function ResearchWait({ progress, challenge, startedAt, onCancel }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  const step = Math.max(0, STEPS.findIndex(([name]) => name === progress.stage))
  const elapsed = now - startedAt, stalled = now - (progress.updatedAt || startedAt) > 22000
  const count = progress.stage === 'searching' ? `${progress.completed || 0} of 6 perspectives searched`
    : progress.stage === 'writing' ? `${progress.completed || 0} of 6 perspectives sifted${progress.sources ? ` · ${progress.sources} sources gathered` : ''}`
    : progress.stage === 'checking' ? `${progress.checked || 0} of ${progress.candidates ?? 'the'} candidate findings checked${progress.failedChecks ? ` · ${progress.failedChecks} set aside after an unavailable check` : ''}`
    : progress.stage === 'curating' ? 'Connecting the findings and keeping the gaps visible.'
    : 'Turning your challenge into twelve lines of inquiry.'
  return <section className="sf-research-wait">
    <div className="sf-wait-copy"><p className="sf-eyebrow">Out in the field</p><h1>{HEADLINES[progress.stage] || HEADLINES.planning}</h1><p className="sf-wait-challenge">{challenge}</p>
      <ol className="sf-wait-steps" aria-label="Research stages">{STEPS.map(([name, label], i) => <li key={name} className={i < step ? 'is-complete' : i === step ? 'is-working' : ''} aria-current={i === step ? 'step' : undefined}><span>{i < step ? <Icon name="check" size={14}/> : i + 1}</span>{label}</li>)}</ol>
      <div className="sf-wait-status" role="status" aria-live="polite"><strong>{count}</strong></div>
      <p className="sf-wait-timing"><time>{formatDuration(elapsed)}</time><span>{stalled ? 'Still working on this step. Some sources take longer.' : 'Usually about 1–2 minutes.'}</span></p>
      <button className="sf-text-button" onClick={onCancel}>Cancel</button>
    </div>
    <div className="sf-wait-table" aria-label="Progress across perspectives">{LENSES.map((lens, i) => {
      const state = progress.lenses?.[lens]?.state
      const done = step >= 3 || state === 'done', working = step < 3 && state === 'working'
      return <div key={lens} className={`sf-wait-slip ${lensClass(lens)} ${done ? 'is-ready' : ''} ${working ? 'is-searching' : ''}`} style={{ '--tilt': `${[-5, 4, -2, 5, -4, 2][i]}deg` }}>
        <Doodle lens={lens}/><strong>{lens}</strong><span>{step >= 3 ? 'In the mix' : done ? step === 1 ? 'Sources back' : 'Sifted' : working ? 'Following a lead…' : state === 'unavailable' ? 'A gap to explore' : 'On the map'}</span>
      </div>
    })}</div>
  </section>
}
