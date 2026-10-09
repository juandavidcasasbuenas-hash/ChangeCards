import { useEffect, useRef, useState } from 'react'
import { BaseBoxShapeUtil, HTMLContainer, useEditor, useValue } from 'tldraw'
import { changeCardProps, changeStationProps } from '../../shared/safari-shapes.mjs'
import { CARDS, CATEGORIES, cardArtwork } from './catalog.js'
import { useDevelop } from './develop-context.js'
import './change-shapes.css'

const CARD_W = 300
const CARD_H = 430
const cardById = new Map(CARDS.map(card => [card.id, card]))
const categoryById = new Map(CATEGORIES.map(category => [category.id, category]))
const shapeActions = new WeakMap()
const exportArtwork = new Map()
const stop = event => event.stopPropagation()
const isolate = { onPointerDown: stop, onPointerUp: stop, onDoubleClick: stop, onKeyDown: stop }

export function ChangeCardDoodle({ cardId, className = '' }) {
  const artwork = cardArtwork(cardId)
  if (!artwork?.src) return null
  const sprite = Number.isInteger(artwork.spriteIndex)
  return <span className={`dvc-doodle ${sprite ? 'dvc-doodle-sprite' : ''} ${className}`} aria-hidden="true" style={{
    '--dvc-artwork': `url("${artwork.src}")`,
    '--dvc-artwork-position': sprite ? `${(artwork.spriteIndex % 6) * 20}% ${Math.floor(artwork.spriteIndex / 6) * (100 / 3)}%` : 'center',
  }}/>
}

function TurnIcon() {
  return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M15.8 7.1a6.1 6.1 0 0 0-11-1.4M4 2.8v3.4h3.4M4.2 12.9a6.1 6.1 0 0 0 11 1.4m.8 2.9v-3.4h-3.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
}

function SparkStrip({ shape, disabled, enabled, onTake }) {
  const context = useDevelop()
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [pressed, setPressed] = useState(false)
  const [hidden, setHidden] = useState(() => document.visibilityState === 'hidden')
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false)
  const state = context?.sparksState?.[shape.id]
  const sparks = state?.sparks?.length ? state.sparks : shape.props.sparks || []
  const loading = state?.status === 'loading' || state?.loading
  const spark = sparks[index % Math.max(1, sparks.length)]
  const sparkKey = sparks.join('\u0000')

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const onVisibility = () => setHidden(document.visibilityState === 'hidden')
    const onMotion = () => setReducedMotion(Boolean(media?.matches))
    document.addEventListener('visibilitychange', onVisibility)
    media?.addEventListener('change', onMotion)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      media?.removeEventListener('change', onMotion)
    }
  }, [])

  useEffect(() => { setIndex(0); setVisible(true) }, [sparkKey])

  useEffect(() => {
    setVisible(true)
    // These are already-cached thoughts. Browsing them never requests more AI.
    if (sparks.length < 2 || loading || !enabled || hovered || focused || pressed || hidden || reducedMotion) return
    const fadeTimer = window.setTimeout(() => setVisible(false), 5000)
    const nextTimer = window.setTimeout(() => setIndex(current => current + 1), 6200)
    return () => { window.clearTimeout(fadeTimer); window.clearTimeout(nextTimer) }
  }, [sparks.length, sparkKey, index, loading, enabled, hovered, focused, pressed, hidden, reducedMotion])

  const next = () => { setVisible(true); setIndex(current => current + 1) }
  return <div className="dvc-spark-strip" {...isolate} onWheel={stop} aria-label="AI-generated writing sparks"
    onPointerEnter={event => { if (event.pointerType !== 'touch') setHovered(true) }}
    onPointerLeave={() => { setHovered(false); setPressed(false) }}
    onPointerDown={event => { stop(event); setPressed(true) }}
    onPointerUp={event => { stop(event); setPressed(false) }}
    onPointerCancel={() => setPressed(false)}
    onFocusCapture={() => setFocused(Boolean(spark))}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false) }}>
    {loading ? <span className="dvc-catching" role="status"><i aria-hidden="true">✦</i>Catching a thought…</span>
      : state?.error ? <button type="button" className="dvc-spark-request" onClick={() => context?.requestCardSparks(shape.id)} disabled={disabled} tabIndex={enabled ? 0 : -1} title={state.error}>Try a spark again <span aria-hidden="true">↻</span></button>
      : spark ? <><button type="button" className={`dvc-spark-thought${visible ? ' is-visible' : ''}`} data-spark={spark} onClick={() => onTake(spark)} disabled={disabled} tabIndex={enabled ? 0 : -1} aria-label={`Use this AI spark: ${spark}`} title={spark}><i aria-hidden="true">✦</i><span>{spark}</span></button>{sparks.length > 1 && <button type="button" className="dvc-spark-next" onClick={next} tabIndex={enabled ? 0 : -1} aria-label="Next spark" title="Next spark">↻</button>}</>
      : <button type="button" className="dvc-spark-request" onClick={() => context?.requestCardSparks(shape.id)} disabled={disabled} tabIndex={enabled ? 0 : -1}><i aria-hidden="true">✦</i>Need a spark?</button>}
  </div>
}

function CardFace({ shape }) {
  const editor = useEditor()
  const context = useDevelop()
  const input = useRef(null)
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef(null)
  const card = cardById.get(shape.props.cardId)
  const readonly = useValue('change card readonly', () => editor.getInstanceState().isReadonly, [editor])
  const controls = useValue('change card controls', () => ['select', 'hand'].includes(editor.getCurrentToolId()), [editor])
  const writable = !readonly && (context?.canWriteCard?.(shape) ?? true)
  const { template, note, authorName, face } = shape.props
  const drafting = Boolean(shape.meta.developDrafting || shape.props.draft || !note)
  const draft = shape.meta.developDrafting ? shape.props.draft : (shape.props.draft || note)
  const color = categoryById.get(card?.category)?.color || '#88abc3'

  useEffect(() => {
    let actions = shapeActions.get(editor)
    if (!actions) { actions = new Map(); shapeActions.set(editor, actions) }
    const open = () => context?.openCard?.(shape.id)
    actions.set(shape.id, open)
    return () => { if (actions.get(shape.id) === open) actions.delete(shape.id) }
  }, [editor, context, shape.id])
  useEffect(() => () => clearTimeout(copyTimer.current), [])

  if (!card) return <HTMLContainer><div className="dvc-missing">This Change Card is unavailable.</div></HTMLContainer>
  const turn = () => {
    if (readonly) return
    editor.markHistoryStoppingPoint('turn-change-card')
    editor.updateShape({ id: shape.id, type: shape.type, props: { face: face === 'front' ? 'back' : 'front' } })
    if (face === 'front') context?.openCard?.(shape.id)
  }
  const focusInput = () => requestAnimationFrame(() => input.current?.focus({ preventScroll: true }))
  const edit = () => { context?.updateDraft?.(shape.id, note); focusInput() }
  const save = () => { if (writable && draft.trim()) { context?.saveCard?.(shape.id, draft); input.current?.blur() } }
  const takeSpark = spark => {
    if (!writable) return
    context?.updateDraft?.(shape.id, `${draft.trim()}${draft.trim() ? '\n' : ''}${spark} — `)
    focusInput()
  }
  const copy = async () => {
    try {
      await context?.copyCard?.(shape.id)
      setCopied(true); clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 1800)
    } catch { setCopied(false) }
  }

  return <HTMLContainer style={{ width: shape.props.w, height: shape.props.h }}>
    <article className={`dvc-card dvc-category-${card.category} ${face === 'back' && !template ? 'dvc-card-back' : 'dvc-card-front'}`}
      data-change-card={card.id} data-card-face={template ? 'front' : face} data-template={template || undefined}
      data-dealing={context?.deal?.shapeId === shape.id || undefined}
      data-controls={controls || undefined} aria-label={`${card.title}${template ? ', Change Card' : `, ${authorName || 'your'} take`}`}
      style={{ '--dvc-color': color, width: CARD_W, height: shape.props.h * CARD_W / shape.props.w, transform: `scale(${shape.props.w / CARD_W})` }}>
      <header className="dvc-card-meta"><span>{card.label}</span><span>{template ? String(card.id).padStart(2, '0') : authorName || 'Your take'}</span></header>
      {face === 'front' || template ? <>
        <div className="dvc-card-art"><ChangeCardDoodle cardId={card.id}/></div>
        <h2>{card.title}</h2>
        <footer className="dvc-card-front-footer">
          <span>{!template && note ? 'Idea saved ✓' : 'Change Cards'}</span>
          <button type="button" {...isolate} onClick={template ? () => context?.drawCard?.(card.id) : turn} disabled={readonly} tabIndex={controls ? 0 : -1}
            aria-label={template ? `Draw ${card.title}` : `Turn over ${card.title}`}>
            {template ? <>Draw card<span aria-hidden="true">↗</span></> : <>Turn over<TurnIcon/></>}
          </button>
        </footer>
      </> : <>
        <div className="dvc-back-heading"><h2>{card.title}</h2><button type="button" className="dvc-turn-back" {...isolate} onClick={turn} disabled={readonly} tabIndex={controls ? 0 : -1} aria-label={`Show front of ${card.title}`} title="Show card front"><TurnIcon/></button></div>
        <p className="dvc-provocation">{card.provocation}</p>
        {writable && drafting ? <>
          <textarea ref={input} className="dvc-writing" value={draft} maxLength={1000} aria-label={`Your idea for ${card.title}`} placeholder="One changed detail is enough…"
            {...isolate} onWheel={stop} onTouchStart={stop} onTouchMove={stop} tabIndex={controls ? 0 : -1}
            onChange={event => context?.updateDraft?.(shape.id, event.target.value)}
            onKeyDown={event => { stop(event); if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); save() } }}/>
          <SparkStrip shape={shape} disabled={!writable} enabled={controls} onTake={takeSpark}/>
        </> : <div className="dvc-saved-writing" {...isolate} onWheel={stop} tabIndex={controls ? 0 : -1} aria-label={`Saved idea${authorName ? ` by ${authorName}` : ''}`}>
          {note || <span className="dvc-awaiting">{authorName ? `${authorName} is finding a new angle…` : 'An idea is taking shape…'}</span>}
        </div>}
        <footer className="dvc-writing-footer" {...isolate}>
          {writable ? drafting ? <button type="button" className="dvc-save" onClick={save} disabled={!draft.trim()} tabIndex={controls ? 0 : -1} title="Save idea (⌘ / Ctrl + Enter)">Save idea<span aria-hidden="true">↗</span></button>
            : <button type="button" className="dvc-edit" onClick={edit} tabIndex={controls ? 0 : -1}>Edit idea<span aria-hidden="true">↗</span></button>
            : <button type="button" className="dvc-save" onClick={() => context?.takeCard?.(shape.id)} disabled={readonly} tabIndex={controls ? 0 : -1}>Add your take<span aria-hidden="true">↗</span></button>}
          <div className="dvc-secondary-actions">
            {(note || draft) && <button type="button" onClick={copy} className="dvc-icon-button" tabIndex={controls ? 0 : -1} aria-label={copied ? 'Idea copied' : `Copy idea from ${card.title}`} title={copied ? 'Copied' : 'Copy idea'}>{copied ? '✓' : <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="6" y="6" width="10" height="11" rx="1"/><path d="M12 6V3H3v11h3"/></svg>}</button>}
            {writable && <button type="button" className="dvc-icon-button" onClick={() => context?.returnCard?.(shape.id)} tabIndex={controls ? 0 : -1} aria-label={`Return ${card.title} to the deck`} title="Return to deck"><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m8 4-4 4 4 4M4 8h7a5 5 0 0 1 0 10"/><path d="M12 3h5v9"/></svg></button>}
          </div>
        </footer>
      </>}
    </article>
  </HTMLContainer>
}

const STATION_PROMPTS = {
  multidisciplinary: 'See it through another pair of eyes.',
  ingenious: 'Escape the obvious answer.',
  optimistic: 'Make room for what could be.',
  flexible: 'Leave a door open for change.',
}

function StationFace({ shape }) {
  const category = categoryById.get(shape.props.category) || CATEGORIES[0]
  const card = CARDS.find(item => item.category === category.id)
  return <HTMLContainer style={{ width: shape.props.w, height: shape.props.h, pointerEvents: 'none' }}>
    <div className="dvc-station" style={{ '--dvc-color': category.color }}>
      <span className="dvc-station-number">{String(CATEGORIES.indexOf(category) + 1).padStart(2, '0')}</span>
      <div><span className="dvc-station-prompt">{STATION_PROMPTS[category.id]}</span><h2>{category.label}<small>{CARDS.filter(item => item.category === category.id).length} cards</small></h2></div>
      <ChangeCardDoodle cardId={card?.id}/>
    </div>
  </HTMLContainer>
}

function DeckFace({ shape }) {
  const editor = useEditor()
  const context = useDevelop()
  const category = categoryById.get(shape.props.category) || CATEGORIES[0]
  const card = CARDS.find(item => item.category === category.id)
  const total = CARDS.filter(item => item.category === category.id).length
  const remaining = context?.deckCounts?.[category.id] ?? total
  const readonly = useValue('change deck readonly', () => editor.getInstanceState().isReadonly, [editor])
  const controls = useValue('change deck controls', () => ['select', 'hand'].includes(editor.getCurrentToolId()), [editor])
  const disabled = readonly || !controls || remaining === 0 || Boolean(context?.deal) || !context?.drawFromDeck
  const [drawing, setDrawing] = useState(false)
  const previousCount = useRef(remaining)

  useEffect(() => {
    const justDrew = remaining < previousCount.current
    previousCount.current = remaining
    if (!justDrew) { setDrawing(false); return }
    setDrawing(true)
    const timer = window.setTimeout(() => setDrawing(false), 750)
    return () => window.clearTimeout(timer)
  }, [remaining])

  return <HTMLContainer style={{ width: shape.props.w, height: shape.props.h }}>
    <article className={`dvc-deck dvc-category-${category.id}`} data-change-deck={category.id} data-deck-category={category.id}
      data-controls={controls || undefined} data-empty={remaining === 0 || undefined} data-drawing={drawing || undefined}
      aria-label={`${category.shortLabel} deck, ${remaining} of ${total} cards remaining`}
      style={{ '--dvc-color': category.color, width: CARD_W, height: shape.props.h * CARD_W / shape.props.w, transform: `scale(${shape.props.w / CARD_W})` }}>
      <span className="dvc-deck-sheet dvc-deck-sheet-far" aria-hidden="true"/>
      <span className="dvc-deck-sheet dvc-deck-sheet-near" aria-hidden="true"/>
      <div className="dvc-deck-top">
        <header className="dvc-deck-meta"><span>Change Cards</span><span>{String(CATEGORIES.indexOf(category) + 1).padStart(2, '0')} / 04</span></header>
        <div className="dvc-deck-art"><ChangeCardDoodle cardId={card?.id}/></div>
        <div className="dvc-deck-heading"><span>Being</span><h2>{category.shortLabel}</h2></div>
        <p>{STATION_PROMPTS[category.id]}</p>
        <footer className="dvc-deck-footer">
          <span className="dvc-deck-count" aria-live="polite" aria-atomic="true"><b>{String(remaining).padStart(2, '0')}</b><span>{remaining === 0 ? 'all on the table' : 'in the pile'}</span></span>
          <button type="button" {...isolate} onClick={event => context?.drawFromDeck?.(category.id, { originElement: event.currentTarget })} disabled={disabled} tabIndex={controls ? 0 : -1}
            aria-label={`Draw a random ${category.shortLabel.toLowerCase()} card`}>
            {remaining === 0 ? 'All drawn' : 'Draw a card'}<svg viewBox="0 0 27 25" fill="none" aria-hidden="true"><path d="M3 18.5h8.5M8 14.5l4 4-4 4M11 3h12v16H15M15 7h4M15 10h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </footer>
      </div>
    </article>
  </HTMLContainer>
}

function wrap(text, width, fontSize) {
  const result = []
  for (const paragraph of String(text || '').split('\n')) {
    let line = ''
    for (const word of paragraph.split(/\s+/)) {
      if (line && (line.length + word.length + 1) * fontSize * .52 > width) { result.push(line); line = word }
      else line += `${line ? ' ' : ''}${word}`
    }
    result.push(line)
  }
  return result
}

function SvgCard({ shape, artworkSrc }) {
  const card = cardById.get(shape.props.cardId)
  if (!card) return null
  const back = shape.props.face === 'back' && !shape.props.template
  const color = categoryById.get(card.category).color
  const w = CARD_W, h = shape.props.h * CARD_W / shape.props.w
  const title = wrap(card.title.toUpperCase(), w - 44, back ? 23 : 34).slice(0, 4)
  const question = wrap(card.provocation, w - 44, 15)
  const note = shape.meta.developDrafting ? shape.props.draft : (shape.props.note || shape.props.draft)
  const notes = wrap(note, w - 44, 15)
  const artwork = cardArtwork(card.id)
  const sprite = Number.isInteger(artwork?.spriteIndex)
  const titleY = back ? 62 : h - 65 - (title.length - 1) * 33
  const questionY = titleY + title.length * 27 + 15
  const noteY = questionY + question.length * 19 + 24
  const noteLines = Math.max(1, Math.floor((h - 48 - noteY) / 21))
  return <g transform={`scale(${shape.props.w / CARD_W})`}>
    <rect x="1" y="1" width={w - 2} height={h - 2} rx="7" fill={back ? '#fffdf7' : color} stroke="#28242b" strokeOpacity=".6"/>
    {back && <path d={`M8 4.5H${w - 8}`} stroke={color} strokeWidth="7" strokeLinecap="round"/>}
    <text x="22" y="31" fontFamily="sans-serif" fontSize="10" fill="#625d61">{card.label}</text>
    {!back && artworkSrc && <svg x="79" y="65" width="142" height="135" viewBox={sprite ? `${(artwork.spriteIndex % 6) * 100} ${Math.floor(artwork.spriteIndex / 6) * 100} 100 100` : '0 0 100 100'}><image href={artworkSrc} x="0" y="0" width={sprite ? 600 : 100} height={sprite ? 400 : 100}/></svg>}
    {title.map((line, i) => <text key={`title-${i}`} x="22" y={titleY + i * (back ? 27 : 33)} fontFamily="sans-serif" fontSize={back ? 23 : 34} fontWeight="750" fill="#25212a">{line}</text>)}
    {back && question.map((line, i) => <text key={`question-${i}`} x="22" y={questionY + i * 19} fontSize="15" fontFamily="sans-serif" fill="#4d474b">{line}</text>)}
    {back && notes.slice(0, noteLines).map((line, i) => <text key={`note-${i}`} x="22" y={noteY + i * 21} fontSize="15" fontFamily="sans-serif" fill="#25212a">{line}{i === noteLines - 1 && notes.length > noteLines ? '…' : ''}</text>)}
    <line x1="22" x2={w - 22} y1={h - 44} y2={h - 44} stroke="#25212a" strokeOpacity=".2"/>
    <text x="22" y={h - 20} fontSize="10" fontFamily="sans-serif" fill="#25212a">{back ? shape.props.authorName || 'Your take' : 'CHANGE CARDS'}</text>
  </g>
}

function embedArtwork(src) {
  if (!src) return Promise.resolve(null)
  if (!exportArtwork.has(src)) exportArtwork.set(src, fetch(src).then(response => {
    if (!response.ok) throw new Error('Artwork unavailable')
    return response.blob()
  }).then(blob => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })).catch(() => { exportArtwork.delete(src); return null }))
  return exportArtwork.get(src)
}

class ChangeCardShapeUtil extends BaseBoxShapeUtil {
  static type = 'change-card'
  static props = changeCardProps
  getDefaultProps() { return { w: CARD_W, h: CARD_H, cardId: 1, face: 'front', note: '', draft: '', authorId: '', authorName: '', template: false, sparks: [] } }
  canEdit() { return false }
  canResize() { return false }
  component(shape) { return <CardFace shape={shape}/> }
  onDoubleClick(shape) { shapeActions.get(this.editor)?.get(shape.id)?.() }
  getText(shape) { const card = cardById.get(shape.props.cardId); return `${card?.title || 'Change Card'}\n${card?.provocation || ''}\n${shape.props.note || shape.props.draft}` }
  getIndicatorPath(shape) { const path = new Path2D(); path.roundRect(0, 0, shape.props.w, shape.props.h, 7); return path }
  async toSvg(shape) {
    const artworkSrc = shape.props.face === 'front' || shape.props.template ? await embedArtwork(cardArtwork(shape.props.cardId)?.src) : null
    return <SvgCard shape={shape} artworkSrc={artworkSrc}/>
  }
}

class ChangeStationShapeUtil extends BaseBoxShapeUtil {
  static type = 'change-station'
  static props = changeStationProps
  getDefaultProps() { return { w: 1640, h: 140, category: 'multidisciplinary' } }
  canEdit() { return false }
  canResize() { return false }
  canBind() { return false }
  component(shape) { return shape.meta.developDeck ? <DeckFace shape={shape}/> : <StationFace shape={shape}/> }
  getIndicatorPath() { return new Path2D() }
  async toSvg(shape) {
    const category = categoryById.get(shape.props.category) || CATEGORIES[0]
    if (!shape.meta.developDeck) return <text x="20" y="82" fontSize="44" fontWeight="700" fill="#25212a">{category.label}</text>
    const card = CARDS.find(item => item.category === category.id)
    const artworkSrc = await embedArtwork(cardArtwork(card?.id)?.src)
    const h = shape.props.h * CARD_W / shape.props.w
    return <g transform={`scale(${shape.props.w / CARD_W})`}>
      <rect x="0" y="0" width={CARD_W} height={h} rx="7" fill={category.color} stroke="#29272a" strokeOpacity=".5" transform="translate(5 7) rotate(-3 150 215)"/>
      <rect x="0" y="0" width={CARD_W} height={h} rx="7" fill={category.color} stroke="#29272a" strokeOpacity=".5" transform="translate(1 4) rotate(2 150 215)"/>
      <rect x="0" y="0" width={CARD_W} height={h} rx="7" fill={category.color} stroke="#29272a" strokeOpacity=".6"/>
      <text x="22" y="31" fontFamily="sans-serif" fontSize="10" fill="#25212a">CHANGE CARDS</text>
      {artworkSrc && <image href={artworkSrc} x="72" y="60" width="156" height="156"/>}
      <text x="22" y={h - 168} fontFamily="sans-serif" fontSize="13" fill="#25212a">BEING</text>
      <text x="22" y={h - 131} fontFamily="sans-serif" fontSize={category.id === 'multidisciplinary' ? 25 : 32} fontWeight="750" fill="#25212a">{category.shortLabel.toUpperCase()}</text>
      <text x="22" y={h - 101} fontFamily="sans-serif" fontSize="13" fill="#25212a">{STATION_PROMPTS[category.id]}</text>
      <path d={`M22 ${h - 68}H278`} stroke="#25212a" strokeOpacity=".3"/>
      <text x="22" y={h - 31} fontFamily="sans-serif" fontSize="12" fill="#25212a">A DECK OF 10 PROMPTS</text>
    </g>
  }
}

export const CHANGE_SHAPES = [ChangeCardShapeUtil, ChangeStationShapeUtil]
