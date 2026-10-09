import { Box, createShapeId, toRichText } from 'tldraw'
import { chooseFinding } from '../discovery.js'
import { cardPosition, CARD_H, CARD_W } from './canvas-model.js'
import { seenFindings, turnCard } from './card-reading.js'

export const sid = id => createShapeId(`evidence-${id}`)
export const ignorePointer = event => event.stopPropagation()
export const canvasMotion = (editor, duration = 460) => ({
  duration: editor.getContainerWindow().matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : duration,
  easing: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
})
export const evidenceShapes = (editor, includeDevelop = false) => editor.getCurrentPageShapes().filter(shape => shape.props.evidence?.card?.id && (includeDevelop || !shape.meta.developmentSeed))

export function focusShapes(editor, shapes, { animate = true, duration = 460 } = {}) {
  // Menus and route ribbons can resize the editor before its resize listener
  // runs. Measure the committed container so card actions stay above the tools.
  editor.updateViewportScreenBounds(editor.getContainer())
  const boxes = shapes.map(shape => editor.getShapePageBounds(shape.id)).filter(Boolean)
  if (!boxes.length) return
  editor.setCurrentTool('select').selectNone()
  editor.zoomToBounds(Box.Common(boxes), { inset: editor.getViewportScreenBounds().w < 600 ? 56 : 164, targetZoom: 1,
    animation: animate ? canvasMotion(editor, duration) : { duration: 0 } })
}

export function visitStation(editor, lens, options) {
  const shapes = editor.getCurrentPageShapes().filter(shape => !shape.type.startsWith('change-') && shape.meta.workshopStage !== 'develop' && shape.x < 5700).filter(shape => lens === 'kept'
    ? shape.meta.safariKept
    : lens === 'all' ? shape.type !== 'arrow' && shape.type !== 'draw'
      : shape.props.evidence?.card?.lens === lens || shape.props.lens === lens)
  const mobile = editor.getViewportScreenBounds().w < 600
  const firstCard = shapes.filter(shape => shape.props.evidence || shape.type === 'safari-trail').sort((a, b) => (a.meta.safariSlot || 0) - (b.meta.safariSlot || 0))[0]
  focusShapes(editor, mobile && lens !== 'all' && firstCard ? [firstCard] : shapes, options)
}

export function wander(editor, options = {}) {
  const shapes = evidenceShapes(editor, Boolean(options.develop)).filter(shape => options.develop ? shape.meta.developmentSeed : !shape.meta.developmentSeed)
  const cards = [...new Map(shapes.map(shape => [shape.props.evidence.card.id, shape.props.evidence.card])).values()]
  const card = chooseFinding(cards, seenFindings(editor), options)
  if (card) turnCard(editor, shapes.find(shape => shape.props.evidence.card.id === card.id))
}

export function keepFinding(editor, cardId) {
  if (editor.getInstanceState().isReadonly) return
  const shapes = evidenceShapes(editor, true).filter(shape => shape.props.evidence.card.id === cardId)
  const kept = !shapes.some(shape => shape.meta.safariKept)
  editor.markHistoryStoppingPoint('keep-finding')
  editor.updateShapes(shapes.map(shape => ({ id: shape.id, type: shape.type, meta: { ...shape.meta, safariKept: kept } })))
}

export function addNote(editor, text = '', stage = 'discover') {
  if (editor.getInstanceState().isReadonly) return
  const { x, y } = editor.getViewportPageBounds().center
  const id = createShapeId()
  editor.markHistoryStoppingPoint('add-field-note')
  editor.createShape({ id, type: 'note', x: x - 100, y: y - 90, meta: { workshopStage: stage },
    props: { color: 'yellow', size: 'm', font: 'sans', richText: toRichText(text) } })
  editor.setCurrentTool('select').select(id)
  if (!text) editor.setEditingShape(id)
  editor.getContainer().focus({ preventScroll: true })
}

// An explicit, undoable tidy. Personal notes, groups and drawings are never moved.
export function tidyStation(editor, lens) {
  if (editor.getInstanceState().isReadonly) return
  const byLens = new Map()
  for (const shape of evidenceShapes(editor)) {
    const cardLens = shape.props.evidence.card.lens
    if (lens !== 'all' && cardLens !== lens || shape.parentId !== editor.getCurrentPageId()) continue
    if (!byLens.has(cardLens)) byLens.set(cardLens, [])
    byLens.get(cardLens).push(shape)
  }
  editor.markHistoryStoppingPoint('tidy-evidence')
  editor.updateShapes([...byLens].flatMap(([name, shapes]) => shapes.map((shape, i) => ({ id: shape.id, type: shape.type,
    ...cardPosition(name, i), rotation: 0, props: { w: CARD_W, h: CARD_H } }))))
  visitStation(editor, lens)
}
