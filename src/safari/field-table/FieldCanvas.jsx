import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  BaseBoxShapeUtil, Box, DefaultMainMenu, DefaultMainMenuContent, DefaultMenuPanel,
  DefaultStylePanel, HTMLContainer, T, Tldraw, TldrawUiMenuGroup, TldrawUiMenuItem,
  createShapeId, toRichText, useEditor, useToasts, useValue,
} from 'tldraw'
import { copyText, downloadGuide, evidenceLabel } from '../field-guide.js'
import { Doodle, Icon } from '../primitives.jsx'
import { formatDuration, LENSES } from '../discovery.js'
import { trailStatus } from '../live.js'
import { LENS_COLORS, readTable, safeSourceUrl } from './model.js'
import { CANVAS_KEY, CARD_W, CARD_H, canvasFieldNotes, evidencePayload, evidencePiles, incomingEvidence, sourceCardMigration, wrapSvgText } from './canvas-model.js'
import { closeReading, readingSession, turnCard } from './card-reading.js'
import 'tldraw/tldraw.css'
import './field-table.css'

const SafariContext = createContext(null)
const OPTIONS = { maxPages: 1 }
const updatingCanvas = new WeakSet()
const sid = id => createShapeId(`evidence-${id}`)
const ignorePointer = event => event.stopPropagation()

function focusShape(editor, id) {
  const bounds = editor.getShapePageBounds(id)
  if (!bounds) return
  editor.setCurrentTool('select').select(id)
  editor.bringToFront([id])
  editor.zoomToBounds(bounds, { inset: 85, targetZoom: 1, animation: { duration: 280 } })
}

function connect(editor, fromId, toId, label = '', options = {}) {
  const id = createShapeId()
  editor.createShape({ id, type: 'arrow', props: {
    color: 'grey', size: 's', dash: 'draw', arrowheadEnd: 'arrow',
    start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, richText: toRichText(label), ...options,
  } })
  editor.createBindings([
    { type: 'arrow', fromId: id, toId: fromId, props: { terminal: 'start', normalizedAnchor: { x: .5, y: .5 }, isExact: false, isPrecise: false } },
    { type: 'arrow', fromId: id, toId, props: { terminal: 'end', normalizedAnchor: { x: .5, y: .5 }, isExact: false, isPrecise: false } },
  ])
  editor.sendToBack([id])
  return id
}

function CardFace({ shape }) {
  const editor = useEditor()
  const { card = {}, source } = shape.props.evidence || {}
  const controlsEnabled = useValue('card controls', () => ['select', 'hand'].includes(editor.getCurrentToolId()), [editor])
  const isBack = useValue('card side', () => readingSession(editor).get()?.shapeId === shape.id, [editor, shape.id])
  const scrollRef = useRef(null), touch = useRef(null)
  const [arriving] = useState(() => Date.now() - (shape.meta.safariArrivedAt || 0) < 1500)
  const height = shape.props.h * CARD_W / shape.props.w
  const accent = LENS_COLORS[card.lens] || '#c6d0af'
  useEffect(() => {
    const element = scrollRef.current
    if (!element || !isBack || !controlsEnabled) return
    element.scrollTop = 0
    // Stop the native wheel before it reaches tldraw's canvas listener; preserve pinch zoom.
    const wheel = event => { if (!event.ctrlKey && !event.metaKey) event.stopPropagation() }
    element.addEventListener('wheel', wheel, { passive: true })
    return () => element.removeEventListener('wheel', wheel)
  }, [isBack, controlsEnabled])
  const scrollPointerDown = event => {
    if (!controlsEnabled) return
    event.stopPropagation()
    if (event.pointerType === 'touch' && !event.target.closest('a')) {
      touch.current = { id: event.pointerId, y: event.clientY }
      event.currentTarget.setPointerCapture(event.pointerId)
    }
  }
  const scrollPointerMove = event => {
    if (!touch.current || touch.current.id !== event.pointerId) return
    event.stopPropagation()
    scrollRef.current.scrollTop += (touch.current.y - event.clientY) / (editor.getZoomLevel() * shape.props.w / CARD_W)
    touch.current.y = event.clientY
  }
  return <HTMLContainer style={{ width: shape.props.w, height: shape.props.h }}>
    <div className="esc-card-shell" data-evidence-id={card.id} data-card-face={isBack ? 'back' : 'front'} data-arriving={arriving || undefined}
      style={{ width: CARD_W, height, transform: `scale(${shape.props.w / CARD_W})`, '--evidence-color': accent, '--arrival-delay': `${(shape.meta.safariArrivalOrder || 0) * 65}ms` }}>
      <div className="esc-card-rotor">
        <article className="esc-evidence esc-card-front" aria-label={`Evidence card: ${card.title}`} aria-hidden={isBack} inert={isBack}>
          <header className="esc-card-meta"><span><i/>{card.lens}</span><span>EVIDENCE SAFARI</span></header>
          <h2>{card.title}</h2>
        <p className="esc-card-takeaway">{card.takeaway}</p>
        <p className="esc-card-kind">{evidenceLabel(card.evidenceType)}</p>
          <footer className="esc-card-footer"><span>{source?.domain || 'Source unrecorded'}</span><span className="esc-turn-hint">Turn over</span></footer>
        </article>
        <article className="esc-evidence esc-card-back" aria-label={`Reverse of card: ${card.title}`} aria-hidden={!isBack} inert={!isBack}>
          <header className="esc-card-meta"><span><i/>{card.lens}</span><span>SOURCE & CONTEXT</span></header>
          <div className="esc-card-scroll" ref={scrollRef} role="region" aria-label={`Read the evidence: ${card.title}`} tabIndex={isBack && controlsEnabled ? 0 : -1}
            onPointerDown={scrollPointerDown} onPointerMove={scrollPointerMove} onPointerUp={() => { touch.current = null }} onPointerCancel={() => { touch.current = null }}
            onDoubleClick={controlsEnabled ? ignorePointer : undefined} onKeyDown={controlsEnabled ? ignorePointer : undefined}>
            <h2>{card.title}</h2>
            <div className="esc-source-section"><h3>What the source found</h3><p>{card.finding}</p></div>
            <div className="esc-source-section"><h3>The original setting</h3><p>{card.context}</p></div>
            <div className="esc-source-caution"><h3>{evidenceLabel(card.evidenceType)}</h3><p>{card.qualityReason}</p><p>{card.limitation}</p></div>
            <div className="esc-source-section"><h3>Before borrowing this idea</h3><p>{card.transferCaution}</p></div>
            <blockquote>“{card.supportQuote}”</blockquote>
            <div className="esc-source-reference"><a href={safeSourceUrl(source?.url)} target="_blank" rel="noreferrer" style={{ pointerEvents: controlsEnabled ? 'all' : 'none' }}>{source?.title || source?.domain || 'Source unavailable'} <Icon name="external" size={12}/></a><p>Search extract · {source?.retrievedAt?.slice(0, 10) || 'retrieval date unrecorded'}<br/>AI checked; full text not independently verified.</p></div>
          </div>
          <footer className="esc-card-footer"><span>Scroll to read <span aria-hidden="true">↓</span></span><span className="esc-turn-hint">Back to table</span></footer>
        </article>
      </div>
      <button className="esc-flip-button" onPointerDown={ignorePointer} onDoubleClick={ignorePointer} onKeyDown={ignorePointer} onClick={() => turnCard(editor, shape)}
        style={{ pointerEvents: controlsEnabled ? 'all' : 'none' }} tabIndex={controlsEnabled ? 0 : -1}
        aria-label={isBack ? `Close card and return to table: ${card.title}` : `Flip and read: ${card.title}`}
        aria-expanded={isBack} title={isBack ? 'Flip back to the table (Esc)' : 'Turn over to read'}><span aria-hidden="true">+</span></button>
    </div>
  </HTMLContainer>
}

function SvgCard({ shape }) {
  const { card = {}, source } = shape.props.evidence || {}
  const w = CARD_W, h = shape.props.h * w / shape.props.w
  let y = 72
  const blocks = []
  const addText = (text, size, color, gap = 15, family = 'Arial, sans-serif') => {
    for (const line of wrapSvgText(text, w - 48, size)) {
      blocks.push(<text key={blocks.length} x={24} y={y} fontSize={size} fill={color} fontFamily={family}>{line}</text>)
      y += size * 1.3
    }
    y += gap
  }
  addText(card.title, 27, '#293227', 17, 'Georgia, serif')
  addText(card.takeaway, 14, '#515e49', 18)
  addText(evidenceLabel(card.evidenceType), 10, '#6d7a60')
  return <g transform={`scale(${shape.props.w / w})`}>
    <rect width={w} height={h} rx={5} fill="#fffdf6" stroke="#d6dacd"/>
    <path d={`M5 0H${w - 5}Q${w} 0 ${w} 5V7H0V5Q0 0 5 0Z`} fill={LENS_COLORS[card.lens] || '#bdc9ad'}/>
    <text x={24} y={35} fontFamily="Arial, sans-serif" fontSize={10} fill="#64705b">{card.lens} · Evidence Safari</text>
    {blocks}
    <line x1={24} x2={w - 24} y1={h - 44} y2={h - 44} stroke="#dfe3d5"/>
    <a href={safeSourceUrl(source?.url)}><text x={24} y={h - 21} fontSize={10} fontFamily="Arial, sans-serif" fill="#536d45">{source?.domain || 'Source unrecorded'}</text></a>
  </g>
}

class EvidenceShapeUtil extends BaseBoxShapeUtil {
  static type = 'safari-evidence-card'
  static props = { w: T.number, h: T.number, evidence: T.jsonValue }
  getDefaultProps() { return { w: CARD_W, h: CARD_H, evidence: { card: {}, source: null } } }
  isAspectRatioLocked() { return true }
  canEdit() { return false }
  onDoubleClick(shape) {
    focusShape(this.editor, shape.id)
    return shape // Consume the gesture instead of tldraw's default “create text” fallback.
  }
  component(shape) { return <CardFace shape={shape}/> }
  getText(shape) { const { card } = shape.props.evidence; return `${card.title}\n${card.takeaway}` }
  getIndicatorPath(shape) { const path = new Path2D(); path.roundRect(0, 0, shape.props.w, shape.props.h, 5); return path }
  toSvg(shape) { return <SvgCard shape={shape}/> }
}

class SourceShapeUtil extends EvidenceShapeUtil {
  // Read old saved documents; new cards never use this type.
  static type = 'safari-source-card'
  static props = { w: T.number, h: T.number, evidence: T.jsonValue, findingShapeId: T.string }
  getDefaultProps() { return { w: CARD_W, h: CARD_H, evidence: { card: {}, source: null }, findingShapeId: '' } }
}

function TrailFace({ shape }) {
  const { run } = useContext(SafariContext)
  const lens = shape.props.lens
  return <HTMLContainer style={{ width: shape.props.w, height: shape.props.h, pointerEvents: 'none' }}>
    <div className="esc-trail" data-trail={lens} style={{ '--evidence-color': LENS_COLORS[lens] }}>
      <Doodle lens={lens}/><strong>{lens}</strong><span>{trailStatus(lens, run?.progress, run?.busy)}</span>
    </div>
  </HTMLContainer>
}

class TrailShapeUtil extends BaseBoxShapeUtil {
  static type = 'safari-trail'
  static props = { w: T.number, h: T.number, lens: T.string }
  getDefaultProps() { return { w: CARD_W, h: CARD_H, lens: 'People' } }
  canEdit() { return false }
  canBind() { return false }
  component(shape) { return <TrailFace shape={shape}/> }
  getIndicatorPath() { return new Path2D() }
  toSvg(shape) { return <text x={20} y={40} fill="#68765b" fontSize={20}>{shape.props.lens} · an open question</text> }
}

function CanvasProgress() {
  const { safari, run } = useContext(SafariContext)
  const editor = useEditor()
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!run?.busy) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [run?.busy])
  if (!run) return null
  const count = safari.cards.length
  const finding = [...safari.cards].reverse().find(card => editor.getShape(sid(card.id)))
  const stage = run.progress?.stage
  const headline = run.error ? 'Your table is here to keep.' : run.busy
    ? count ? `${count} finds uncovered. More on the way.`
      : stage === 'planning' ? 'Mapping your question…' : stage === 'searching' ? 'Following six leads…' : 'The first finds are taking shape…'
    : safari.status === 'complete' ? `${count} finds. Where will you wander?` : `${count} finds. A few trails left open.`
  return <div className={`esc-progress ${run.busy ? 'is-working' : ''}`} onPointerDown={ignorePointer} onKeyDown={ignorePointer} data-research-busy={run.busy}>
    <div className="esc-progress-copy" role="status" aria-live="polite" aria-atomic="true"><strong>{headline}</strong>
      {run.error || run.notice ? <span>{run.error || run.notice}</span> : !count && <span>Checked evidence will land here as it’s ready.</span>}
    </div>
    <div className="esc-progress-bottom">
      <span className="esc-progress-trails" aria-label={`${new Set(safari.cards.map(card => card.lens)).size} of six perspectives on the table`}>
        {LENSES.map(lens => <i key={lens} title={lens} className={safari.cards.some(card => card.lens === lens) ? 'has-finds' : ''} style={{ '--trail-color': LENS_COLORS[lens] }}/>)}</span>
      {run.busy && <time aria-label="Elapsed time">{formatDuration(Math.max(0, now - run.startedAt))}</time>}
      {finding && <button className="esc-latest" onClick={() => focusShape(editor, sid(finding.id))}>{run.busy ? 'See latest' : 'Explore'} <Icon name="arrow" size={13}/></button>}
      {run.busy ? <button className="esc-stop" onClick={run.onStop}>{count ? 'Stop here' : 'Cancel'}</button> : <button className="esc-stop" onClick={run.onHome}>New safari</button>}
    </div>
  </div>
}

function CanvasMenuPanel() {
  return <div className="esc-menu-panel"><DefaultMenuPanel/><div className="esc-brand"><strong>EVIDENCE SAFARI <span>✳</span></strong><span>field table</span></div></div>
}

function CanvasStylePanel(props) {
  const editor = useEditor()
  const needed = useValue('show drawing styles', () => editor.getSelectedShapeIds().length > 0 || !['select', 'hand'].includes(editor.getCurrentToolId()), [editor])
  return needed ? <DefaultStylePanel {...props}/> : null
}

function CanvasMainMenu() {
  const editor = useEditor(), { safari, run } = useContext(SafariContext)
  const { addToast } = useToasts()
  const fieldNotes = () => {
    const shapes = editor.getCurrentPageShapes()
    const bindings = shapes.flatMap(shape => shape.type === 'arrow' ? editor.getBindingsFromShape(shape.id, 'arrow') : [])
    return canvasFieldNotes(safari, shapes, bindings)
  }
  return <DefaultMainMenu><TldrawUiMenuGroup id="field-notes">
    <TldrawUiMenuItem id="copy-safari" label="Copy field notes with sources" icon="copy" onSelect={async () => {
      try { await copyText(fieldNotes()); addToast({ title: 'Copied with sources and canvas notes.' }) }
      catch { addToast({ title: 'Could not copy. Try downloading the field notes.' }) }
    }}/>
    <TldrawUiMenuItem id="download-safari" label="Download field notes" icon="download" onSelect={() => downloadGuide(fieldNotes(), safari.challenge)}/>
    <TldrawUiMenuItem id="back-safari" label="Back to safaris" icon="arrow-left" onSelect={() => { if (run?.onHome) run.onHome(); else location.href = '/safari' }}/>
  </TldrawUiMenuGroup><DefaultMainMenuContent/></DefaultMainMenu>
}

const SHAPES = [EvidenceShapeUtil, SourceShapeUtil, TrailShapeUtil]
const COMPONENTS = { MenuPanel: CanvasMenuPanel, MainMenu: CanvasMainMenu, StylePanel: CanvasStylePanel, TopPanel: CanvasProgress }

function textShape(id, text, x, y, props = {}, scaffolding = true) {
  return { id: sid(id), type: 'text', x, y, meta: { safariScaffolding: scaffolding }, props: {
    richText: toRichText(text), font: 'draw', size: 'm', color: 'grey', autoSize: false, w: 430, ...props,
  } }
}

function seedCanvas(editor, safari, legacy) {
  if (editor.getPages().some(page => page.meta.safariCanvasVersion === 2 && page.meta.safariSeedComplete)) return false
  editor.run(() => {
    editor.updatePage({ id: editor.getCurrentPageId(), name: 'Evidence Safari' })
    editor.createShapes([
      textShape('eyebrow', 'EVIDENCE SAFARI / THE QUESTION WE CAME WITH', 0, -35, { size: 's', font: 'mono', scale: .55, w: 1800 }),
      textShape('question', safari.challenge, 0, 0, { font: 'serif', size: 'xl', w: 940, color: 'black' }, false),
      textShape('invitation', 'Pull out a card. Draw a connection.\nSee where it takes you.', 1000, 15, { size: 'm', w: 370, scale: .9 }),
    ])
    for (const pile of evidencePiles(safari, { includeEmpty: true })) {
      editor.createShape(textShape(`label-${pile.lens}`, `${pile.lens}  /  ${pile.cards.length ? `${pile.cards.length} finds` : 'exploring'}`, pile.x, pile.y - 65, { font: 'draw', size: 'm', w: 360, color: 'grey' }))
      if (!pile.cards.length) editor.createShape({ id: sid(`waiting-${pile.lens}`), type: 'safari-trail', x: pile.x, y: pile.y, isLocked: true,
        props: { lens: pile.lens }, meta: { safariScaffolding: true } })
      pile.cards.forEach((card, i) => {
        const depth = pile.cards.length - 1 - i
        editor.createShape({ id: sid(card.id), type: 'safari-evidence-card', x: pile.x + depth * 13, y: pile.y + depth * 12,
          rotation: depth ? (depth % 2 ? .025 : -.018) : (pile.lens === 'Patterns' ? .015 : pile.lens === 'Edges' ? -.018 : 0),
          props: { evidence: evidencePayload(safari, card) },
        })
      })
    }
    editor.createShape(textShape('gesture-tip', 'A  →  arrows     N  →  sticky notes     F  →  frames\nShift-click cards, then ⌘G to group. Everything can move.', 0, 1120, { font: 'mono', size: 's', scale: .65, w: 1700 }))
    editor.createShape({ id: sid('wondering'), type: 'note', x: 1400, y: 340, rotation: .035, meta: { safariScaffolding: true },
      props: { color: 'yellow', richText: toRichText('What are you noticing?\n\nAn echo?\nA tension?\nAn unexpected link?'), size: 'm', font: 'draw', scale: 1.35 } })
    editor.createShape(textShape('open-space', 'room to think →', 1320, 215, { font: 'draw', size: 'm', w: 380, color: 'grey' }))
    migrateNotes(editor, safari, legacy)
    editor.updatePage({ id: editor.getCurrentPageId(), meta: { safariCanvasVersion: 2, safariId: safari.id, safariSeedComplete: true, safariImportedIds: safari.cards.map(card => card.id) } })
  }, { history: 'ignore' })
  return true
}

function migrateNotes(editor, safari, legacy) {
  const notes = Object.entries(safari.notes || {}).filter(([, value]) => String(value).trim())
  if (!notes.length && !legacy.threads.length && !legacy.reflection) return
  editor.createShape(textShape('previous-notes', 'Your earlier field notes', 0, 1300, { font: 'serif', size: 'l', w: 800 }))
  let x = 0
  for (const [cardId, note] of notes) {
    const card = safari.cards.find(item => item.id === cardId)
    if (!card) continue
    editor.createShape(textShape(`old-note-${cardId}`, `${card.title}\n\n${note}`, x, 1390, { w: 370, size: 'm', font: 'draw', color: 'green' }, false))
    x += 430
  }
  if (legacy.reflection) editor.createShape(textShape('old-reflection', `What changed my thinking\n\n${legacy.reflection}`, x, 1390, { w: 430, size: 'm', font: 'draw', color: 'green' }, false))
  legacy.threads.forEach((thread, i) => {
    const frameId = sid(`previous-${thread.id}`)
    editor.createShape({ id: frameId, type: 'frame', x: i * 900, y: 1800, props: { w: 830, h: 860, name: thread.title } })
    thread.cardIds.forEach((id, j) => {
      const card = safari.cards.find(item => item.id === id)
      if (card) editor.createShape({ id: sid(`${thread.id}-${id}`), type: 'safari-evidence-card', parentId: frameId, x: 32 + j * 420, y: 35, props: { evidence: evidencePayload(safari, card) } })
    })
    const noteId = sid(`${thread.id}-interpretation`)
    editor.createShape({ ...textShape(`${thread.id}-interpretation`, `${thread.observation}\n\n${thread.question}\n\nNext: ${thread.nextStep}`, 40, 440, { w: 745, size: 'm', font: 'draw', color: 'green' }, false), parentId: frameId })
    for (const id of thread.cardIds) if (editor.getShape(sid(`${thread.id}-${id}`))) connect(editor, sid(`${thread.id}-${id}`), noteId)
  })
}

function appendEvidence(editor, safari) {
  const page = editor.getCurrentPage()
  // Older saved canvases already received their collection, including cards since deleted.
  const importedIds = page.meta.safariImportedIds || safari.cards.map(card => card.id)
  const piles = incomingEvidence(safari, importedIds)
  const additions = piles.flatMap(pile => pile.cards)
  updatingCanvas.add(editor)
  try { editor.run(() => {
    for (const pile of piles) {
      const waiting = editor.getShape(sid(`waiting-${pile.lens}`))
      if (waiting) { editor.updateShape({ id: waiting.id, type: waiting.type, isLocked: false }); editor.deleteShape(waiting.id) }
      pile.cards.forEach((card, i) => {
        if (editor.getShape(sid(card.id))) return
        const depth = pile.cards.length - 1 - i
        editor.createShape({ id: sid(card.id), type: 'safari-evidence-card', x: pile.x + depth * 13, y: pile.y + depth * 12,
          rotation: depth ? (depth % 2 ? .025 : -.018) : 0,
          props: { evidence: evidencePayload(safari, card) }, meta: { safariArrivedAt: Date.now(), safariArrivalOrder: i } })
      })
    }
    for (const pile of evidencePiles(safari, { includeEmpty: true })) {
      const label = editor.getShape(sid(`label-${pile.lens}`))
      if (label?.meta.safariScaffolding) {
        const text = `${pile.lens}  /  ${pile.cards.length ? `${pile.cards.length} finds` : safari.status === 'researching' ? 'exploring' : 'an open question'}`
        editor.updateShape({ id: label.id, type: label.type, props: { richText: toRichText(text) } })
      }
    }
    editor.updatePage({ id: page.id, meta: { ...page.meta, safariImportedIds: [...new Set([...importedIds, ...additions.map(card => card.id)])] } })
  }, { history: 'ignore' }) } finally { updatingCanvas.delete(editor) }
  return { additions, first: !importedIds.length }
}

export default function FieldCanvas({ safari, run = null }) {
  const legacy = useRef(null), latest = useRef(safari), untouched = useRef(true)
  const [editor, setEditor] = useState(null)
  latest.current = safari
  if (!legacy.current) legacy.current = readTable(safari)
  const context = useMemo(() => ({ safari, run }), [safari, run])
  useEffect(() => {
    if (!editor || editor.isDisposed) return
    const { additions, first } = appendEvidence(editor, safari)
    if (first && additions.length && untouched.current && editor.getViewportScreenBounds().w < 650) focusShape(editor, sid(additions.at(-1).id))
  }, [editor, safari])
  const mounted = useCallback(editor => {
    const safari = latest.current
    setEditor(editor)
    editor.user.updateUserPreferences({ colorScheme: 'light', isSnapMode: true })
    const shapes = editor.getCurrentPageShapes()
    const migration = sourceCardMigration(shapes, shapes.flatMap(shape => shape.type === 'arrow' ? editor.getBindingsFromShape(shape.id, 'arrow') : []))
    editor.run(() => {
      editor.updateBindings(migration.bindings)
      editor.deleteShapes(migration.removeIds)
      editor.updateShapes(migration.compact)
    }, { history: 'ignore' })
    if (seedCanvas(editor, safari, legacy.current)) requestAnimationFrame(() => {
      if (editor.isDisposed) return
      const small = editor.getViewportScreenBounds().w < 650
      editor.zoomToBounds(small ? new Box(-40, 120, 470, 660) : new Box(-70, -100, 1660, 1300), { inset: small ? 30 : 65, targetZoom: 1 })
    })
    const stopChanges = editor.sideEffects.registerBeforeChangeHandler('shape', (previous, next, source) => {
      // Once a prompt is edited it becomes the person's note and belongs in exports.
      if (source === 'user' && !updatingCanvas.has(editor) && previous.meta.safariScaffolding && JSON.stringify(previous.props.richText) !== JSON.stringify(next.props.richText)) {
        return { ...next, meta: { ...next.meta, safariScaffolding: false } }
      }
      return next
    })
    const stopDeletes = editor.sideEffects.registerAfterDeleteHandler('shape', shape => {
      if (readingSession(editor).get()?.shapeId === shape.id) closeReading(editor)
    })
    const container = editor.getContainer()
    const interact = () => { untouched.current = false }
    const escape = event => {
      if (event.key !== 'Escape' || !readingSession(editor).get()) return
      event.preventDefault(); event.stopPropagation(); closeReading(editor)
    }
    container.addEventListener('keydown', escape, true)
    for (const event of ['pointerdown', 'wheel', 'keydown']) container.addEventListener(event, interact, { passive: true })
    return () => {
      stopChanges(); stopDeletes(); container.removeEventListener('keydown', escape, true)
      for (const event of ['pointerdown', 'wheel', 'keydown']) container.removeEventListener(event, interact)
    }
  }, [])
  return <SafariContext.Provider value={context}><Tldraw shapeUtils={SHAPES} components={COMPONENTS} options={OPTIONS}
    persistenceKey={CANVAS_KEY + safari.id} onMount={mounted} licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY}
    inferDarkMode={false}/></SafariContext.Provider>
}
