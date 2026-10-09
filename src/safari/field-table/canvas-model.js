import { LENSES } from '../discovery.js'
import { cardMarkdown } from '../field-guide.js'

export const CANVAS_KEY = 'evidence-safari.canvas.v2:'
export const CARD_W = 348
export const CARD_H = 348
export const STATION_W = 1132
export const STATION_H = 1310
export const STATION_HEADER_H = 120

// Fixed station space keeps later research from moving anything already on the table.
export function stationPosition(lens) {
  const index = Math.max(0, LENSES.indexOf(lens))
  return { x: (index % 3) * (STATION_W + 170), y: Math.floor(index / 3) * (STATION_H + 130) }
}

export function cardPosition(lens, index) {
  const { x, y } = stationPosition(lens)
  return { x: x + (index % 3) * (CARD_W + 44), y: y + STATION_HEADER_H + 32 + Math.floor(index / 3) * (CARD_H + 40) }
}

// Only move an old card if it is still in an automatically generated pile. Hand
// placements, grouped cards and their arrow bindings are left alone.
export function isOriginalPilePosition(shape, lens) {
  if (!String(shape.parentId || '').startsWith('page:')) return false
  const index = LENSES.indexOf(lens)
  if (index < 0) return false
  const dx = shape.x - (index % 3) * 435
  const dy = shape.y - (240 + Math.floor(index / 3) * 440)
  const depth = Math.round(dx / 13)
  return depth >= 0 && depth < 30 && Math.abs(dx - depth * 13) < 1 && Math.abs(dy - depth * 12) < 1
}

// Shapes carry their own evidence so copying or grouping never loses provenance.
export function evidencePayload(safari, card) {
  return JSON.parse(JSON.stringify({ card, source: safari.sources.find(source => source.id === card.sourceId) || null }))
}

export function evidencePiles(safari, { includeEmpty = false } = {}) {
  return LENSES.map(lens => {
    const cards = safari.cards.filter(card => card.lens === lens)
    const front = cards.find(card => card.id === (lens === 'People' ? 'people_1' : lens === 'Elsewhere' ? 'elsewhere_1' : '')) || cards[0]
    return {
      lens, ...stationPosition(lens),
      cards: [...cards.filter(card => card !== front).reverse(), ...(front ? [front] : [])],
    }
  }).filter(pile => includeEmpty || pile.cards.length)
}

export function incomingEvidence(safari, importedIds) {
  const known = new Set(importedIds)
  return evidencePiles(safari).map(pile => ({ ...pile, cards: pile.cards.filter(card => !known.has(card.id)) })).filter(pile => pile.cards.length)
}

export function richTextPlainText(value) {
  if (!value || typeof value !== 'object') return ''
  if (value.type === 'text') return value.text || ''
  if (value.type === 'hardBreak') return '\n'
  return (value.content || []).map(richTextPlainText).join(value.type === 'doc' ? '\n' : '')
}

// Fold old detail companions into their findings while keeping hand-drawn connections.
export function sourceCardMigration(shapes, bindings) {
  const byId = new Map(shapes.map(shape => [shape.id, shape]))
  const replacements = new Map(), compact = []
  for (const shape of shapes.filter(shape => shape.type === 'safari-source-card')) {
    const finding = byId.get(shape.props.findingShapeId)
    if (finding?.type === 'safari-evidence-card') replacements.set(shape.id, finding.id)
    else if (Math.abs(shape.props.h / shape.props.w - CARD_H / CARD_W) > .01) {
      compact.push({ id: shape.id, type: shape.type, props: { h: shape.props.w * CARD_H / CARD_W } })
    }
  }
  const connectors = shapes.filter(shape => shape.type === 'arrow' && shape.meta?.safariSourceLink && !richTextPlainText(shape.props.richText))
  const connectorIds = new Set(connectors.map(shape => shape.id))
  return {
    removeIds: [...replacements.keys(), ...connectorIds], compact,
    bindings: bindings.filter(binding => replacements.has(binding.toId) && !connectorIds.has(binding.fromId))
      .map(binding => ({ ...binding, toId: replacements.get(binding.toId) })),
  }
}

export function canvasFieldNotes(safari, shapes, bindings = []) {
  const byId = new Map(shapes.map(shape => [shape.id, shape]))
  const findings = new Map()
  const nameOf = id => {
    const shape = byId.get(id)
    return shape?.props?.evidence?.card?.title || richTextPlainText(shape?.props?.richText) || shape?.props?.name || 'Canvas annotation'
  }
  for (const shape of shapes) {
    const evidence = shape.props?.evidence
    if (evidence?.card?.id) findings.set(evidence.card.id, evidence)
  }
  let output = `# Evidence Safari — canvas field notes\n\n${safari.challenge}\n\n`
  const annotations = shapes.filter(shape => ['text', 'note', 'frame'].includes(shape.type) && !shape.meta?.safariScaffolding)
  if (annotations.length) {
    output += '## Notes and groups\n\n'
    for (const shape of annotations) {
      const text = shape.type === 'frame' ? shape.props.name : richTextPlainText(shape.props.richText)
      if (text.trim()) output += `${text.trim()}\n\n`
    }
  }
  const arrows = shapes.filter(shape => shape.type === 'arrow' && !shape.meta?.safariSourceLink)
  if (arrows.length) {
    output += '## Connections on the canvas\n\nThese connections are interpretations, questions or associations, not new evidence claims.\n\n'
    for (const arrow of arrows) {
      const ends = bindings.filter(binding => binding.fromId === arrow.id)
      const from = ends.find(binding => binding.props.terminal === 'start')?.toId
      const to = ends.find(binding => binding.props.terminal === 'end')?.toId
      const label = richTextPlainText(arrow.props.richText)
      output += `- ${from ? nameOf(from) : 'Canvas point'} → ${to ? nameOf(to) : 'Canvas point'}${label ? `: ${label}` : ''}\n`
    }
    output += '\n'
  }
  output += '## Evidence and original sources\n\n'
  for (const { card, source } of findings.values()) output += cardMarkdown(card, source)
  return output + '\nEvidence was checked by an AI model against search extracts. Full texts have not been independently verified. Connections across settings are hypotheses, not proof.\n'
}

export function wrapSvgText(text, width, size) {
  const words = String(text || '').split(/\s+/), lines = []
  let line = ''
  for (const word of words) {
    if (line && (line.length + word.length + 1) * size * .51 > width) { lines.push(line); line = word }
    else line += `${line ? ' ' : ''}${word}`
  }
  if (line) lines.push(line)
  return lines
}
