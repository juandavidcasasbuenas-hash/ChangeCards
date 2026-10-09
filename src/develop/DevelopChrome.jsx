import { useEffect, useRef, useState } from 'react'
import { useValue } from 'tldraw'
import { CARDS, CATEGORIES, CURATED_ROUTES, cardArtwork } from './catalog.js'
import { displayAuthorName } from './model.js'
import { useDevelop } from './develop-context.js'
import { changeCardMarkdown } from './canvas-actions.js'
import { Icon } from '../safari/primitives.jsx'
import { copyText } from '../safari/field-guide.js'
import './develop.css'
import './routes.css'

export function CategoryMark({ cardId }) {
  const art = cardArtwork(CARDS.find(card => card.id === cardId))
  return <span className="dv-category-mark" aria-hidden="true" style={{ backgroundImage: `url(${art.src})`, ...(art.spriteIndex !== undefined ? { backgroundSize: '600% 400%', backgroundPosition: `${art.spriteIndex % 6 * 20}% ${Math.floor(art.spriteIndex / 6) * 100 / 3}%` } : {}) }}/>
}

function RouteIcon() {
  return <svg className="dv-route-icon" viewBox="0 0 30 20" aria-hidden="true">
    <path d="M7.5 6.2c3.2 0 3.2 6.7 7.5 6.7s4.3-6.7 7.5-6.7"/>
    <rect x="1.5" y="2" width="7" height="9" rx="1" transform="rotate(-5 5 6.5)"/>
    <rect x="11.5" y="8.5" width="7" height="9" rx="1" transform="rotate(3 15 13)"/>
    <rect x="21.5" y="2" width="7" height="9" rx="1" transform="rotate(5 25 6.5)"/>
  </svg>
}

export default function DevelopChrome() {
  const work = useDevelop(), { editor, entries, route, routeCards, activeCardId, category, deckCounts, deal } = work
  const [panel, setPanel] = useState(null)
  const readonly = useValue('develop controls readonly', () => !editor || editor.getInstanceState().isReadonly, [editor])
  const saved = entries.filter(shape => shape.props.note)
  const selectedDeck = CATEGORIES.some(item => item.id === category) ? category : null
  const remaining = selectedDeck ? deckCounts[selectedDeck] : Object.values(deckCounts).reduce((sum, count) => sum + count, 0)
  const draw = event => work.drawFromDeck(selectedDeck, { originElement: event.currentTarget })
  return <div className="dv-navigation">
    <div className="esc-explore-bar dv-explore-bar">
      <nav className="esc-stations dv-categories" aria-label="Explore Change Cards">
        <button className="dv-table-tab" disabled={!editor} aria-pressed={category === 'decks'} onClick={() => work.visit('decks')}>The decks</button>
        {CATEGORIES.map((item, i) => <button key={item.id} className="esc-station-tab" aria-pressed={category === item.id} disabled={!editor} onClick={() => work.visit(item.id)} style={{ '--evidence-color': item.color }}><CategoryMark cardId={[1, 5, 9, 13][i]}/><span>{item.shortLabel}</span><b>{deckCounts[item.id]}</b></button>)}
        {entries.length > 0 && <button className="dv-table-tab" aria-pressed={category === 'table'} onClick={() => work.visit('table')}>Your cards <b>{entries.length}</b></button>}
      </nav>
      <div className="esc-explore-actions dv-explore-actions">
        <button onClick={() => setPanel('routes')} disabled={readonly} aria-label="Choose a curated route"><RouteIcon/><span>Routes</span></button>
        <button onClick={() => setPanel('saved')} disabled={!editor} aria-label={`Scrapbook ${saved.length}`}><Icon name="book" size={17}/><span>Scrapbook</span><b>{saved.length}</b></button>
        <button className="esc-wander" onClick={draw} disabled={readonly || Boolean(deal) || !remaining}><Icon name="shuffle" size={17}/><span>Draw a card</span></button>
      </div>
    </div>
    {route && <div className="dv-route-ribbon">
      <button className="dv-route-overview" onClick={work.showRoute} aria-label={`Show the whole ${route.name} route`}><RouteIcon/><span><small>Your route · {routeCards.filter(shape => shape?.props.note.trim()).length} / 4</small><strong>{route.name}</strong></span></button>
      <ol aria-label="Route steps">{route.cardIds.map((id, i) => {
        const card = CARDS.find(card => card.id === id), shape = routeCards[i], done = Boolean(shape?.props.note.trim())
        return <li key={id}><button onClick={() => work.openRouteCard(i)} disabled={readonly && !shape} className={done ? 'is-done' : ''} aria-current={shape?.id === activeCardId ? 'step' : undefined}><b>{done ? '✓' : i + 1}</b><span>{card.title}</span></button></li>
      })}</ol>
      {routeCards.length === 4 && routeCards.every(shape => shape?.props.note.trim()) && <strong className="dv-route-done">A new direction. ✳</strong>}
      <button className="dv-icon-button" onClick={work.leaveRoute} disabled={readonly} aria-label="Leave route"><Icon name="close" size={16}/></button>
    </div>}

    {panel && <DevelopDialog title={panel === 'routes' ? 'Take a different route.' : 'The ideas worth keeping.'} close={() => setPanel(null)}>
      {panel === 'routes' ? <div className="dv-route-options">{CURATED_ROUTES.map((item, i) => <button key={item.id} onClick={() => { work.chooseRoute(item.id); setPanel(null) }} style={{ '--route-color': CATEGORIES[i % 4].color }}><span className="dv-route-number">0{i + 1} <span>4 cards</span></span><h3>{item.name}</h3><p>{item.purpose}</p><div>{item.cardIds.map(id => <CategoryMark key={id} cardId={id}/>)}<Icon name="arrow"/></div></button>)}</div>
        : <Scrapbook work={work} close={() => setPanel(null)}/>}
    </DevelopDialog>}
    {work.toast && <div className="esc-toast" role="status">{work.toast}</div>}
  </div>
}

function DevelopDialog({ title, close, children }) {
  const ref = useRef(null)
  useEffect(() => { const trigger = document.activeElement, dialog = ref.current; dialog.showModal(); return () => { dialog.close(); trigger?.focus?.({ preventScroll: true }) } }, [])
  return <dialog ref={ref} className="dv-dialog" onCancel={event => { event.preventDefault(); close() }} onClick={event => { if (event.target === event.currentTarget) close() }} aria-labelledby="dv-dialog-title"><header><h2 id="dv-dialog-title">{title}</h2><button className="dv-icon-button" onClick={close} aria-label="Close panel"><Icon name="close"/></button></header>{children}</dialog>
}

function Scrapbook({ work, close }) {
  const { editor } = work
  const order = useValue('scrapbook ordering', () => editor.getCurrentPage().meta.developOrder || [], [editor])
  const entries = [...work.entries.filter(shape => shape.props.note)].sort((a, b) => (order.includes(a.id) ? order.indexOf(a.id) : 9999) - (order.includes(b.id) ? order.indexOf(b.id) : 9999))
  const [selectedIndex, setIndex] = useState(0), [message, setMessage] = useState('')
  const index = Math.min(selectedIndex, Math.max(0, entries.length - 1))
  const shape = entries[Math.min(index, entries.length - 1)], card = CARDS.find(card => card.id === shape?.props.cardId)
  const authorName = displayAuthorName(shape?.props.authorName)
  const move = direction => {
    if (editor.getInstanceState().isReadonly) return
    const ids = entries.map(shape => shape.id), other = index + direction
    if (other < 0 || other >= ids.length) return
    ;[ids[index], ids[other]] = [ids[other], ids[index]]
    const page = editor.getCurrentPage(); editor.updatePage({ id: page.id, meta: { ...page.meta, developOrder: ids } }); setIndex(other)
  }
  const copy = async all => { try { await copyText(all ? work.safari.challenge + '\n\n' + entries.map(changeCardMarkdown).join('') : changeCardMarkdown(shape)); setMessage('Copied.') } catch { setMessage('Use Export → Download from the table.') } }
  return <div className="dv-scrapbook" onKeyDown={event => { if (['TEXTAREA', 'SELECT', 'INPUT'].includes(event.target.tagName) || !entries.length) return; if (event.key === 'ArrowLeft') { event.preventDefault(); setIndex((index + entries.length - 1) % entries.length) } if (event.key === 'ArrowRight') { event.preventDefault(); setIndex((index + 1) % entries.length) } }}>
    {!shape ? <p>Write on a card and save your idea.<br/>It will be here when you need it.</p> : <>
      <nav aria-label="Saved ideas"><button onClick={() => setIndex((index + entries.length - 1) % entries.length)} aria-label="Previous saved idea">←</button><span>{index + 1} / {entries.length}</span><button onClick={() => setIndex((index + 1) % entries.length)} aria-label="Next saved idea">→</button></nav>
      {entries.length > 1 && <select className="dv-saved-jump" aria-label="Jump to saved idea" value={index} onChange={event => setIndex(Number(event.target.value))}>{entries.map((item, i) => <option key={item.id} value={i}>{i + 1}. {CARDS.find(card => card.id === item.props.cardId)?.title}{displayAuthorName(item.props.authorName) ? ` — ${item.props.authorName}` : ''}</option>)}</select>}
      <article className={`dv-saved-card category-${card.category}`}><small>{card.label}</small><CategoryMark cardId={card.id}/><h3>{card.title}</h3><p className="dv-saved-prompt">{card.provocation}</p><p className="dv-saved-writing">{shape.props.note}</p>{authorName && <small>{authorName}</small>}</article>
      <div className="dv-saved-actions"><button onClick={() => { work.openCard(shape.id); close() }}>Open on canvas <Icon name="arrow" size={16}/></button><button onClick={() => copy(false)}>Copy idea</button><button onClick={() => copy(true)}>Copy all</button></div>
      <div className="dv-order-actions"><span>Scrapbook order</span><button disabled={!index} onClick={() => move(-1)}>Move earlier</button><button disabled={index === entries.length - 1} onClick={() => move(1)}>Move later</button></div>
      {message && <p role="status">{message}</p>}
    </>}
  </div>
}
