import { useEffect, useRef } from 'react'
import { Doodle, Icon, Modal } from './primitives.jsx'
import { lensClass } from './discovery.js'
import { evidenceLabel } from './field-guide.js'

const RELATION = { direct: 'Direct evidence', adjacent: 'Related context', analogy: 'An analogy' }

export default function EvidenceFind({ card, source, saved, onSave, onCopy, onClose, onNext, onDetour, canNext, canDetour, feedback, index, total }) {
  const face = useRef(null)
  useEffect(() => { face.current?.closest('dialog')?.scrollTo({ top: 0 }) }, [card.id])
  return <Modal title="A find worth a look" className={`sf-find-dialog ${lensClass(card.lens)}`} onClose={onClose} feedback={feedback}>
    <span className="sf-sr-only" role="status">{card.lens}: {card.title}. {card.takeaway}</span>
    <div className="sf-find-sheet" key={card.id}>
      <div className="sf-find-face" ref={face}>
        <div className="sf-find-meta"><span>{card.lens}</span><span>{index} / {total}</span></div>
        <Doodle lens={card.lens}/>
        <h2>{card.title}</h2>
        <p className="sf-takeaway">{card.takeaway}</p>
        <div className="sf-find-source"><span>{RELATION[card.relevance]}</span><a href={source?.url} target="_blank" rel="noreferrer">{source?.domain}<Icon name="external" size={13}/></a></div>
      </div>
      <div className="sf-find-actions">
        <button className={`sf-keep-button ${saved ? 'is-kept' : ''}`} onClick={onSave} aria-pressed={saved}><Icon name="star" size={19}/>{saved ? 'Kept in your guide' : 'Keep this'}</button>
        <button className="sf-text-button" onClick={onCopy} aria-label="Copy finding and reference"><Icon name="copy" size={15}/>Copy</button>
      </div>
      <details className="sf-look-closer">
        <summary>Look a little closer <Icon name="down" size={16}/></summary>
        <div className="sf-find-depth">
          <p className="sf-finding">{card.finding}</p>
          <p className="sf-context"><strong>The setting.</strong> {card.context}</p>
          <div className="sf-connection"><h3>What could this mean here?</h3><p>{card.connection}</p><small>A hypothesis, with a catch: {card.transferCaution}</small></div>
          <blockquote className="sf-question">{card.discussionQuestion}</blockquote>
          <details className="sf-source-detail"><summary>Source & caveats <Icon name="down" size={14}/></summary><div>
            <p><strong>{evidenceLabel(card.evidenceType)}.</strong> {card.qualityReason}</p>
            <p>{card.limitation}</p>
            <a href={source?.url} target="_blank" rel="noreferrer">{source?.title}<Icon name="external" size={13}/></a>
            <blockquote>“{card.supportQuote}”</blockquote>
            <small>Supporting passage from a search extract. Retrieved {source?.retrievedAt?.slice(0, 10) || 'date not recorded'}. AI checked; full text not independently verified.</small>
          </div></details>
        </div>
      </details>
    </div>
    <nav className="sf-find-navigation" aria-label="Continue exploring">
      <button className="sf-text-button" onClick={onNext} disabled={!canNext}>More {card.lens.toLowerCase()} <Icon name="arrow" size={16}/></button>
      <button className="sf-detour-button" onClick={onDetour} disabled={!canDetour}>Take a detour <Icon name="shuffle" size={17}/></button>
    </nav>
  </Modal>
}
