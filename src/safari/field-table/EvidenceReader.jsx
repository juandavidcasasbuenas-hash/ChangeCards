import { useEffect, useRef, useState } from 'react'
import { useEditor, useValue } from 'tldraw'
import { cardMarkdown, copyText, evidenceLabel } from '../field-guide.js'
import { Doodle, Icon } from '../primitives.jsx'
import { LENS_COLORS, safeSourceUrl } from './model.js'
import { closeReading, readingSession, turnCard } from './card-reading.js'
import { evidenceShapes, ignorePointer, keepFinding, wander } from './canvas-actions.js'

export default function EvidenceReader() {
  const editor = useEditor()
  const shape = useValue('reading evidence', () => {
    const session = readingSession(editor).get()
    return session ? editor.getShape(session.shapeId) : null
  }, [editor])
  return shape ? <Reader key={shape.id} editor={editor} shape={shape}/> : null
}

function Reader({ editor, shape }) {
  const { card, source } = shape.props.evidence
  const dialog = useRef(null)
  const closeButton = useRef(null)
  const [copied, setCopied] = useState('')
  const peers = useValue('available findings', () => evidenceShapes(editor), [editor])
  const sameLens = peers.filter(item => item.props.evidence.card.lens === card.lens)
  const index = sameLens.findIndex(item => item.id === shape.id)
  const kept = peers.some(item => item.props.evidence.card.id === card.id && item.meta.safariKept)
  const sourceUrl = safeSourceUrl(source?.url)
  useEffect(() => {
    const element = dialog.current
    element.showModal()
    closeButton.current?.focus({ preventScroll: true })
    const page = editor.getCurrentPage()
    editor.run(() => editor.updatePage({ id: page.id, meta: { ...page.meta,
      safariSeenIds: [...new Set([...(page.meta.safariSeenIds || []), card.id])] } }), { history: 'ignore' })
    return () => element.close()
  }, [editor, card.id])
  const copy = async () => {
    try { await copyText(cardMarkdown(card, source)); setCopied('Copied with source') }
    catch { setCopied('Copy unavailable. Use Export from the table.') }
  }
  const next = () => turnCard(editor, sameLens[(index + 1) % sameLens.length])
  return <dialog ref={dialog} className="esc-reader" aria-labelledby="esc-reader-title" style={{ '--evidence-color': LENS_COLORS[card.lens] }}
    onCancel={event => { event.preventDefault(); closeReading(editor) }}
    onClick={event => { if (event.target === event.currentTarget) closeReading(editor) }}
    onPointerDown={ignorePointer} onKeyDown={ignorePointer} onWheel={ignorePointer}>
    <div className="esc-reader-sheet">
      <header className="esc-reader-top"><span>{card.lens} <span className="esc-reader-index">{index + 1} / {sameLens.length}</span></span>
        <div><button onClick={copy} aria-label="Copy finding with source" title={copied || 'Copy with source'}><Icon name={copied === 'Copied with source' ? 'check' : 'copy'}/></button>
          <button ref={closeButton} onClick={() => closeReading(editor)} aria-label="Close evidence"><Icon name="close"/></button></div>
      </header>
      <div className="esc-reader-scroll" key={card.id}>
        <div className="esc-reader-hero"><Doodle lens={card.lens}/><span className="esc-reader-kind">{evidenceLabel(card.evidenceType)}</span><h2 id="esc-reader-title">{card.title}</h2></div>
        <div className="esc-reader-body">
          <section><h3>What the evidence says</h3><p className="esc-reader-finding">{card.finding}</p></section>
          {card.connection && <section className="esc-reader-connection"><h3>A possible connection</h3><p>{card.connection}</p></section>}
          {card.discussionQuestion && <p className="esc-reader-question"><span aria-hidden="true">↳</span>{card.discussionQuestion}</p>}
          <details className="esc-reader-details"><summary>Context & cautions <Icon name="plus" size={15}/></summary>
            <section><h3>The original setting</h3><p>{card.context}</p></section>
            <section><h3>Before borrowing this idea</h3><p>{card.transferCaution}</p></section>
            <section><h3>Strength & limitations</h3><p>{card.qualityReason}</p><p>{card.limitation}</p></section>
          </details>
          <div className="esc-reader-source"><span>Follow the source</span>
            {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer">{source.title || source.domain}<Icon name="external" size={16}/></a> : <p>Source unavailable</p>}
            {card.supportQuote && <details className="esc-reader-quote"><summary>See the supporting extract <Icon name="down" size={14}/></summary><blockquote>“{card.supportQuote}”</blockquote></details>}
            <small>AI checked against a search extract. Full text not independently verified.{source?.retrievedAt && ` Retrieved ${source.retrievedAt.slice(0, 10)}.`}</small>
          </div>
          {copied && <p className="esc-reader-feedback" role="status">{copied}</p>}
        </div>
      </div>
      <footer className="esc-reader-actions">
        <button className={`esc-keep ${kept ? 'is-kept' : ''}`} aria-pressed={kept} onClick={() => keepFinding(editor, card.id)}><Icon name={kept ? 'check' : 'bookmark'} size={17}/>{kept ? 'Kept' : 'Keep this'}</button>
        <button className="esc-next-find" disabled={sameLens.length < 2} onClick={next}>Next in {card.lens}<Icon name="arrow" size={17}/></button>
        <button className="esc-detour" onClick={() => wander(editor, { avoidLens: card.lens, currentId: card.id })} disabled={!peers.some(item => item.props.evidence.card.lens !== card.lens)} aria-label="Take a detour to another perspective" title="Take a detour"><Icon name="shuffle" size={19}/></button>
      </footer>
    </div>
  </dialog>
}
