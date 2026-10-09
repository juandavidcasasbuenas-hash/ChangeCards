import { useCallback, useEffect, useRef, useState } from 'react'
import { BaseBoxShapeUtil, DefaultFontStyle, HTMLContainer, Tldraw, createShapeId, toRichText, useEditor, useValue } from 'tldraw'
import { evidenceProps, sourceProps, stationProps } from '../../../shared/safari-shapes.mjs'
import { linkFor, rememberedSession } from '../collaboration/session-client.js'
import { evidenceLabel } from '../field-guide.js'
import { Doodle, Icon } from '../primitives.jsx'
import { LENSES, LENS_COPY } from '../discovery.js'
import { trailStatus } from '../live.js'
import { LENS_COLORS, readTable, safeSourceUrl } from './model.js'
import { CANVAS_KEY, CARD_W, CARD_H, STATION_W, STATION_HEADER_H, cardPosition, evidencePayload, incomingEvidence, isOriginalPilePosition, sourceCardMigration, stationPosition, wrapSvgText } from './canvas-model.js'
import { SafariCanvasContext, useSafariCanvas } from './canvas-context.js'
import { closeReading, readingSession, setPrivateReading, turnCard } from './card-reading.js'
import { canvasMotion, ignorePointer, sid, visitStation } from './canvas-actions.js'
import { CANVAS_ASSET_URLS } from './canvas-fonts.js'
import { CanvasHeader, StationNav, CanvasProgress, CanvasToolbar, CanvasNavigation, CanvasStylePanel } from './CanvasChrome.jsx'
import EvidenceReader from './EvidenceReader.jsx'
import { CHANGE_SHAPES } from '../../develop/ChangeShapes.jsx'
import { DevelopContext } from '../../develop/develop-context.js'
import { useDevelopController } from '../../develop/useDevelopController.js'
import { initializeDevelop, buildFromEvidence, showDevelop } from '../../develop/canvas-actions.js'
import { rememberBoard } from '../../develop/storage.js'
import { useDiscoveryResearch } from '../../develop/useDiscoveryResearch.js'
import DevelopChrome from '../../develop/DevelopChrome.jsx'
import DeckFlight from '../../develop/DeckFlight.jsx'
import 'tldraw/tldraw.css'
import './field-table.css'
import './workshop-canvas.css'

const OPTIONS = { maxPages: 1 }
const updatingCanvas = new WeakSet()

function CardFace({ shape }) {
  const editor = useEditor()
  const { card = {}, source } = shape.props.evidence || {}
  const enabled = useValue('card controls', () => ['select', 'hand'].includes(editor.getCurrentToolId()), [editor])
  const reading = useValue('reading this card', () => readingSession(editor).get()?.shapeId === shape.id, [editor, shape.id])
  const [arriving, setArriving] = useState(() => Date.now() - (shape.meta.safariArrivedAt || 0) < 1500)
  useEffect(() => { if (!arriving) return; const timer = setTimeout(() => setArriving(false), 1400); return () => clearTimeout(timer) }, [arriving])
  return <HTMLContainer style={{ width: shape.props.w, height: shape.props.h }}>
    <article className="esc-evidence" data-evidence-id={card.id} data-card-face="front" data-reading={reading || undefined} data-arriving={arriving || undefined}
      aria-label={`Evidence card: ${card.title}`} style={{ width: CARD_W, height: shape.props.h * CARD_W / shape.props.w, transform: `scale(${shape.props.w / CARD_W})`, '--evidence-color': LENS_COLORS[card.lens], '--arrival-delay': `${(shape.meta.safariArrivalOrder || 0) * 60}ms` }}>
      <header className="esc-card-meta"><span>{card.lens}</span>{shape.meta.safariKept ? <span className="esc-card-kept"><Icon name="bookmark" size={13}/>Kept</span> : <span>{String((shape.meta.safariSlot || 0) + 1).padStart(2, '0')}</span>}</header>
      <Doodle lens={card.lens} className="esc-card-doodle"/>
      <h2>{card.title}</h2>
      <p className="esc-card-takeaway">{card.takeaway}</p>
      <footer className="esc-card-footer"><span title={source?.domain}>{source?.domain || evidenceLabel(card.evidenceType)}</span>
        <button className="esc-read-button" onPointerDown={ignorePointer} onDoubleClick={ignorePointer} onKeyDown={ignorePointer} onClick={() => turnCard(editor, shape)} style={{ pointerEvents: enabled ? 'all' : 'none' }} tabIndex={enabled ? 0 : -1} aria-label={`Read finding: ${card.title}`} aria-haspopup="dialog" aria-expanded={reading}>Look closer<Icon name="arrow" size={15}/></button>
      </footer>
    </article>
  </HTMLContainer>
}

function SvgCard({ shape }) {
  const { card = {}, source } = shape.props.evidence || {}
  const w = CARD_W, h = shape.props.h * w / shape.props.w
  const title = wrapSvgText(card.title, w - 44, 27).slice(0, 3)
  const takeaway = wrapSvgText(card.takeaway, w - 44, 14).slice(0, 4)
  return <g transform={`scale(${shape.props.w / w})`}>
    <rect x={1} y={1} width={w - 2} height={h - 2} rx={7} fill={LENS_COLORS[card.lens]} stroke="#29272a" strokeOpacity=".55"/>
    <text x={22} y={34} fontFamily="sans-serif" fontSize={11} fill="#252329">{card.lens} · Evidence Safari</text>
    {title.map((line, i) => <text key={`t${i}`} x={22} y={100 + i * 30} fontSize={27} fontWeight={750} fill="#252329" fontFamily="sans-serif">{line}</text>)}
    {takeaway.map((line, i) => <text key={`p${i}`} x={22} y={120 + title.length * 30 + i * 19} fontSize={14} fill="#343238" fontFamily="sans-serif">{line}</text>)}
    <line x1={22} x2={w - 22} y1={h - 45} y2={h - 45} stroke="#29272a" strokeOpacity=".2"/>
    <a href={safeSourceUrl(source?.url)}><text x={22} y={h - 20} fontSize={10} fontFamily="sans-serif" fill="#343238">{source?.domain || 'Source unrecorded'}</text></a>
  </g>
}

class EvidenceShapeUtil extends BaseBoxShapeUtil {
  static type = 'safari-evidence-card'
  static props = evidenceProps
  getDefaultProps() { return { w: CARD_W, h: CARD_H, evidence: { card: {}, source: null } } }
  canEdit() { return false }
  canResize() { return false }
  hideRotateHandle() { return true }
  onDoubleClick(shape) { turnCard(this.editor, shape); return shape }
  component(shape) { return <CardFace shape={shape}/> }
  getText(shape) { const { card } = shape.props.evidence; return `${card.title}\n${card.takeaway}` }
  getIndicatorPath(shape) { const path = new Path2D(); path.roundRect(0, 0, shape.props.w, shape.props.h, 7); return path }
  toSvg(shape) { return <SvgCard shape={shape}/> }
}

class SourceShapeUtil extends EvidenceShapeUtil {
  static type = 'safari-source-card'
  static props = sourceProps
  getDefaultProps() { return { w: CARD_W, h: CARD_H, evidence: { card: {}, source: null }, findingShapeId: '' } }
}

function TrailFace({ shape }) {
  const { run } = useSafariCanvas()
  return <HTMLContainer style={{ width: shape.props.w, height: shape.props.h, pointerEvents: 'none' }}>
    <div className="esc-trail" data-trail={shape.props.lens} style={{ '--evidence-color': LENS_COLORS[shape.props.lens] }}><Doodle lens={shape.props.lens}/><strong>{run?.busy ? 'Following a thread…' : 'An open question'}</strong><span>{trailStatus(shape.props.lens, run?.progress, run?.busy)}</span></div>
  </HTMLContainer>
}

class TrailShapeUtil extends BaseBoxShapeUtil {
  static type = 'safari-trail'
  static props = stationProps
  getDefaultProps() { return { w: CARD_W, h: CARD_H, lens: 'People' } }
  canEdit() { return false }
  canBind() { return false }
  canResize() { return false }
  component(shape) { return <TrailFace shape={shape}/> }
  getIndicatorPath() { return new Path2D() }
  toSvg(shape) { return <text x={20} y={40} fill="#55505b" fontSize={20}>{shape.props.lens} · an open question</text> }
}

function StationFace({ shape }) {
  const editor = useEditor()
  const lens = shape.props.lens
  const count = useValue('findings in station', () => new Set(editor.getCurrentPageShapes().filter(item => item.props.evidence?.card?.lens === lens).map(item => item.props.evidence.card.id)).size, [editor, lens])
  return <HTMLContainer style={{ width: shape.props.w, height: shape.props.h, pointerEvents: 'none' }}>
    <div className="esc-station-heading" style={{ '--evidence-color': LENS_COLORS[lens] }}><span className="esc-station-number">{String(LENSES.indexOf(lens) + 1).padStart(2, '0')}</span><div><span>{LENS_COPY[lens]}</span><strong>{lens}<small>{count ? `${count} finds` : 'a trail to follow'}</small></strong></div><Doodle lens={lens}/></div>
  </HTMLContainer>
}

class StationShapeUtil extends TrailShapeUtil {
  static type = 'safari-station'
  getDefaultProps() { return { w: STATION_W, h: STATION_HEADER_H, lens: 'People' } }
  component(shape) { return <StationFace shape={shape}/> }
  toSvg(shape) { return <text x={20} y={72} fontSize={44} fontWeight={700} fill="#262329">{shape.props.lens}</text> }
}

export const SAFARI_SHAPES = [EvidenceShapeUtil, SourceShapeUtil, TrailShapeUtil, StationShapeUtil, ...CHANGE_SHAPES]
const COMPONENTS = { MenuPanel: null, TopPanel: null, QuickActions: null, ActionsMenu: null, PageMenu: null,
  Toolbar: CanvasToolbar, NavigationPanel: CanvasNavigation, StylePanel: CanvasStylePanel }

function textShape(id, text, x, y, props = {}, scaffolding = true) {
  return { id: sid(id), type: 'text', x, y, meta: { safariScaffolding: scaffolding }, props: {
    richText: toRichText(text), font: 'sans', size: 'm', color: 'grey', autoSize: false, w: 430, ...props,
  } }
}

function connect(editor, fromId, toId) {
  const id = createShapeId()
  editor.createShape({ id, type: 'arrow', props: { color: 'grey', size: 's', dash: 'draw', arrowheadEnd: 'arrow', start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, richText: toRichText('') } })
  editor.createBindings([{ type: 'arrow', fromId: id, toId: fromId, props: { terminal: 'start', normalizedAnchor: { x: .5, y: .5 }, isExact: false, isPrecise: false } },
    { type: 'arrow', fromId: id, toId, props: { terminal: 'end', normalizedAnchor: { x: .5, y: .5 }, isExact: false, isPrecise: false } }])
  editor.sendToBack([id])
}

function seedCanvas(editor, safari, legacy) {
  const page = editor.getCurrentPage()
  if (page.meta.safariCanvasVersion === 3) return false
  const alreadySeeded = page.meta.safariSeedComplete
  const slots = {}, counts = {}
  editor.run(() => {
    // Remove only the original scaffolding. Edited prompts are personal notes.
    const stale = ['eyebrow', 'invitation', 'gesture-tip', 'wondering', 'open-space', ...LENSES.map(lens => `label-${lens}`)]
      .map(id => editor.getShape(sid(id))).filter(shape => shape?.meta.safariScaffolding)
    const question = editor.getShape(sid('question'))
    if (question && editor.getShapeUtil(question).getText(question) === safari.challenge) stale.push(question)
    for (const shape of stale) { editor.updateShape({ id: shape.id, type: shape.type, isLocked: false }); editor.deleteShape(shape.id) }
    for (const card of safari.cards) {
      const index = counts[card.lens] || 0
      counts[card.lens] = index + 1; slots[card.id] = { lens: card.lens, index }
      const existing = editor.getShape(sid(card.id))
      if (existing) {
        const untouched = isOriginalPilePosition(existing, card.lens)
        editor.updateShape({ id: existing.id, type: existing.type, ...(untouched ? { ...cardPosition(card.lens, index), rotation: 0, props: { w: CARD_W, h: CARD_H } } : {}),
          meta: { ...existing.meta, safariSlot: index, safariKept: existing.meta.safariKept || safari.savedIds?.includes(card.id) || false } })
      } else if (!alreadySeeded) editor.createShape({ id: sid(card.id), type: 'safari-evidence-card', ...cardPosition(card.lens, index),
        props: { evidence: evidencePayload(safari, card) }, meta: { safariSlot: index, safariKept: safari.savedIds?.includes(card.id) || false } })
    }
    for (const lens of LENSES) {
      if (!editor.getShape(sid(`station-${lens}`))) editor.createShape({ id: sid(`station-${lens}`), type: 'safari-station', ...stationPosition(lens), isLocked: true, props: { lens }, meta: { safariScaffolding: true } })
      const waiting = editor.getShape(sid(`waiting-${lens}`))
      if (waiting) editor.updateShape({ id: waiting.id, type: waiting.type, ...cardPosition(lens, 0), props: { w: CARD_W, h: CARD_H } })
      else if (!safari.cards.some(card => card.lens === lens)) editor.createShape({ id: sid(`waiting-${lens}`), type: 'safari-trail', ...cardPosition(lens, 0), isLocked: true, props: { lens }, meta: { safariScaffolding: true } })
    }
    if (!alreadySeeded) migrateNotes(editor, safari, legacy)
    editor.updatePage({ id: page.id, name: 'Evidence Safari', meta: { ...page.meta, safariCanvasVersion: 3, safariId: safari.id, safariSeedComplete: true,
      safariCardSlots: slots, safariImportedIds: page.meta.safariImportedIds || safari.cards.map(card => card.id), safariSeenIds: page.meta.safariSeenIds || safari.seenIds || [] } })
  }, { history: 'ignore' })
  return true
}

function migrateNotes(editor, safari, legacy) {
  const notes = Object.entries(safari.notes || {}).filter(([, value]) => String(value).trim())
  if (!notes.length && !legacy.threads.length && !legacy.reflection) return
  editor.createShape(textShape('previous-notes', 'Your earlier field notes', 0, 3000, { font: 'serif', size: 'l', w: 800 }))
  let x = 0
  for (const [cardId, note] of notes) {
    const card = safari.cards.find(item => item.id === cardId)
    if (!card) continue
    editor.createShape(textShape(`old-note-${cardId}`, `${card.title}\n\n${note}`, x, 3090, { w: 370, size: 'm', font: 'sans', color: 'green' }, false))
    x += 430
  }
  if (legacy.reflection) editor.createShape(textShape('old-reflection', `What changed my thinking\n\n${legacy.reflection}`, x, 3090, { w: 430, size: 'm', font: 'sans', color: 'green' }, false))
  legacy.threads.forEach((thread, i) => {
    const frameId = sid(`previous-${thread.id}`)
    editor.createShape({ id: frameId, type: 'frame', x: i * 900, y: 3500, props: { w: 830, h: 860, name: thread.title } })
    thread.cardIds.forEach((id, j) => {
      const card = safari.cards.find(item => item.id === id)
      if (card) editor.createShape({ id: sid(`${thread.id}-${id}`), type: 'safari-evidence-card', parentId: frameId, x: 32 + j * 420, y: 35, props: { evidence: evidencePayload(safari, card) } })
    })
    const noteId = sid(`${thread.id}-interpretation`)
    editor.createShape({ ...textShape(`${thread.id}-interpretation`, `${thread.observation}\n\n${thread.question}\n\nNext: ${thread.nextStep}`, 40, 440, { w: 745, size: 'm', font: 'sans', color: 'green' }, false), parentId: frameId })
    for (const id of thread.cardIds) if (editor.getShape(sid(`${thread.id}-${id}`))) connect(editor, sid(`${thread.id}-${id}`), noteId)
  })
}


function appendEvidence(editor, safari) {
  const page = editor.getCurrentPage()
  const importedIds = page.meta.safariImportedIds || safari.cards.map(card => card.id)
  const additions = incomingEvidence(safari, importedIds).flatMap(pile => pile.cards)
  if (!additions.length) return { additions, first: false }
  const slots = { ...page.meta.safariCardSlots }
  updatingCanvas.add(editor)
  try { editor.run(() => {
    for (const [arrival, card] of additions.entries()) {
      const waiting = editor.getShape(sid(`waiting-${card.lens}`))
      if (waiting) { editor.updateShape({ id: waiting.id, type: waiting.type, isLocked: false }); editor.deleteShape(waiting.id) }
      const index = slots[card.id]?.index ?? Math.max(-1, ...Object.values(slots).filter(slot => slot.lens === card.lens).map(slot => slot.index)) + 1
      slots[card.id] = { lens: card.lens, index }
      if (!editor.getShape(sid(card.id))) editor.createShape({ id: sid(card.id), type: 'safari-evidence-card', ...cardPosition(card.lens, index), props: { evidence: evidencePayload(safari, card) },
        meta: { safariSlot: index, safariArrivedAt: Date.now(), safariArrivalOrder: arrival % 4 } })
    }
    editor.updatePage({ id: page.id, meta: { ...page.meta, safariCardSlots: slots, safariImportedIds: [...new Set([...importedIds, ...additions.map(card => card.id)])] } })
  }, { history: 'ignore' }) } finally { updatingCanvas.delete(editor) }
  return { additions, first: !importedIds.length }
}

export default function FieldCanvas({ safari, run = null }) {
  const [session] = useState(() => rememberedSession(safari.id))
  useEffect(() => { if (session && !run?.busy) location.replace(linkFor(session)) }, [session, run?.busy])
  if (session && !run?.busy) return <div className="esc-loading" role="status">Opening your shared table…</div>
  return <CanvasSurface safari={safari} run={run}/>
}

export function CanvasSurface({ safari: initialSafari, run: outerRun = null, store = null, collaboration = null }) {
  const legacy = useRef(null), latest = useRef(initialSafari), cameras = useRef({})
  const [editor, setEditor] = useState(null)
  const [stage, updateStage] = useState(() => collaboration?.stage || initialSafari.defaultStage || (initialSafari.kind === 'develop' ? 'develop' : 'discover'))
  const cameraFrame = useRef(null), travellingUntil = useRef(0)
  useEffect(() => () => cancelAnimationFrame(cameraFrame.current), [])
  const currentStage = useRef(stage)
  currentStage.current = stage
  const research = useDiscoveryResearch({ editor, collaboration, safari: initialSafari, appendEvidence, seedCanvas: (editor, safari) => seedCanvas(editor, safari, readTable(safari)) })
  const safari = research.researchSafari || initialSafari
  const run = research.run ? { ...outerRun, ...research.run } : outerRun
  const [activeLens, updateActiveLens] = useState('all'), [shelf, setShelf] = useState(false)
  latest.current = safari
  if (!legacy.current) legacy.current = readTable(safari)
  const setActiveLens = useCallback(lens => {
    updateActiveLens(lens)
    if (editor && !collaboration) editor.run(() => editor.updatePage({ id: editor.getCurrentPageId(), meta: { ...editor.getCurrentPage().meta, safariActiveLens: lens } }), { history: 'ignore' })
  }, [editor, collaboration])
  const setStage = useCallback((next, { focus = true } = {}) => {
    if (!editor || editor.isDisposed || next === currentStage.current) return
    if (next === 'develop' && editor.getInstanceState().isReadonly && !editor.getCurrentPage().meta.developInitialized) return
    closeReading(editor); setShelf(false)
    cancelAnimationFrame(cameraFrame.current)
    if (Date.now() >= travellingUntil.current) {
      cameras.current[currentStage.current] = { ...editor.getCamera() }
    }
    currentStage.current = next
    if (next === 'develop') {
      initializeDevelop(editor, { challenge: safari.challenge, legacy: safari.legacy })
      try { rememberBoard({ ...safari, defaultStage: 'develop' }) } catch { /* Native canvas persistence remains available. */ }
    } else if (!editor.getCurrentPage().meta.safariSeedComplete && !editor.getInstanceState().isReadonly) seedCanvas(editor, { ...safari, cards: [], sources: [] }, readTable(safari))
    updateStage(next)
    outerRun?.onPhaseChange?.(next)
    if (!collaboration) { const page = editor.getCurrentPage(); editor.run(() => editor.updatePage({ id: page.id, meta: { ...page.meta, workshopStage: next } }), { history: 'ignore' }) }
    if (!focus) return
    travellingUntil.current = Date.now() + canvasMotion(editor, 900).duration
    cameraFrame.current = requestAnimationFrame(() => {
      cameraFrame.current = requestAnimationFrame(() => {
        if (editor.isDisposed) return
        if (cameras.current[next]) editor.setCamera(cameras.current[next], { animation: canvasMotion(editor, 900) })
        else if (next === 'develop') showDevelop(editor, 'table', { duration: 900 })
        else visitStation(editor, activeLens, { duration: 900 })
      })
    })
  }, [editor, stage, safari, collaboration, activeLens, outerRun?.onPhaseChange])
  const develop = useDevelopController({ editor, safari, collaboration, setStage, stage })
  const buildOnFinding = useCallback(shape => {
    if (!editor || editor.getInstanceState().isReadonly) return
    initializeDevelop(editor, { challenge: safari.challenge })
    buildFromEvidence(editor, shape)
    setStage('develop', { focus: false })
    cameraFrame.current = requestAnimationFrame(() => { if (!editor.isDisposed) showDevelop(editor, 'table', { duration: 900 }) })
  }, [editor, safari.challenge, setStage])
  const context = { safari: { ...safari, defaultStage: stage }, run, activeLens, setActiveLens, shelf, setShelf, collaboration, stage, setStage, buildOnFinding }
  const findings = useValue('discovery available', () => editor?.getCurrentPageShapes().filter(shape => shape.props.evidence && !shape.meta.developmentSeed).length || 0, [editor])
  useEffect(() => {
    if (!editor || editor.isDisposed || !collaboration) return
    const offline = collaboration.status !== 'online'
    editor.updateInstanceState({ isReadonly: offline })
    if (!offline && editor.getCurrentPage().meta.developInitialized) initializeDevelop(editor, { challenge: safari.challenge })
    const warn = event => { event.preventDefault(); event.returnValue = '' }
    if (offline) window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [editor, collaboration?.status])
  useEffect(() => {
    if (!editor || editor.isDisposed || collaboration || research.researchSafari || !editor.getCurrentPage().meta.safariSeedComplete) return
    // Evidence arrives into the current view. Only the explorer moves the camera.
    appendEvidence(editor, safari)
  }, [editor, safari, collaboration, research.researchSafari])
  const mounted = useCallback(editor => {
    const safari = latest.current
    setEditor(editor)
    editor.setStyleForNextShapes(DefaultFontStyle, 'sans')
    const stopCreates = editor.sideEffects.registerBeforeCreateHandler('shape', (shape, source) => {
      if (source !== 'user' || shape.meta.workshopStage || shape.meta.safariScaffolding || shape.type.startsWith('safari-') || shape.type.startsWith('change-')) return shape
      return { ...shape, meta: { ...shape.meta, workshopStage: currentStage.current } }
    })
    if (collaboration) {
      setPrivateReading(editor, collaboration.session.roomId)
      editor.user.updateUserPreferences({ colorScheme: 'light', isSnapMode: true })
      requestAnimationFrame(() => {
        if (editor.isDisposed) return
        if (collaboration.camera) { editor.setCamera(collaboration.camera); updateActiveLens(collaboration.activeLens || 'all') }
        else if (stage === 'develop') showDevelop(editor, 'table', { animate: false })
        else {
          const lens = LENSES.find(name => editor.getCurrentPageShapes().some(shape => shape.props.evidence?.card?.lens === name)) || 'all'
          updateActiveLens(lens); visitStation(editor, lens, { animate: false })
        }
      })
      const stopDeletes = editor.sideEffects.registerAfterDeleteHandler('shape', shape => { if (readingSession(editor).get()?.shapeId === shape.id) closeReading(editor) })
      return () => { stopCreates(); stopDeletes() }
    }
    const page = editor.getCurrentPage()
    const requestedStage = ['discover', 'develop'].includes(safari.defaultStage) ? safari.defaultStage : null
    const savedStage = ['discover', 'develop'].includes(page.meta.workshopStage) ? page.meta.workshopStage : null
    const openingStage = requestedStage || savedStage || currentStage.current
    const focusRequestedStage = Boolean(requestedStage && requestedStage !== savedStage)
    currentStage.current = openingStage
    updateStage(openingStage)
    updateActiveLens(page.meta.safariActiveLens || 'all')
    editor.user.updateUserPreferences({ colorScheme: 'light', isSnapMode: true })
    const shapes = editor.getCurrentPageShapes()
    const migration = sourceCardMigration(shapes, shapes.flatMap(shape => shape.type === 'arrow' ? editor.getBindingsFromShape(shape.id, 'arrow') : []))
    editor.run(() => { editor.updateBindings(migration.bindings); editor.deleteShapes(migration.removeIds); editor.updateShapes(migration.compact) }, { history: 'ignore' })
    if (openingStage === 'develop') {
      const fresh = initializeDevelop(editor, { challenge: safari.challenge, legacy: safari.legacy })
      if (fresh || focusRequestedStage) requestAnimationFrame(() => { if (!editor.isDisposed) showDevelop(editor, fresh ? 'decks' : 'table', { animate: false }) })
    }
    if (openingStage === 'discover') {
      const fresh = seedCanvas(editor, safari, legacy.current)
      if (fresh || focusRequestedStage) requestAnimationFrame(() => {
        if (editor.isDisposed) return
        const lens = (!fresh && page.meta.safariActiveLens) || LENSES.find(name => safari.cards.some(card => card.lens === name)) || 'all'
        updateActiveLens(lens); visitStation(editor, lens, { animate: false })
        editor.run(() => editor.updatePage({ id: editor.getCurrentPageId(), meta: { ...editor.getCurrentPage().meta, safariActiveLens: lens } }), { history: 'ignore' })
      })
    }
    if (editor.getCurrentPage().meta.workshopStage !== openingStage) editor.run(() => editor.updatePage({ id: editor.getCurrentPageId(), meta: { ...editor.getCurrentPage().meta, workshopStage: openingStage } }), { history: 'ignore' })
    const stopChanges = editor.sideEffects.registerBeforeChangeHandler('shape', (previous, next, source) => {
      if (source === 'user' && !updatingCanvas.has(editor) && previous.meta.safariScaffolding && JSON.stringify(previous.props.richText) !== JSON.stringify(next.props.richText)) return { ...next, meta: { ...next.meta, safariScaffolding: false } }
      return next
    })
    const stopDeletes = editor.sideEffects.registerAfterDeleteHandler('shape', shape => { if (readingSession(editor).get()?.shapeId === shape.id) closeReading(editor) })
    return () => { stopCreates(); stopChanges(); stopDeletes() }
  }, [])
  return <SafariCanvasContext.Provider value={context}><DevelopContext.Provider value={{ ...develop, safari }}><div className="esc-workbench" data-workshop-stage={stage} data-research-busy={Boolean(run?.busy)}>
    <DeckFlight deal={develop.deal}/>
    <CanvasHeader editor={editor}/>{stage === 'develop' ? <DevelopChrome/> : <StationNav editor={editor}/>}
    <div className="esc-stage">
      {collaboration && collaboration.status !== 'online' && <div className="esc-sync-status" role="status">{collaboration.problem || (collaboration.status === 'loading' ? 'Connecting to the shared table…' : collaboration.status === 'error' ? 'The connection needs a refresh. Copy your notes before reopening.' : 'Reconnecting… Keep this tab open until your changes have synced.')}</div>}
      <Tldraw shapeUtils={SAFARI_SHAPES} components={COMPONENTS} options={OPTIONS} assetUrls={CANVAS_ASSET_URLS} {...(store ? { store } : { persistenceKey: CANVAS_KEY + safari.id })} onMount={mounted} licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY} inferDarkMode={false}>
      <CanvasProgress/><EvidenceReader/>
      {stage === 'discover' && !findings && editor && !run?.busy && <div className="dv-empty-discover"><span aria-hidden="true">✳</span><h2>What could change<br/>how you see this?</h2><p>Follow six perspectives on your idea.<br/>Keep the findings here, alongside your work.</p><button onClick={research.start}>Find evidence <Icon name="arrow" size={17}/></button>{research.run?.error && <p role="alert">{research.run.error}</p>}</div>}
    </Tldraw></div>
  </div></DevelopContext.Provider></SafariCanvasContext.Provider>
}
