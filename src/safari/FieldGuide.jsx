import { Icon, Modal } from './primitives.jsx'
import { lensClass } from './discovery.js'
import { evidenceLabel } from './field-guide.js'

export default function FieldGuide({ safari, cards, onClose, onCopy, onDownload, onPrint, onRemove, onUpdate, onReview, feedback }) {
  return <Modal title="Your field guide" className="sf-guide-dialog" onClose={onClose} feedback={feedback}>
    <p className="sf-guide-challenge">{safari.challenge}</p>
    {cards.length ? <>
      <div className="sf-export-actions"><button className="sf-primary" onClick={onCopy}><Icon name="copy" size={16}/>Copy guide</button><button className="sf-secondary" onClick={onDownload}><Icon name="download" size={16}/>Download</button><button className="sf-icon-button" onClick={onPrint} aria-label="Print field guide or save PDF"><Icon name="print"/></button></div>
      <p className="sf-small-note">{cards.length} finds, your notes & the references. Saved in this browser.</p>
      <label className="sf-reflection">What changed your thinking?<textarea value={safari.reflection || ''} onChange={event => onUpdate({ reflection: event.target.value })} placeholder="A surprise, a connection, a better question…" rows={3} maxLength={8000}/></label>
      <div className="sf-saved-list">{cards.map(card => {
        const source = safari.sources.find(s => s.id === card.sourceId)
        return <article key={card.id} className={lensClass(card.lens)}>
          <div className="sf-saved-top"><span className="sf-lens-tag">{card.lens}</span><button className="sf-icon-button" onClick={() => onRemove(card)} aria-label={`Remove from field guide: ${card.title}`}><Icon name="close" size={16}/></button></div>
          <h3>{card.title}</h3><p>{card.takeaway}</p><a href={source?.url} target="_blank" rel="noreferrer">{source?.domain}<Icon name="external" size={12}/></a>
          <textarea aria-label={`Note on ${card.title}`} placeholder="A thought to keep…" value={safari.notes?.[card.id] || ''} onChange={event => onUpdate({ notes: { ...safari.notes, [card.id]: event.target.value } })} rows={2} maxLength={8000}/>
          <button className="sf-text-button" onClick={() => onReview(card)}>Revisit this find <Icon name="arrow" size={14}/></button>
        </article>
      })}</div>
    </> : <div className="sf-guide-empty"><Icon name="star" size={40}/><h3>A home for the<br/>“oh, that’s interesting”s.</h3><p>Keep a finding as you explore.<br/>Its reference comes with it.</p><button className="sf-secondary" onClick={onClose}>Back to the safari <Icon name="arrow" size={16}/></button></div>}
  </Modal>
}

export function PrintGuide({ safari, cards }) {
  return <div className="sf-print"><p>Evidence Safari · {safari.generatedAt.slice(0, 10)}</p><h1>{safari.challenge}</h1>
    {safari.reflection && <><h2>What changed my thinking</h2><p>{safari.reflection}</p></>}
    {safari.stations.map(station => {
      const findings = cards.filter(c => c.lens === station.lens)
      return findings.length ? <section key={station.lens}><h2>{station.lens} — {station.title}</h2>{findings.map(card => {
        const source = safari.sources.find(s => s.id === card.sourceId)
        return <article key={card.id}><h3>{card.title}</h3><p>{card.finding}</p>
          <p><strong>Original context:</strong> {card.context}</p><p><strong>Why it might matter (hypothesis):</strong> {card.connection}</p>
          <p><strong>Transfer caution:</strong> {card.transferCaution}</p><p><strong>Evidence:</strong> {evidenceLabel(card.evidenceType)}. {card.qualityReason}</p>
          <p><strong>Limitation:</strong> {card.limitation}</p><p><strong>Discuss:</strong> {card.discussionQuestion}</p>
          <p><strong>Source:</strong> {source?.title}<br/>{source?.url}</p><p><strong>Supporting passage (search extract):</strong> “{card.supportQuote}”</p>
          <p>Retrieved {source?.retrievedAt?.slice(0, 10) || 'date not recorded'}.</p>
          {safari.notes?.[card.id] && <p><strong>My note:</strong> {safari.notes[card.id]}</p>}
        </article>
      })}</section> : null
    })}
    <p>AI checked against search-provider extracts. Full texts not independently verified. Connections are hypotheses.</p>
  </div>
}
