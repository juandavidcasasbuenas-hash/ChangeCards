import { useEffect, useMemo, useRef, useState } from 'react'

const CARDS = [
  { id: 1, category: 'multidisciplinary', label: 'Being multidisciplinary', title: 'Borrow a Brain', provocation: 'How would someone from a completely different field solve this?' },
  { id: 2, category: 'multidisciplinary', label: 'Being multidisciplinary', title: 'The Wrong Expert', provocation: 'Who has absolutely no business solving this — and what might they notice?' },
  { id: 3, category: 'multidisciplinary', label: 'Being multidisciplinary', title: 'Build the Dream Team', provocation: 'If you could put any three kinds of people in the room, who would they be?' },
  { id: 4, category: 'multidisciplinary', label: 'Being multidisciplinary', title: 'Hand Over the Pen', provocation: 'What if the people affected by this idea designed it themselves?' },
  { id: 5, category: 'ingenious', label: 'Being ingenious', title: 'Do the Opposite', provocation: 'What if you deliberately did the exact opposite?' },
  { id: 6, category: 'ingenious', label: 'Being ingenious', title: 'Kill the Obvious', provocation: 'Remove the most obvious part of your solution. What becomes possible?' },
  { id: 7, category: 'ingenious', label: 'Being ingenious', title: 'Make It Ridiculously Small', provocation: 'You have one day, one person and £100. What do you build?' },
  { id: 8, category: 'ingenious', label: 'Being ingenious', title: 'Turn the Flaw into the Feature', provocation: 'What if the biggest weakness of this idea became its defining strength?' },
  { id: 9, category: 'optimistic', label: 'Being optimistic', title: '10× It', provocation: 'What would the ambitious version of this idea look like?' },
  { id: 10, category: 'optimistic', label: 'Being optimistic', title: 'Assume It Works', provocation: 'Imagine this succeeds beyond expectations. What did you do differently?' },
  { id: 11, category: 'optimistic', label: 'Being optimistic', title: 'Make the Headline', provocation: 'Three years from now this makes the news. What happened?' },
  { id: 12, category: 'optimistic', label: 'Being optimistic', title: 'Design for Everyone', provocation: 'What changes if this has to work for 10 million people?' },
  { id: 13, category: 'flexible', label: 'Being flexible', title: 'Your Assumption Is Wrong', provocation: "The thing you're most confident about turns out to be false. Now what?" },
  { id: 14, category: 'flexible', label: 'Being flexible', title: 'Prototype It Tomorrow', provocation: 'What could you make tomorrow that would teach you something?' },
  { id: 15, category: 'flexible', label: 'Being flexible', title: 'The Evidence Changes', provocation: 'New evidence contradicts your current approach. How do you pivot?' },
  { id: 16, category: 'flexible', label: 'Being flexible', title: 'Let the Intruder In', provocation: 'A completely unexpected idea appears. How could it change yours?' },
]

const CARD_ICON_FILES = [
  '01-borrow-a-brain.png',
  '02-the-wrong-expert.png',
  '03-build-the-dream-team.png',
  '04-hand-over-the-pen.png',
  '05-do-the-opposite.png',
  '06-kill-the-obvious.png',
  '07-make-it-ridiculously-small.png',
  '08-turn-the-flaw-into-the-feature.png',
  '09-10x-it.png',
  '10-assume-it-works.png',
  '11-make-the-headline.png',
  '12-design-for-everyone.png',
  '13-your-assumption-is-wrong.png',
  '14-prototype-it-tomorrow.png',
  '15-the-evidence-changes.png',
  '16-let-the-intruder-in.png',
]

const SWARM_CARD_POSITIONS = [
  [3, 23, -4], [24, 22, 2], [63, 22, -2], [85, 23, 4],
  [3, 42, 2], [19, 42, -3], [70, 42, 3], [86, 42, -2],
  [3, 61, -3], [19, 61, 4], [70, 61, -4], [86, 61, 2],
  [8, 79, 3], [31, 78, -2], [58, 78, 3], [81, 79, -4],
]

const TABLE_CARD_POSITIONS = [
  [16, 3], [26.5, 2], [37, 3], [47.5, 2], [58, 2], [68.5, 3], [79, 2], [89.5, 3],
  [16, 70], [26.5, 69], [37, 71], [47.5, 70], [58, 69], [68.5, 71], [79, 69], [89.5, 70],
]

// A deliberately imperfect, stable set of rotations: physical cards never land perfectly straight.
const CARD_TILTS = [-2.7, 1.8, -1.1, 2.6, -2.2, 1.3, -3.1, 2.2, -1.7, 2.9, -2.4, 1.5, -3.3, 2.1, -1.3, 3]

function shuffleCards(cards) {
  const shuffled = [...cards]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }
  return shuffled
}

function suggestedCardIds(journey) {
  if (!journey.length) return []
  const last = journey.at(-1)
  const used = new Set(journey.map((item) => item.cardId))
  const categories = ['multidisciplinary', 'ingenious', 'optimistic', 'flexible'].filter((category) => category !== last.category)
  return categories.map((category, index) => {
    const options = CARDS.filter((card) => card.category === category && !used.has(card.id))
    const pool = options.length ? options : CARDS.filter((card) => card.category === category)
    return pool[(last.cardId + journey.length + index) % pool.length].id
  })
}

function dealtIdeaPositions(cardX, cardY) {
  const xOffsets = cardX < 50 ? [-1, 15, 7] : [-16, -1, -8]
  const yOffsets = cardY > 60 ? [-30, -28, -49] : [17, 19, 38]
  return xOffsets.map((xOffset, index) => ({
    x: Math.max(2, Math.min(82, cardX + xOffset)),
    y: Math.max(8, Math.min(74, cardY + yOffsets[index])),
  }))
}

const DEFAULT_SESSION = {
  stage: 'intro',
  idea: '',
  mode: 'tabletop',
  journey: [],
  targetSteps: 3,
  evolveFinished: false,
  swarm: {},
  dealtCardIds: [],
  cardPositions: {},
}

function loadSession() {
  try {
    return { ...DEFAULT_SESSION, ...JSON.parse(localStorage.getItem('change-cards-session-v1')) }
  } catch {
    return DEFAULT_SESSION
  }
}

function cacheKey(payload) {
  return ['sol-v2', payload.mode, payload.cardTitle, payload.currentIdea, payload.previousTransformations?.length || 0].join('::')
}

async function requestTransformations(payload, force = false) {
  const key = cacheKey(payload)
  let cache = {}
  try { cache = JSON.parse(sessionStorage.getItem('change-cards-cache-v1')) || {} } catch { /* empty cache */ }
  if (!force && cache[key]) return cache[key]

  const response = await fetch('/api/transform', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'That card slipped off the table.')
  cache[key] = data.transformations
  try { sessionStorage.setItem('change-cards-cache-v1', JSON.stringify(cache)) } catch { /* cache is optional */ }
  return data.transformations
}

async function requestSparks(payload, force = false) {
  const context = JSON.stringify([payload.originalIdea, payload.currentIdea, payload.cardTitle, payload.previousTransformations])
  let signature = 0
  for (let index = 0; index < context.length; index += 1) signature = ((signature * 31) + context.charCodeAt(index)) | 0
  const key = ['sparks-sol-v3', payload.cardTitle, signature.toString(36)].join('::')
  let cache = {}
  try { cache = JSON.parse(sessionStorage.getItem('change-cards-cache-v1')) || {} } catch { /* empty cache */ }
  if (!force && cache[key]) return cache[key]

  const response = await fetch('/api/sparks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'No sparks landed.')
  cache[key] = data.sparks
  try { sessionStorage.setItem('change-cards-cache-v1', JSON.stringify(cache)) } catch { /* cache is optional */ }
  return data.sparks
}

function App() {
  const [session, setSession] = useState(loadSession)

  useEffect(() => {
    localStorage.setItem('change-cards-session-v1', JSON.stringify(session))
  }, [session])

  const update = (patch) => setSession((current) => ({ ...current, ...patch }))

  const startAgain = () => {
    const next = { ...DEFAULT_SESSION }
    setSession(next)
    sessionStorage.removeItem('change-cards-cache-v1')
  }

  if (session.stage === 'intro' || !session.idea) {
    return <Entry session={session} update={update} />
  }

  return (
    <main className="app-shell mode-tabletop">
      <TopBar onRestart={startAgain} />
      <Tabletop session={session} update={update} />
    </main>
  )
}

function Entry({ session, update }) {
  const [draft, setDraft] = useState(session.idea)

  const submit = (event) => {
    event.preventDefault()
    if (!draft.trim()) return
    update({
      idea: draft.trim(),
      stage: 'play',
      mode: 'tabletop',
      dealtCardIds: [],
      cardPositions: {},
      swarm: {},
    })
  }

  return (
    <main className="entry-page">
      <div className="entry-grain" aria-hidden="true" />
      <div className="entry-doodle-wallpaper" aria-hidden="true">
        {CARD_ICON_FILES.map((filename) => (
          <i
            key={filename}
            style={{ '--doodle-image': `url("/icons/change-cards/${filename}")` }}
          />
        ))}
      </div>
      <header className="entry-mark">
        <Logo />
      </header>

      <section className="entry-content">
        <div className="entry-copy">
          <h1>Push an idea<br /><em>somewhere unexpected.</em></h1>
        </div>

        <form className="idea-form" onSubmit={submit}>
            <label htmlFor="idea">What are you working on?</label>
            <div className="idea-input-wrap">
              <textarea
                id="idea"
                value={draft}
                maxLength={1000}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="A public engagement programme connecting laboratory scientists with local communities."
                autoFocus
              />
              <span className="character-count">{draft.length} / 1000</span>
            </div>
            <button className="ink-button" type="submit" disabled={!draft.trim()}>
              Start playing <span aria-hidden="true">→</span>
            </button>
        </form>
      </section>

    </main>
  )
}

function Logo() {
  return (
    <span className="logo" aria-label="Change Cards">
      <span>CHANGE</span><span>CARDS</span>
    </span>
  )
}

function TopBar({ onRestart }) {
  return (
    <header className="topbar">
      <button className="logo-button" onClick={onRestart} aria-label="Start Change Cards again"><Logo /></button>
      <button className="text-button" onClick={onRestart}>New idea ↗</button>
    </header>
  )
}

function OriginalNote({ idea, compact = false }) {
  return (
    <aside className={`original-note ${compact ? 'compact' : ''}`}>
      <span>Your original idea</span>
      <p>{idea}</p>
      <i aria-hidden="true" />
    </aside>
  )
}

function Tabletop({ session, update }) {
  const canvasRef = useRef(null)
  const deckRef = useRef(null)
  const [activeId, setActiveId] = useState(null)
  const [sparkStates, setSparkStates] = useState({})
  const [dragOverDeck, setDragOverDeck] = useState(false)
  const [dealFlight, setDealFlight] = useState(null)
  const [coachStep, setCoachStep] = useState(() => {
    try {
      if (localStorage.getItem('change-cards-onboarding-v2') === 'complete') return 'complete'
    } catch { /* onboarding persistence is optional */ }
    return (session.dealtCardIds || []).length ? 'card' : 'deck'
  })
  const pendingDealFlight = useRef(null)
  const dealtCardIds = session.dealtCardIds || []
  const cardPositions = session.cardPositions || {}
  const notes = session.swarm || {}
  const remainingCards = CARDS.filter((card) => !dealtCardIds.includes(card.id))
  const activeCard = CARDS.find((card) => card.id === activeId)

  useEffect(() => {
    if (!activeCard) return undefined
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setActiveId(null)
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [activeCard])

  const noteContext = useMemo(() => CARDS.flatMap((card) => {
    const note = notes[card.id]
    if (!note?.note?.trim()) return []
    return [{
      cardId: card.id,
      cardTitle: card.title,
      provocation: card.provocation,
      category: card.label,
      idea: note.note.trim(),
      shift: `The user's workshop note for ${card.title}.`,
    }]
  }), [notes])

  function defaultPosition(index) {
    const [x, y] = TABLE_CARD_POSITIONS[index % TABLE_CARD_POSITIONS.length]
    return { x, y }
  }

  function dealOne() {
    if (dealFlight || pendingDealFlight.current) return
    const next = remainingCards[Math.floor(Math.random() * remainingCards.length)]
    if (!next) return
    pendingDealFlight.current = { id: next.id, card: next, slot: dealtCardIds.length }
    if (coachStep === 'deck') setCoachStep('card')
    update({ dealtCardIds: [...dealtCardIds, next.id] })
  }

  useEffect(() => {
    const pending = pendingDealFlight.current
    const lastDealtId = dealtCardIds.at(-1)
    if (!pending || pending.id !== lastDealtId) return
    pendingDealFlight.current = null
    const { x: targetX, y: targetY } = defaultPosition(pending.slot)
    let fromLeft = 20
    let fromTop = 90
    let toLeft = 145
    let toTop = 92
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth || 1200 : 1200
    let cardWidth = viewportWidth <= 720 ? Math.min(168, (viewportWidth - 48) / 2) : Math.min(136, Math.max(88, viewportWidth * 0.087))
    let cardHeight = cardWidth * 1.4
    try {
      const canvas = canvasRef.current?.getBoundingClientRect()
      const deck = deckRef.current?.querySelector('.deck-stack')?.getBoundingClientRect()
      const target = canvasRef.current?.querySelector(`[data-card-id="${pending.id}"]`)?.getBoundingClientRect()
      if (canvas && deck) {
        if (target?.width && target?.height) {
          toLeft = target.left
          toTop = target.top
          cardWidth = target.width
          cardHeight = target.height
        } else {
          toLeft = canvas.left + (targetX / 100) * canvas.width
          toTop = canvas.top + (targetY / 100) * canvas.height
        }
        fromLeft = deck.left + (deck.width - cardWidth) / 2
        fromTop = deck.top + (deck.height - cardHeight) / 2
      }
    } catch {
      // Geometry is only a flourish; the dealt card is already safely committed.
    }
    const duration = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 60 : 980
    const flight = {
      ...pending,
      fromLeft,
      fromTop,
      toLeft,
      toTop,
      deltaX: toLeft - fromLeft,
      deltaY: toTop - fromTop,
      width: cardWidth,
      height: cardHeight,
      duration,
    }
    setDealFlight(flight)
    window.setTimeout(() => setDealFlight((current) => current?.id === pending.id ? null : current), duration)
  }, [dealtCardIds])

  function dealAll() {
    if (!remainingCards.length) return
    if (coachStep === 'deck') setCoachStep('card')
    update({ dealtCardIds: [...dealtCardIds, ...shuffleCards(remainingCards).map((card) => card.id)] })
  }

  function returnCard(cardId) {
    const nextPositions = { ...cardPositions }
    delete nextPositions[cardId]
    update({
      dealtCardIds: dealtCardIds.filter((id) => id !== cardId),
      cardPositions: nextPositions,
    })
    setSparkStates((current) => {
      const next = { ...current }
      delete next[cardId]
      return next
    })
    if (coachStep === 'card' && dealtCardIds.length === 1) setCoachStep('deck')
  }

  function moveCard(cardId, position) {
    update({ cardPositions: { ...cardPositions, [cardId]: position } })
  }

  async function ensureSparks(card, force = false) {
    const existing = sparkStates[card.id]
    if (!force && (existing?.loading || existing?.sparks?.length)) return
    setSparkStates((current) => ({
      ...current,
      [card.id]: { cardId: card.id, loading: true, sparks: [], error: null },
    }))
    try {
      const sparks = await requestSparks({
        originalIdea: session.idea,
        currentIdea: session.idea,
        cardCategory: card.label,
        cardTitle: card.title,
        cardProvocation: card.provocation,
        previousTransformations: noteContext,
      }, force)
      setSparkStates((current) => ({
        ...current,
        [card.id]: { cardId: card.id, loading: false, sparks, error: null },
      }))
    } catch (error) {
      setSparkStates((current) => ({
        ...current,
        [card.id]: { cardId: card.id, loading: false, sparks: [], error: error.message },
      }))
    }
  }

  function openCard(card) {
    if (coachStep !== 'complete') {
      setCoachStep('complete')
      try { localStorage.setItem('change-cards-onboarding-v2', 'complete') } catch { /* onboarding persistence is optional */ }
    }
    setActiveId(card.id)
    ensureSparks(card)
  }

  function saveNote(card, note) {
    const cleanNote = note.trim()
    if (!cleanNote) return
    update({
      swarm: {
        ...notes,
        [card.id]: { note: cleanNote, visited: true, updatedAt: Date.now() },
      },
    })
    setSparkStates({})
    setActiveId(null)
  }

  return (
    <section className="tabletop" aria-label="Change Cards idea table">
      <aside className={`side-deck ${dragOverDeck ? 'is-drop-target' : ''} ${coachStep === 'deck' ? 'is-coaching-deck' : ''}`} ref={deckRef} aria-label="Card deck">
        <button
          type="button"
          className={`deck-stack ${remainingCards.length ? '' : 'is-empty'} ${dealFlight ? 'is-dealing-card' : ''}`}
          aria-label={dealFlight ? 'Card is being dealt' : remainingCards.length ? 'Deal one card from the deck' : 'Deck is empty'}
          aria-disabled={Boolean(dealFlight)}
          onClick={dealOne}
          onKeyDown={(event) => {
            if ((event.key === 'Enter' || event.key === ' ') && remainingCards.length) {
              event.preventDefault()
              dealOne()
            }
          }}
        >
          <i /><i /><i />
          <div className="deck-back"><Logo /><span>{remainingCards.length}</span></div>
        </button>
        {coachStep === 'deck' && remainingCards.length > 0 && (
          <div className="onboarding-hint deck-onboarding-hint" role="note">
            <i aria-hidden="true">←</i>
            <span><strong><span className="tap-label">Tap</span><span className="click-label">Click</span> the deck</strong><small>to deal a card</small></span>
          </div>
        )}
        <p>{dragOverDeck ? 'Drop to put it back' : remainingCards.length ? `${remainingCards.length} still in the deck` : 'The whole deck is out'}</p>
        <div className="deal-controls">
          <button className="deal-all-button" onClick={dealAll} disabled={!remainingCards.length || Boolean(dealFlight)}>Deal all</button>
        </div>
      </aside>

      <div className="tabletop-canvas" ref={canvasRef}>
        <OriginalNote idea={session.idea} />

        {dealtCardIds.map((cardId, index) => {
          const card = CARDS.find((item) => item.id === cardId)
          if (!card) return null
          return (
            <DraggableTableCard
              key={card.id}
              card={card}
              index={index}
              canvasRef={canvasRef}
              position={cardPositions[card.id] || defaultPosition(index)}
              isDealing={dealFlight?.id === card.id}
              visited={Boolean(notes[card.id]?.visited)}
              savedNote={notes[card.id]?.note || ''}
              onMove={(position) => moveCard(card.id, position)}
              deckRef={deckRef}
              onReturn={() => returnCard(card.id)}
              onDeckTarget={setDragOverDeck}
              onOpen={() => openCard(card)}
              onWarm={() => ensureSparks(card)}
              showCoachmark={coachStep === 'card' && index === 0}
            />
          )
        })}
      </div>

      {dealFlight && (
        <div
          className="table-card-shell deal-flight-card"
          data-card-id={dealFlight.id}
          aria-hidden="true"
          style={{
            left: `${dealFlight.fromLeft}px`,
            top: `${dealFlight.fromTop}px`,
            '--flight-x': `${dealFlight.deltaX}px`,
            '--flight-y': `${dealFlight.deltaY}px`,
            '--flight-width': `${dealFlight.width}px`,
            '--flight-height': `${dealFlight.height}px`,
          }}
        >
          <div className="deal-flight-arc">
            <ChangeCard key={dealFlight.id} card={dealFlight.card} index={0} />
          </div>
        </div>
      )}

      {activeCard && (
        <div className="active-card-layer" role="dialog" aria-modal="true" aria-label={`${activeCard.title} workshop card`}>
          <button className="active-card-scrim" onClick={() => setActiveId(null)} aria-label="Put card back on the table" />
          <div className="active-card-wrap">
            <ChangeCard card={activeCard} selected>
              <GenerationSurface
                card={activeCard}
                initialValue={notes[activeCard.id]?.note || ''}
                submitLabel="Save idea →"
                sparkState={sparkStates[activeCard.id]}
                onSubmit={(response) => saveNote(activeCard, response)}
                onRetry={() => ensureSparks(activeCard, true)}
                onClose={() => setActiveId(null)}
              />
            </ChangeCard>
          </div>
        </div>
      )}
    </section>
  )
}

function DraggableTableCard({ card, index, canvasRef, deckRef, position, isDealing, visited, savedNote, onMove, onReturn, onDeckTarget, onOpen, onWarm, showCoachmark }) {
  const [localPosition, setLocalPosition] = useState(position)
  const drag = useRef(null)
  const dragged = useRef(false)
  const pointerActivated = useRef(false)
  const overDeck = useRef(false)

  useEffect(() => setLocalPosition(position), [position.x, position.y])

  function pointerDown(event) {
    if (event.button !== 0) return
    // Touch is for tapping and scrolling. Freeform table dragging remains a
    // desktop interaction so a small finger wobble can never swallow a tap.
    if (event.pointerType !== 'mouse' || window.matchMedia?.('(max-width: 720px)').matches) return
    const canvas = canvasRef.current?.getBoundingClientRect()
    const cardRect = event.currentTarget.getBoundingClientRect()
    if (!canvas) return
    drag.current = {
      canvas,
      offsetX: event.clientX - cardRect.left,
      offsetY: event.clientY - cardRect.top,
      startX: event.clientX,
      startY: event.clientY,
      latest: localPosition,
    }
    dragged.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function pointerMove(event) {
    if (!drag.current) return
    const { canvas, offsetX, offsetY, startX, startY } = drag.current
    // Give a normal click a little hand-wobble room; only a deliberate movement becomes a drag.
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > 12) dragged.current = true
    if (!dragged.current) return
    const next = {
      x: Math.max(1, Math.min(89, ((event.clientX - canvas.left - offsetX) / canvas.width) * 100)),
      y: Math.max(1, Math.min(79, ((event.clientY - canvas.top - offsetY) / canvas.height) * 100)),
    }
    drag.current.latest = next
    setLocalPosition(next)
    const deck = deckRef.current?.getBoundingClientRect()
    const insideDeck = Boolean(deck && event.clientX >= deck.left - 12 && event.clientX <= deck.right + 12 && event.clientY >= deck.top - 12 && event.clientY <= deck.bottom + 12)
    if (insideDeck !== overDeck.current) {
      overDeck.current = insideDeck
      onDeckTarget(insideDeck)
    }
  }

  function pointerUp(event) {
    if (!drag.current) return
    const wasDragged = dragged.current
    const deck = deckRef.current?.getBoundingClientRect()
    const releasedOnDeck = Boolean(deck && event && event.clientX >= deck.left - 12 && event.clientX <= deck.right + 12 && event.clientY >= deck.top - 12 && event.clientY <= deck.bottom + 12)
    const shouldReturn = wasDragged && (overDeck.current || releasedOnDeck)
    if (shouldReturn) onReturn()
    else if (wasDragged) onMove(drag.current.latest)
    drag.current = null
    overDeck.current = false
    onDeckTarget(false)
    if (!wasDragged) {
      // Activate from pointerup, before the browser's nested-button click event.
      // This keeps a click reliable even when pointer capture is used for dragging.
      pointerActivated.current = true
      onOpen()
    }
    dragged.current = false
  }

  function select() {
    if (pointerActivated.current) {
      pointerActivated.current = false
      return
    }
    if (dragged.current) {
      dragged.current = false
      return
    }
    onOpen()
  }

  return (
    <div
      className={`table-card-shell ${visited ? 'is-visited' : ''} ${isDealing ? 'is-dealing' : ''} ${showCoachmark ? 'has-coachmark' : ''}`}
      data-card-id={card.id}
      style={{
        left: `${localPosition.x}%`,
        top: `${localPosition.y}%`,
        '--table-z': index + 2,
      }}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={() => { drag.current = null; dragged.current = false; pointerActivated.current = false; overDeck.current = false; onDeckTarget(false) }}
      onPointerEnter={onWarm}
    >
      <ChangeCard card={card} index={index} onSelect={select} faceDown={visited} used={visited} savedNote={savedNote} />
      {showCoachmark && !visited && (
        <div className="onboarding-hint card-onboarding-hint" role="note">
          <i aria-hidden="true">↑</i>
          <span><strong><span className="tap-label">Tap</span><span className="click-label">Click</span> the card</strong><small>to start ideating</small></span>
        </div>
      )}
    </div>
  )
}

function Evolve({ session, update }) {
  const [selectedId, setSelectedId] = useState(null)
  const [sparkState, setSparkState] = useState(null)
  const [order, setOrder] = useState(CARDS.map((card) => card.id))
  const [shufflePulse, setShufflePulse] = useState(false)

  const currentIdea = session.journey.at(-1)?.idea || session.idea
  const step = session.journey.length + 1
  const suggestedIds = useMemo(() => suggestedCardIds(session.journey), [session.journey])
  const arrangedOrder = suggestedIds.length ? [...suggestedIds, ...order.filter((id) => !suggestedIds.includes(id))] : order
  const cardsInOrder = arrangedOrder.map((id) => CARDS.find((card) => card.id === id))

  useEffect(() => {
    if (!selectedId) return undefined
    const scrollTimer = window.setTimeout(() => {
      document.querySelector('.change-card.is-selected')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
        inline: 'center',
      })
    }, 120)
    return () => window.clearTimeout(scrollTimer)
  }, [selectedId])

  async function selectCard(card, force = false) {
    setSelectedId(card.id)
    setSparkState({ cardId: card.id, loading: true, sparks: [], error: null })
    try {
      const sparks = await requestSparks({
        originalIdea: session.idea,
        currentIdea,
        cardCategory: card.label,
        cardTitle: card.title,
        cardProvocation: card.provocation,
        previousTransformations: session.journey.map(({ cardId, cardTitle, provocation, category, title, idea, shift }) => ({
          cardId,
          cardTitle,
          provocation,
          category,
          title,
          idea,
          shift,
        })),
      }, force)
      setSparkState((current) => current?.cardId === card.id ? { cardId: card.id, loading: false, sparks, error: null } : current)
    } catch (error) {
      setSparkState((current) => current?.cardId === card.id ? { cardId: card.id, loading: false, sparks: [], error: error.message } : current)
    }
  }

  function titleFromResponse(response) {
    const firstThought = response.trim().split(/[:.!?\n]/)[0].trim()
    if (firstThought.length <= 54) return firstThought
    return `${firstThought.split(/\s+/).slice(0, 6).join(' ')}…`
  }

  function submitResponse(card, response) {
    const authoredIdea = response.trim()
    if (!authoredIdea) return
    const nextJourney = [...session.journey, {
      cardId: card.id,
      cardTitle: card.title,
      provocation: card.provocation,
      category: card.category,
      title: titleFromResponse(authoredIdea),
      idea: authoredIdea,
      shift: `A user-authored response to ${card.title}.`,
      authored: true,
    }]
    setSelectedId(null)
    setSparkState(null)
    update({
      journey: nextJourney,
      evolveFinished: nextJourney.length >= session.targetSteps,
    })
  }

  function shuffle() {
    setShufflePulse(true)
    setOrder((current) => [...current].sort(() => Math.random() - 0.5))
    window.setTimeout(() => setShufflePulse(false), 650)
  }

  function pickForMe() {
    const available = CARDS.filter((card) => card.id !== selectedId)
    selectCard(available[Math.floor(Math.random() * available.length)])
  }

  if (session.evolveFinished) {
    return (
      <EvolveEnding
        session={session}
        onUndo={() => update({ journey: session.journey.slice(0, -1), evolveFinished: false })}
        onContinue={() => update({ targetSteps: session.targetSteps + 1, evolveFinished: false })}
      />
    )
  }

  return (
    <div className="workspace evolve-workspace">
      <section className="journey-strip" aria-label="Idea journey">
        <OriginalNote idea={session.idea} compact />
        <div className="journey-line">
          <div className="journey-start">
            <span>Original idea</span>
            <i aria-hidden="true" />
          </div>
          {Array.from({ length: session.targetSteps }, (_, index) => {
            const item = session.journey[index]
            return (
              <div className={`journey-stop ${item ? 'complete' : index === session.journey.length ? 'current' : ''}`} key={index}>
                <div className={`journey-card-slot ${item ? `category-${item.category}` : ''}`}>
                  {item ? (
                    <>
                      <b>{String(item.cardId).padStart(2, '0')}</b>
                      <CardIcon id={item.cardId} />
                    </>
                  ) : (
                    <b>{index + 1}</b>
                  )}
                </div>
                <span>{item ? item.cardTitle : `Choose card ${index + 1}`}</span>
                {item && <em>{item.title}</em>}
              </div>
            )
          })}
        </div>
        {session.journey.length > 0 && (
          <button className="undo-button" onClick={() => update({ journey: session.journey.slice(0, -1) })}>↶ Undo</button>
        )}
      </section>

      <section className="deck-section">
        <div className="deck-heading">
          <div>
            <p className="eyebrow">{selectedId ? `Card ${String(selectedId).padStart(2, '0')} of 16` : `Change ${step} of ${session.targetSteps}`}</p>
            <h1>{selectedId ? 'Write the next version.' : step === 1 ? 'Choose a provocation.' : 'Choose the next card.'}</h1>
            <p className="deck-subtitle">{selectedId ? 'Respond in your own words. Tiny sparks drift below the writing space — take one, combine two, or ignore them.' : step === 1 ? 'Pick a card, then use its provocation to evolve the idea yourself.' : 'Each card should develop the version before it. Contrasting cards have drifted forward as a gentle nudge.'}</p>
          </div>
          {!selectedId && (
            <div className="deck-tools">
              <button onClick={shuffle}>⤨ Shuffle deck</button>
              <button onClick={pickForMe}>✦ Pick one for me</button>
            </div>
          )}
        </div>

        <div className={`card-grid ${shufflePulse ? 'is-shuffling' : ''} ${selectedId ? 'has-active-card' : ''}`}>
          {cardsInOrder.map((card, index) => (
            <ChangeCard
              key={card.id}
              card={card}
              index={index}
              selected={selectedId === card.id}
              onSelect={() => selectCard(card)}
            >
              {selectedId === card.id && (
                <GenerationSurface
                  card={card}
                  sparkState={sparkState}
                  onSubmit={(response) => submitResponse(card, response)}
                  onRetry={() => selectCard(card, true)}
                  onClose={() => { setSelectedId(null); setSparkState(null) }}
                />
              )}
            </ChangeCard>
          ))}
        </div>
      </section>
    </div>
  )
}

function CardArtwork({ card }) {
  return (
    <>
      <span className="card-category">{card.label}</span>
      <span className="card-symbol" aria-hidden="true"><CardIcon id={card.id} /></span>
      <strong>{card.title}</strong>
      <span className="card-question">{card.provocation}</span>
    </>
  )
}

function ChangeCard({ card, index = 0, selected, disabled, onSelect, children, swarm = false, used = false, faceDown = false, savedNote = '' }) {
  const rotation = CARD_TILTS[(card.id - 1) % CARD_TILTS.length]
  return (
    <article
      className={`change-card category-${card.category} ${selected ? 'is-selected is-flipped' : ''} ${faceDown ? 'is-face-down is-flipped' : ''} ${swarm ? 'swarm-card' : ''} ${used ? 'is-used' : ''}`}
      style={{ '--tilt': `${rotation}deg`, '--deal-delay': `${Math.min(index, 16) * 34}ms` }}
    >
      <div className="card-rotator">
        <button className="card-face card-front" disabled={disabled} onClick={onSelect} title={`${card.title} — ${card.provocation}`} aria-label={`${card.title}: ${card.provocation}`}>
          <CardArtwork card={card} />
        </button>
        <div className="card-face card-back">
          {children || (
            <button className="used-card-back" onClick={onSelect} aria-label={`Open ideas from ${card.title}`}>
              <CardIcon id={card.id} />
              <span>{used ? 'Note saved' : 'Turn me over'}</span>
              <strong>{card.title}</strong>
              {used && savedNote && <p className="saved-note">{savedNote}</p>}
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

function CardIcon({ id }) {
  const filename = CARD_ICON_FILES[id - 1]
  if (!filename) return null
  return (
    <span
      className="card-icon supplied-card-icon"
      data-icon={id}
      aria-hidden="true"
      style={{ '--card-icon-image': `url("/icons/change-cards/${filename}")` }}
    />
  )
}

function GenerationSurface({ card, sparkState, onSubmit, onRetry, onClose, initialValue = '', submitLabel = 'Save note →' }) {
  const [draft, setDraft] = useState(initialValue)
  const [takenSparks, setTakenSparks] = useState([])
  const [sparkIndex, setSparkIndex] = useState(0)
  const [sparkVisible, setSparkVisible] = useState(true)
  const [sparkPaused, setSparkPaused] = useState(false)
  const editorRef = useRef(null)
  const sparks = sparkState?.sparks || []

  useEffect(() => {
    if (window.matchMedia?.('(max-width: 720px)').matches) return undefined
    const focusTimer = window.setTimeout(() => editorRef.current?.focus({ preventScroll: true }), 720)
    return () => window.clearTimeout(focusTimer)
  }, [])

  useEffect(() => {
    setDraft(initialValue)
    setTakenSparks([])
  }, [card.id, initialValue])

  useEffect(() => {
    setSparkIndex(0)
    setSparkVisible(true)
  }, [sparkState?.cardId])

  useEffect(() => {
    if (!sparks.length || sparkPaused) return undefined
    setSparkVisible(true)
    const fadeTimer = window.setTimeout(() => setSparkVisible(false), 5000)
    const nextTimer = window.setTimeout(() => setSparkIndex((current) => (current + 1) % sparks.length), 6200)
    return () => {
      window.clearTimeout(fadeTimer)
      window.clearTimeout(nextTimer)
    }
  }, [sparks.length, sparkIndex, sparkPaused])

  const submit = (event) => {
    event.preventDefault()
    onSubmit(draft)
  }

  const takeSpark = (spark) => {
    setDraft((current) => `${current.trim()}${current.trim() ? '\n' : ''}${spark} — `)
    setTakenSparks((current) => current.includes(spark) ? current : [...current, spark])
    window.setTimeout(() => editorRef.current?.focus({ preventScroll: true }), 0)
  }

  return (
    <div className="generation-surface">
      <button className="surface-close" type="button" onClick={onClose} aria-label="Put card back">×</button>
      <form className="response-workbench" onSubmit={submit}>
        <div className="provocation-copy">
          <p>{card.provocation}</p>
        </div>
        <label className="sr-only" htmlFor={`response-${card.id}`}>Write the next version of your idea</label>
        <textarea
          id={`response-${card.id}`}
          ref={editorRef}
          className="response-editor"
          value={draft}
          maxLength={1000}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Start rough. One changed detail is enough…"
        />
        <div className={`spark-cloud ${sparkState?.loading ? 'is-catching' : ''}`} aria-label="AI-generated subject-specific writing prompts" aria-live="polite">
          <span className="spark-dust" aria-hidden="true">
            {Array.from({ length: 9 }, (_, index) => <i key={index}>✦</i>)}
          </span>
          {sparkState?.loading ? (
            <div className="spark-catcher" role="status" aria-label="Generating a spark"><i>✦</i></div>
          ) : sparkState?.error ? (
            <button className="spark-retry" type="button" onClick={onRetry}>No sparks landed · try again ↻</button>
          ) : sparks.length ? (
            <div className="spark-single-stage" data-spark-count={sparks.length} onMouseEnter={() => setSparkPaused(true)} onMouseLeave={() => setSparkPaused(false)}>
              <button
                type="button"
                data-spark={sparks[sparkIndex]}
                className={`${sparkVisible ? 'is-visible' : ''} ${takenSparks.includes(sparks[sparkIndex]) ? 'is-taken' : ''}`}
                onFocus={() => setSparkPaused(true)}
                onBlur={() => setSparkPaused(false)}
                onClick={() => takeSpark(sparks[sparkIndex])}
              >
                <span aria-hidden="true">✦</span>{sparks[sparkIndex]}
              </button>             
            </div>
          ) : null}
        </div>
        <button className="response-submit" type="submit" disabled={!draft.trim()}>{submitLabel}</button>
      </form>
    </div>
  )
}

function EvolveEnding({ session, onUndo, onContinue }) {
  const finalIdea = session.journey.at(-1)
  const copy = async (value) => {
    await navigator.clipboard.writeText(value)
  }
  const fullJourney = [
    `ORIGINAL\n${session.idea}`,
    ...session.journey.map((item, index) => `CHANGE ${index + 1} — ${item.cardTitle}\n${item.title}\n${item.idea}`),
  ].join('\n\n')

  return (
    <div className="ending-page">
      <header className="ending-intro">
        <p className="eyebrow">Journey complete</p>
        <h1>Your idea,<br /><em>evolved.</em></h1>
      </header>

      <section className="final-idea-feature">
        <span>Final version</span>
        <h2>{finalIdea.title}</h2>
        <p>{finalIdea.idea}</p>
      </section>

      <div className="journey-recap-heading">
        <span>The path here</span>
        <button onClick={() => copy(fullJourney)}>Copy path ↗</button>
      </div>
      <div className="ancestry">
        <article className="ancestry-original">
          <span>Original idea</span><p>{session.idea}</p>
        </article>
        {session.journey.map((item, index) => (
          <div className="ancestry-step" key={`${item.cardId}-${index}`}>
            <div className={`tiny-change-card category-${item.category}`} title={item.cardTitle}>
              <b>{String(item.cardId).padStart(2, '0')}</b>
              <CardIcon id={item.cardId} />
              <span>{item.cardTitle}</span>
            </div>
            <article>
              <span>{String(index + 1).padStart(2, '0')} / {item.cardTitle}</span>
              <h2>{item.title}</h2>
              <p>{item.idea}</p>
            </article>
          </div>
        ))}
      </div>
      <div className="final-actions">
        <button className="ink-button" onClick={() => copy(`${finalIdea.title}\n${finalIdea.idea}`)}>Copy final idea</button>
        <button onClick={onContinue}>Keep evolving →</button>
      </div>
      <button className="ending-undo" onClick={onUndo}>↶ Undo last change</button>
    </div>
  )
}

function Swarm({ session, update }) {
  const canvasRef = useRef(null)
  const [selectedId, setSelectedId] = useState(null)
  const [showFavourites, setShowFavourites] = useState(false)
  const swarm = session.swarm || {}

  const favourites = useMemo(() => Object.values(swarm).flatMap((group) => group.items || []).filter((item) => item.starred), [swarm])

  function updateGroup(cardId, updater) {
    const existing = swarm[cardId] || { items: [], expanded: true }
    update({ swarm: { ...swarm, [cardId]: typeof updater === 'function' ? updater(existing) : { ...existing, ...updater } } })
  }

  async function selectCard(card, force = false) {
    const existing = swarm[card.id]
    if (existing?.loading) return
    if (existing?.items?.length && !force) {
      updateGroup(card.id, { expanded: !existing.expanded })
      setSelectedId(existing.expanded ? null : card.id)
      return
    }

    setSelectedId(card.id)
    updateGroup(card.id, { loading: true, error: null, expanded: true })
    try {
      const transformations = await requestTransformations({
        originalIdea: session.idea,
        currentIdea: session.idea,
        mode: 'swarm',
        cardCategory: card.label,
        cardTitle: card.title,
        cardProvocation: card.provocation,
        previousTransformations: [],
      }, force)
      const [cardX, cardY] = SWARM_CARD_POSITIONS[card.id - 1]
      const dealtPositions = dealtIdeaPositions(cardX, cardY)
      const items = transformations.map((item, index) => ({
        ...item,
        uid: `${card.id}-${Date.now()}-${index}`,
        ...dealtPositions[index],
        starred: false,
      }))
      updateGroup(card.id, { items, loading: false, error: null, expanded: true })
    } catch (error) {
      updateGroup(card.id, { loading: false, error: error.message, expanded: true })
    }
  }

  function changeItem(cardId, uid, patch) {
    updateGroup(cardId, (group) => ({
      ...group,
      items: group.items.map((item) => item.uid === uid ? { ...item, ...patch } : item),
    }))
  }

  function dismissItem(cardId, uid) {
    updateGroup(cardId, (group) => ({ ...group, items: group.items.filter((item) => item.uid !== uid) }))
  }

  const usedCount = Object.values(swarm).filter((group) => group.items?.length).length

  return (
    <div className="swarm-workspace">
      <section className="swarm-heading">
        <div>
          <p className="eyebrow">Open exploration · {usedCount} of 16 cards played</p>
          <h1>Make a glorious mess.</h1>
          <p>Every card transforms your original idea. Drag what lands. Pin what sticks.</p>
        </div>
        <div className="swarm-tools">
          <button onClick={() => update({ swarm: {} })} disabled={!usedCount}>Clear the table ↺</button>
          <button className="favourite-button" onClick={() => setShowFavourites(true)} disabled={!favourites.length}>★ View favourites <b>{favourites.length}</b></button>
        </div>
      </section>

      <section className="swarm-canvas" ref={canvasRef} aria-label="Swarm idea canvas">
        <div className="table-instruction" aria-hidden="true">Pick any card / there is no right order</div>
        <OriginalNote idea={session.idea} />

        {CARDS.map((card, index) => {
          const group = swarm[card.id]
          const [x, y, rotation] = SWARM_CARD_POSITIONS[index]
          return (
            <div className="swarm-card-position" key={card.id} style={{ left: `${x}%`, top: `${y}%`, '--swarm-rotation': `${rotation}deg`, '--mobile-left': `${22 + index * 128}px` }}>
              <ChangeCard
                card={card}
                index={index}
                swarm
                selected={selectedId === card.id || Boolean(group?.items?.length)}
                used={Boolean(group?.items?.length)}
                disabled={Boolean(group?.loading)}
                onSelect={() => selectCard(card)}
              />
              {group?.loading && <span className="swarm-loading">dealing…</span>}
              {group?.error && <button className="swarm-error" onClick={() => selectCard(card, true)}>Try again ↻</button>}
              {group?.items?.length > 0 && (
                <button className="regenerate" onClick={() => selectCard(card, true)} aria-label={`Regenerate ${card.title}`}>↻</button>
              )}
            </div>
          )
        })}

        {Object.entries(swarm).flatMap(([cardId, group]) => group.expanded ? (group.items || []).map((item, index) => (
          <IdeaSticky
            key={item.uid}
            item={item}
            index={index}
            canvasRef={canvasRef}
            onMove={(position) => changeItem(cardId, item.uid, position)}
            onStar={() => changeItem(cardId, item.uid, { starred: !item.starred })}
            onDismiss={() => dismissItem(cardId, item.uid)}
          />
        )) : [])}
      </section>

      {showFavourites && (
        <FavouriteTray favourites={favourites} onClose={() => setShowFavourites(false)} />
      )}
    </div>
  )
}

function IdeaSticky({ item, index, canvasRef, onMove, onStar, onDismiss }) {
  const drag = useRef(null)

  function pointerDown(event) {
    if (event.button !== 0 || event.target.closest('button')) return
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    drag.current = { rect }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function pointerMove(event) {
    if (!drag.current) return
    const { rect } = drag.current
    onMove({
      x: Math.max(0, Math.min(84, ((event.clientX - rect.left - 30) / rect.width) * 100)),
      y: Math.max(0, Math.min(88, ((event.clientY - rect.top - 20) / rect.height) * 100)),
    })
  }

  return (
    <article
      className={`idea-sticky ${item.starred ? 'is-starred' : ''}`}
      style={{ left: `${item.x}%`, top: `${item.y}%`, '--sticky-rotation': `${(index - 1) * 2}deg`, '--sticky-delay': `${index * 120}ms` }}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={() => { drag.current = null }}
    >
      <div className="sticky-actions">
        <button onClick={onStar} aria-label={item.starred ? 'Unpin idea' : 'Pin idea'}>{item.starred ? '★' : '☆'}</button>
        <button onClick={onDismiss} aria-label="Dismiss idea">×</button>
      </div>
      <span className="tape" aria-hidden="true" />
      <h2>{item.title}</h2>
      <p>{item.idea}</p>
      <small>{item.shift}</small>
    </article>
  )
}

function FavouriteTray({ favourites, onClose }) {
  const copyAll = () => navigator.clipboard.writeText(favourites.map((item) => `${item.title}\n${item.idea}`).join('\n\n'))
  return (
    <aside className="favourite-tray">
      <div className="tray-header">
        <div><p className="eyebrow">Pinned from the table</p><h2>Your favourites</h2></div>
        <button onClick={onClose} aria-label="Close favourites">×</button>
      </div>
      <div className="tray-list">
        {favourites.map((item) => <article key={item.uid}><h3>{item.title}</h3><p>{item.idea}</p></article>)}
      </div>
      <button className="ink-button" onClick={copyAll}>Copy all favourites</button>
    </aside>
  )
}

export default App
