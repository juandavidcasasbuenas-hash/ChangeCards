import { createShapeId, toRichText, Box } from 'tldraw'
import { CARDS, CURATED_ROUTES } from './catalog.js'
import { DEVELOP_X, CATALOGUE_X, CARD_W, CARD_H, changeCardProps, templateShapes, stationShapes, workingPosition, legacyBoardState } from './model.js'
import { readIdentity, saveIdentity } from '../safari/collaboration/session-client.js'
import { focusShapes } from '../safari/field-table/canvas-actions.js'

export const collectDevelopEntries = editor => editor.getCurrentPageShapes().filter(shape => shape.type === 'change-card' && !shape.props.template)
export const getCurrentAuthor = () => readIdentity() || saveIdentity('Explorer')
export const developmentShapes = editor => editor.getCurrentPageShapes().filter(shape => shape.meta.workshopStage === 'develop' || shape.type.startsWith('change-'))

function challengePreview(challenge) {
  const characters = Array.from(String(challenge || '').replace(/\s+/g, ' ').trim())
  return characters.length <= 220 ? characters.join('') : `${characters.slice(0, 219).join('').trimEnd()}…`
}

function nextWorkingPosition(editor) {
  const gap = 24, lastColumn = workingPosition(3).x + CARD_W
  const occupied = editor.getCurrentPageShapes().filter(shape => !shape.props.template && shape.type !== 'change-station')
    .map(shape => editor.getShapePageBounds(shape.id)).filter(box => box && box.x + box.w + gap > DEVELOP_X && box.x < lastColumn + gap)
  const overlaps = (position, box) => position.x < box.x + box.w + gap && position.x + CARD_W + gap > box.x
    && position.y < box.y + box.h + gap && position.y + CARD_H + gap > box.y
  // Reuse empty slots after cards are returned. Page bounds also account for
  // hand placements, rotation and cards nested in a group.
  for (let slot = 0; slot < Math.max(64, occupied.length * 4); slot++) {
    const position = workingPosition(slot)
    if (!occupied.some(box => overlaps(position, box))) return position
  }
  // A large drawing or frame may span many rows. Jump below it rather than
  // scanning an unbounded number of occupied slots.
  const first = workingPosition(0), rowHeight = workingPosition(4).y - first.y
  const bottom = Math.max(first.y, ...occupied.map(box => box.y + box.h))
  return workingPosition(Math.ceil((bottom + gap - first.y) / rowHeight) * 4)
}

export function initializeDevelop(editor, { challenge, legacy = null }) {
  const page = editor.getCurrentPage()
  if (page.meta.developInitialized || editor.getInstanceState().isReadonly) return false
  const imported = legacy ? legacyBoardState(legacy) : null
  const entries = imported?.entries.length ? imported.entries : [1, 5, 14].map((cardId, i) => ({ cardId, ...workingPosition(i) }))
  const shapes = [...templateShapes().map(shape => ({ ...shape, isLocked: true })), ...stationShapes().map(shape => ({ ...shape, isLocked: true })),
    { id: 'shape:develop-heading', type: 'text', x: DEVELOP_X, y: -80, props: { richText: toRichText('Room for a different idea.'), font: 'draw', color: 'grey', size: 'xl', autoSize: false, w: 1350 }, meta: { workshopStage: 'develop', safariScaffolding: true } },
    { id: 'shape:develop-starting-idea', type: 'text', x: DEVELOP_X, y: 40, props: { richText: toRichText(challengePreview(challenge)), font: 'sans', color: 'black', size: 'm', autoSize: false, w: 1250 }, meta: { workshopStage: 'develop', startingIdea: true } },
    ...entries.map((entry, i) => ({ id: `shape:change-initial-${entry.cardId}`, type: 'change-card', x: entry.x ?? workingPosition(i).x, y: entry.y ?? workingPosition(i).y,
      props: changeCardProps(entry.cardId, { note: entry.note || '', draft: entry.draft || '', face: entry.face || 'front' }),
      meta: { workshopStage: 'develop', developDrafting: Boolean(entry.draft), savedAt: entry.updatedAt || 0 } })),
  ]
  editor.run(() => {
    editor.createShapes(shapes.filter(shape => !editor.getShape(shape.id)))
    editor.updatePage({ id: page.id, meta: { ...page.meta, developInitialized: true, developRoute: imported?.activeRouteId || '',
      developOrder: (imported?.scrapbookOrder || []).map(cardId => `shape:change-initial-${cardId}`) } })
  }, { history: 'ignore' })
  return true
}

export function showDevelop(editor, category = 'table', { animate = true } = {}) {
  const inWorkingArea = shape => {
    const bounds = editor.getShapePageBounds(shape.id)
    return bounds && bounds.x >= 5700 && bounds.x < CATALOGUE_X
  }
  const shapes = editor.getCurrentPageShapes().filter(shape => category === 'all'
    ? shape.type === 'change-card' && shape.props.template || shape.type === 'change-station'
    : category === 'table' ? !shape.props.template && shape.type !== 'change-station' && (shape.meta.workshopStage === 'develop' || shape.type === 'change-card' || inWorkingArea(shape))
      : shape.type === 'change-station' && shape.props.category === category || shape.type === 'change-card' && shape.props.template && CARDS.find(card => card.id === shape.props.cardId)?.category === category)
  const mobileCard = category !== 'all' && editor.getViewportScreenBounds().w < 600
    ? shapes.find(shape => shape.type === 'change-card') || shapes.find(shape => shape.props.evidence)
    : null
  if (shapes.length) focusShapes(editor, mobileCard ? [mobileCard] : shapes, { animate })
  else editor.zoomToBounds(new Box(DEVELOP_X, 0, 1400, 850), { inset: 80, animation: { duration: animate ? 250 : 0 } })
}

export function drawChangeCard(editor, cardId, { author = getCurrentAuthor(), copy = null, face = 'back', reuseUnowned = true } = {}) {
  if (editor.getInstanceState().isReadonly || !CARDS.some(card => card.id === cardId)) return null
  const existing = collectDevelopEntries(editor).find(shape => shape.props.cardId === cardId && (reuseUnowned && !shape.props.authorId || shape.props.authorId === author.id))
  if (existing && !copy) {
    editor.updateShape({ id: existing.id, type: existing.type, props: { face, authorId: author.id, authorName: author.name } })
    focusShapes(editor, [existing]); return existing.id
  }
  const id = createShapeId()
  const shape = { id, type: 'change-card', ...nextWorkingPosition(editor),
    props: changeCardProps(cardId, { face, authorId: author.id, authorName: author.name, ...(copy ? { draft: copy.props.note || copy.props.draft, sparks: copy.props.sparks } : {}) }),
    meta: { workshopStage: 'develop', developDrafting: Boolean(copy), ...(copy ? { basedOnCard: copy.id } : {}) } }
  editor.markHistoryStoppingPoint('draw-change-card')
  editor.createShape(shape); focusShapes(editor, [editor.getShape(id)])
  return id
}

export function buildFromEvidence(editor, shape) {
  if (editor.getInstanceState().isReadonly || !shape?.props.evidence?.card) return null
  const id = `shape:develop-evidence-${shape.props.evidence.card.id}`
  const existing = editor.getShape(id)
  editor.markHistoryStoppingPoint('build-on-evidence')
  editor.updateShape({ id: shape.id, type: shape.type, meta: { ...shape.meta, safariKept: true } })
  if (existing) { editor.updateShape({ id: existing.id, type: existing.type, meta: { ...existing.meta, safariKept: true } }); return editor.getShape(id) }
  const count = editor.getCurrentPageShapes().filter(item => item.meta.developmentSeed).length
  const copy = { id, type: 'safari-evidence-card', x: DEVELOP_X - 500, y: 320 + count * 405,
    props: { w: shape.props.w, h: shape.props.h, evidence: structuredClone(shape.props.evidence) }, meta: { workshopStage: 'develop', developmentSeed: true, originShapeId: shape.id, safariKept: true } }
  editor.createShape(copy)
  return editor.getShape(id)
}

export function activateRoute(editor, routeId) {
  const route = CURATED_ROUTES.find(item => item.id === routeId)
  if (!route || editor.getInstanceState().isReadonly) return
  editor.markHistoryStoppingPoint('choose-change-route')
  const page = editor.getCurrentPage(), entries = collectDevelopEntries(editor)
  editor.run(() => {
    for (const cardId of route.cardIds) if (!entries.some(shape => shape.props.cardId === cardId)) editor.createShape({ id: createShapeId(), type: 'change-card',
      ...nextWorkingPosition(editor), props: changeCardProps(cardId), meta: { workshopStage: 'develop' } })
    editor.updatePage({ id: page.id, meta: { ...page.meta, developRoute: routeId } })
  })
}

export function changeCardMarkdown(shape) {
  const card = CARDS.find(item => item.id === shape.props.cardId)
  if (!card) return ''
  const { note, draft, authorName, sparks } = shape.props
  return `### ${card.title}\n\n${card.provocation}\n\n${note ? `${authorName && authorName !== 'Explorer' ? `**${authorName}’s idea:** ` : ''}${note}\n\n` : ''}${draft && draft !== note ? `**Unfinished draft:** ${draft}\n\n` : ''}${sparks?.length ? `**Optional AI sparks:** ${sparks.join(' · ')}\n\n` : ''}`
}

export function developMarkdown(editor, challenge) {
  const order = editor.getCurrentPage().meta.developOrder || []
  const entries = collectDevelopEntries(editor).filter(shape => shape.props.note || shape.props.draft || shape.props.sparks.length)
    .sort((a, b) => (order.indexOf(a.id) < 0 ? 9999 : order.indexOf(a.id)) - (order.indexOf(b.id) < 0 ? 9999 : order.indexOf(b.id)))
  return `## Develop — Change Cards\n\n${challenge}\n\n${entries.map(changeCardMarkdown).join('')}`
}
