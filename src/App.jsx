import { useEffect, useMemo, useRef, useState } from 'react'
import { Analytics } from '@vercel/analytics/react'
import {
  closeCurrentRound,
  createWorkshop,
  endWorkshop,
  isCoopConfigured,
  joinWorkshop,
  loadWorkshop,
  saveWorkshopIdea,
  startNextRound,
  submitTransformation,
  subscribeToWorkshop,
} from './supabase.js'

const COMPACT_TABLE_QUERY = '(max-width: 820px)'

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

// Curated rather than generated at runtime: the landing page can feel alive
// immediately, without spending a request before the workshop has even begun.
const IDEA_EXAMPLES = [
  'A calmer handover for nurses finishing a night shift.',
  'A neighbourhood tool library run by retired engineers.',
  'A podcast that helps teenagers understand local politics.',
  'A low-waste menu for a busy family-owned restaurant.',
  'A museum trail designed with people who rarely visit museums.',
  'A better first week for children starting secondary school.',
  'A repair service for outdoor clothing that people love using.',
  'A climate workshop that farmers would genuinely recommend.',
  'A rehearsal process that gives every performer a real voice.',
  'A simple way for renters to improve their shared street.',
  'A safer late-night journey home for hospitality workers.',
  'A library service for people who never think to enter a library.',
  'A research conference where the public shapes the questions.',
  'A return-to-work programme for parents after extended leave.',
  'A football club that makes new supporters feel they belong.',
  'A financial app that works for people with unpredictable income.',
  'A community garden that stays lively through the winter.',
  'A science lesson built around the mysteries in a local park.',
  'A more humane way to wait for an outpatient appointment.',
  'A market stall that makes unfamiliar vegetables irresistible.',
  'A local news service designed for people short on time.',
  'An apprenticeship shaped jointly by students and small businesses.',
  'A music venue that neighbours are glad to live beside.',
  'A welcoming fitness class for people who dislike exercise.',
  'A digital archive that families can explore together.',
  'A staff meeting that gives quiet thinkers room to contribute.',
  'A circular packaging system for independent coffee shops.',
  'A housing consultation that young renters choose to attend.',
  'A playful way to help adults learn a new language.',
  'A public square that still feels inviting in bad weather.',
  'A mentoring network for first-generation university students.',
  'A better way for neighbours to share care during a heatwave.',
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
  scrapbookOrder: [],
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

async function writeClipboard(text) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
    await navigator.clipboard.writeText(text)
    return
  } catch {
    const fallback = document.createElement('textarea')
    fallback.value = text
    fallback.setAttribute('readonly', '')
    fallback.style.position = 'fixed'
    fallback.style.opacity = '0'
    fallback.style.pointerEvents = 'none'
    document.body.appendChild(fallback)
    fallback.select()
    fallback.setSelectionRange(0, fallback.value.length)
    const copied = document.execCommand('copy')
    fallback.remove()
    if (!copied) throw new Error('Copy failed')
  }
}

function formatSavedIdea(card, note) {
  return `CHANGE CARD — ${card.title}\nQuestion: ${card.provocation}\n\nIDEA\n${note.trim()}`
}

function formatAllSavedIdeas(originalIdea, notes) {
  const chronological = CARDS
    .filter((card) => notes?.[card.id]?.visited && notes[card.id]?.note?.trim())
    .sort((a, b) => (notes[a.id]?.updatedAt || 0) - (notes[b.id]?.updatedAt || 0))
  const savedIdeas = chronological.map((card, index) => (
    `${index + 1}. ${card.title}\nQuestion: ${card.provocation}\n\n${notes[card.id].note.trim()}`
  ))
  return `CHANGE CARDS\n\nORIGINAL IDEA\n${originalIdea.trim()}\n\nSAVED IDEAS\n\n${savedIdeas.join('\n\n')}`
}

function App() {
  const [session, setSession] = useState(loadSession)
  const [roomCode, setRoomCode] = useState(() => new URLSearchParams(window.location.search).get('room')?.toUpperCase() || '')
  const [activeCard, setActiveCard] = useState(null)
  const [scrapbookOpen, setScrapbookOpen] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState({ key: null, message: '' })
  const activeTriggerRef = useRef(null)
  const scrapbookTriggerRef = useRef(null)
  const privacyTriggerRef = useRef(null)
  const copyTimerRef = useRef(null)
  const analyticsEnabled = !['localhost', '127.0.0.1'].includes(window.location.hostname)

  useEffect(() => {
    localStorage.setItem('change-cards-session-v1', JSON.stringify(session))
  }, [session])

  useEffect(() => () => window.clearTimeout(copyTimerRef.current), [])

  const update = (patch) => setSession((current) => ({ ...current, ...patch }))

  const startAgain = () => {
    const next = { ...DEFAULT_SESSION }
    setActiveCard(null)
    setScrapbookOpen(false)
    setSession(next)
    sessionStorage.removeItem('change-cards-cache-v1')
  }

  const openCard = (cardId, mode, trigger) => {
    activeTriggerRef.current = trigger instanceof HTMLElement ? trigger : document.activeElement
    setActiveCard({ cardId, mode })
  }

  const closeCard = () => {
    setActiveCard(null)
    window.setTimeout(() => activeTriggerRef.current?.focus?.({ preventScroll: true }), 0)
  }

  const openScrapbook = (trigger) => {
    scrapbookTriggerRef.current = trigger instanceof HTMLElement ? trigger : document.activeElement
    setScrapbookOpen(true)
  }

  const closeScrapbook = () => {
    setScrapbookOpen(false)
    window.setTimeout(() => scrapbookTriggerRef.current?.focus?.({ preventScroll: true }), 0)
  }

  const copyWithFeedback = async (key, value, successMessage) => {
    window.clearTimeout(copyTimerRef.current)
    try {
      await writeClipboard(value)
      setCopyFeedback({ key, message: successMessage })
      copyTimerRef.current = window.setTimeout(() => setCopyFeedback({ key: null, message: '' }), 2200)
    } catch {
      setCopyFeedback({ key: 'error', message: 'Could not copy. Please try again.' })
      copyTimerRef.current = window.setTimeout(() => setCopyFeedback({ key: null, message: '' }), 3200)
    }
  }

  const enterRoom = (code) => {
    const cleanCode = code.toUpperCase()
    const url = new URL(window.location.href)
    url.searchParams.set('room', cleanCode)
    window.history.pushState({}, '', url)
    setRoomCode(cleanCode)
  }

  const leaveRoom = () => {
    const url = new URL(window.location.href)
    url.searchParams.delete('room')
    window.history.pushState({}, '', url)
    setRoomCode('')
  }

  const openPrivacy = (event) => {
    privacyTriggerRef.current = event.currentTarget
    setPrivacyOpen(true)
  }

  const closePrivacy = () => {
    setPrivacyOpen(false)
    window.setTimeout(() => privacyTriggerRef.current?.focus?.({ preventScroll: true }), 0)
  }

  const withPrivacy = (page) => (
    <>
      {page}
      <PrivacyNotice open={privacyOpen} onClose={closePrivacy} />
      {analyticsEnabled && <Analytics />}
    </>
  )

  if (roomCode) {
    return withPrivacy(
      <>
        <CoopWorkshop roomCode={roomCode} onLeave={leaveRoom} />
        <ProjectCredit compact appFooter privacyOnly onOpenPrivacy={openPrivacy} />
      </>,
    )
  }

  if (session.stage === 'intro' || !session.idea) {
    return withPrivacy(<Entry session={session} update={update} onEnterRoom={enterRoom} onOpenPrivacy={openPrivacy} />)
  }

  const scrapbookOrder = session.scrapbookOrder || []
  const scrapbookOrderIndex = new Map(scrapbookOrder.map((cardId, index) => [cardId, index]))
  const savedCards = CARDS
    .filter((card) => session.swarm?.[card.id]?.visited)
    .sort((a, b) => {
      const aIndex = scrapbookOrderIndex.get(a.id)
      const bIndex = scrapbookOrderIndex.get(b.id)
      if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex
      if (aIndex !== undefined) return -1
      if (bIndex !== undefined) return 1
      return (session.swarm[b.id]?.updatedAt || 0) - (session.swarm[a.id]?.updatedAt || 0)
    })

  const reorderScrapbookCard = (cardId, targetId) => {
    if (cardId === targetId) return
    const order = savedCards.map((card) => card.id)
    const fromIndex = order.indexOf(cardId)
    const targetIndex = order.indexOf(targetId)
    if (fromIndex < 0 || targetIndex < 0) return
    const [moved] = order.splice(fromIndex, 1)
    order.splice(targetIndex, 0, moved)
    update({ scrapbookOrder: order })
  }

  return withPrivacy(
    <main className="app-shell mode-tabletop">
      <TopBar
        onRestart={startAgain}
        savedCards={savedCards}
        onOpenSaved={(cardId, trigger) => openCard(cardId, 'review', trigger)}
        onOpenScrapbook={openScrapbook}
        onCopyAll={() => copyWithFeedback('all', formatAllSavedIdeas(session.idea, session.swarm), 'All saved ideas copied.')}
        copied={copyFeedback.key === 'all'}
      />
      {scrapbookOpen && (
        <Scrapbook
          idea={session.idea}
          cards={savedCards}
          notes={session.swarm}
          obscured={Boolean(activeCard)}
          onClose={closeScrapbook}
          onOpenCard={(cardId, trigger) => openCard(cardId, 'review', trigger)}
          onReorder={reorderScrapbookCard}
        />
      )}
      <Tabletop
        session={session}
        update={update}
        activeCard={activeCard}
        savedCards={savedCards}
        openCard={openCard}
        closeCard={closeCard}
        setActiveCard={setActiveCard}
        copyFeedback={copyFeedback}
        onCopyIdea={(card, note) => copyWithFeedback(`card-${card.id}`, formatSavedIdea(card, note), `${card.title} copied.`)}
      />
      {copyFeedback.message && (
        <div className={`feedback-toast ${copyFeedback.key === 'error' ? 'is-error' : ''}`} role={copyFeedback.key === 'error' ? 'alert' : 'status'}>
          {copyFeedback.message}
        </div>
      )}
      <ProjectCredit compact appFooter hidden={Boolean(activeCard) || scrapbookOpen} onOpenPrivacy={openPrivacy} />
    </main>,
  )
}

function Entry({ session, update, onEnterRoom, onOpenPrivacy }) {
  const [draft, setDraft] = useState(session.idea)
  const [playMode, setPlayMode] = useState('solo')
  const [roomCodeDraft, setRoomCodeDraft] = useState('')
  const [displayName, setDisplayName] = useState(() => localStorage.getItem('change-cards-coop-display-name') || '')
  const [coopPath, setCoopPath] = useState(null)
  const [creatingRoom, setCreatingRoom] = useState(false)
  const [joiningRoom, setJoiningRoom] = useState(false)
  const [entryError, setEntryError] = useState('')
  const [ideaExample] = useState(() => IDEA_EXAMPLES[Math.floor(Math.random() * IDEA_EXAMPLES.length)])

  const beginJoiningRoom = () => {
    const code = roomCodeDraft.trim().toUpperCase()
    setEntryError('')
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) {
      setEntryError('Room codes are six characters. Check the code and try again.')
      return
    }
    if (!draft.trim()) {
      setEntryError('Add what you’re working on before joining.')
      return
    }
    if (!isCoopConfigured) {
      setEntryError('Co-op needs the Supabase project URL and publishable key in .env.')
      return
    }
    setCoopPath('join')
  }

  const finishCoopEntry = async (event) => {
    event.preventDefault()
    setEntryError('')
    if (!displayName.trim()) {
      setEntryError('Add your name to continue.')
      return
    }

    const isJoining = coopPath === 'join'
    if (isJoining) setJoiningRoom(true)
    else setCreatingRoom(true)
    try {
      const room = isJoining
        ? await joinWorkshop({ code: roomCodeDraft.trim().toUpperCase(), displayName: displayName.trim() })
        : await createWorkshop({ displayName: displayName.trim(), idea: draft.trim() })
      if (isJoining) await saveWorkshopIdea({ workshopId: room.workshop_id, idea: draft.trim() })
      localStorage.setItem('change-cards-coop-display-name', displayName.trim())
      localStorage.setItem(`change-cards-coop-name-${room.code}`, displayName.trim())
      onEnterRoom(room.code)
    } catch (error) {
      setEntryError(error.message || (isJoining ? 'Could not join that room. Check the code and try again.' : 'Could not create the room. Try again.'))
    } finally {
      if (isJoining) setJoiningRoom(false)
      else setCreatingRoom(false)
    }
  }

  const submit = async (event) => {
    event.preventDefault()

    if (playMode === 'coop') {
      setEntryError('')
      if (!draft.trim()) {
        setEntryError('Add what you’re working on before creating a room.')
        return
      }
      if (!isCoopConfigured) {
        setEntryError('Co-op needs the Supabase project URL and publishable key in .env.')
        return
      }
      setCoopPath('create')
      return
    }

    if (!draft.trim()) return

    update({
      idea: draft.trim(),
      stage: 'play',
      mode: 'tabletop',
      dealtCardIds: [],
      cardPositions: {},
      swarm: {},
      scrapbookOrder: [],
    })
  }

  if (coopPath) {
    return (
      <main className="entry-page entry-name-page">
        <div className="entry-grain" aria-hidden="true" />
        <div className="entry-doodle-wallpaper" aria-hidden="true">
          {CARD_ICON_FILES.map((filename) => (
            <i key={filename} style={{ '--doodle-image': `url("/icons/change-cards/${filename}")` }} />
          ))}
        </div>
        <header className="entry-mark">
          <Logo />
          <button className="entry-name-back" type="button" onClick={() => { setCoopPath(null); setEntryError('') }}>← Back</button>
        </header>
        <section className="entry-name-step">
          <p className="eyebrow">{coopPath === 'join' ? `Joining room ${roomCodeDraft.trim().toUpperCase()}` : 'Creating a co-op room'}</p>
          <h1>What should we<br /><em>call you?</em></h1>
          <p>So everyone knows whose idea they’re holding.</p>
          <form onSubmit={finishCoopEntry}>
            <label htmlFor="entry-display-name">Your name</label>
            <input id="entry-display-name" type="text" value={displayName} maxLength={40} onChange={(event) => setDisplayName(event.target.value)} placeholder="e.g. Juan" autoComplete="name" autoFocus />
            {entryError && <p className="entry-error" role="alert">{entryError}</p>}
            <button className="ink-button" type="submit" disabled={!displayName.trim() || creatingRoom || joiningRoom}>
              {creatingRoom ? 'Creating room…' : joiningRoom ? 'Joining room…' : 'Continue'}
            </button>
          </form>
        </section>
        <ProjectCredit compact appFooter onOpenPrivacy={onOpenPrivacy} />
      </main>
    )
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
          <fieldset className="entry-mode-switch">
            <legend className="sr-only">Play mode</legend>
            <div className="entry-mode-toggle">
              <button
                type="button"
                className={playMode === 'solo' ? 'is-active' : ''}
                aria-pressed={playMode === 'solo'}
                onClick={() => { setPlayMode('solo'); setEntryError('') }}
              >
                Solo
              </button>
              <button
                type="button"
                className={playMode === 'coop' ? 'is-active' : ''}
                aria-pressed={playMode === 'coop'}
                onClick={() => { setPlayMode('coop'); setEntryError('') }}
              >
                Co-op
              </button>
            </div>
            <p className="entry-mode-context" aria-live="polite">
              {playMode === 'solo' ? 'Explore at your own pace.' : 'Pass ideas around a shared, timed room.'}
            </p>
          </fieldset>
          <label htmlFor="idea">What are you working on?</label>
          <div className="idea-input-wrap">
            <textarea
              id="idea"
              value={draft}
              maxLength={1000}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={ideaExample}
              aria-describedby="idea-example-description"
              autoFocus
            />
            <span id="idea-example-description" className="sr-only">Enter your own idea in any field or discipline.</span>
            {draft && <span className="character-count">{draft.length} / 1000</span>}
          </div>
          {playMode === 'coop' && (
            <fieldset className="entry-room-actions">
              <legend className="sr-only">Choose how to enter co-op</legend>
              <div className="entry-join-choice">
                <label className="sr-only" htmlFor="entry-room-code">Room code</label>
                <input
                  id="entry-room-code"
                  type="text"
                  value={roomCodeDraft}
                  maxLength={6}
                  onChange={(event) => setRoomCodeDraft(event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, ''))}
                  onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); beginJoiningRoom() } }}
                  placeholder="Room code"
                  aria-label="Room code"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck="false"
                />
                <button type="button" onClick={beginJoiningRoom} disabled={roomCodeDraft.length !== 6}>Join room</button>
              </div>
              <span className="entry-room-or">or</span>
              <button className="entry-create-choice" type="submit">Create room</button>
            </fieldset>
          )}
          {entryError && <p className="entry-error" role="alert">{entryError}</p>}
          {playMode === 'solo' && (
            <button className="ink-button" type="submit" disabled={!draft.trim()}>
              Start solo
            </button>
          )}
        </form>
      </section>

      <ProjectCredit compact appFooter onOpenPrivacy={onOpenPrivacy} />
    </main>
  )
}

function coopInviteUrl(code) {
  const url = new URL(window.location.href)
  url.search = ''
  url.searchParams.set('room', code)
  return url.toString()
}

function CoopWorkshop({ roomCode, onLeave }) {
  const [membership, setMembership] = useState(null)
  const [state, setState] = useState(null)
  const [joining, setJoining] = useState(true)
  const [joinError, setJoinError] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [inviteCopied, setInviteCopied] = useState(false)
  const refreshRef = useRef(async () => {})

  useEffect(() => {
    let active = true
    const rememberedName = localStorage.getItem(`change-cards-coop-name-${roomCode}`)
    if (!rememberedName) {
      setJoining(false)
      return undefined
    }
    joinWorkshop({ code: roomCode, displayName: rememberedName })
      .then((room) => { if (active) setMembership(room) })
      .catch(() => {
        localStorage.removeItem(`change-cards-coop-name-${roomCode}`)
        if (active) setJoining(false)
      })
    return () => { active = false }
  }, [roomCode])

  useEffect(() => {
    if (!membership?.workshop_id) return undefined
    let active = true
    let refreshTimer
    let refreshInFlight = false
    const refresh = async () => {
      if (refreshInFlight) return
      refreshInFlight = true
      try {
        const next = await loadWorkshop(membership.workshop_id)
        if (active) {
          setState(next)
          setJoining(false)
        }
      } catch (error) {
        if (active) {
          setActionError(error.message || 'The room could not be refreshed.')
          setJoining(false)
        }
      } finally {
        refreshInFlight = false
      }
    }
    refreshRef.current = refresh
    refresh()
    const unsubscribe = subscribeToWorkshop(membership.workshop_id, () => {
      window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(refresh, 80)
    })
    const fallbackRefresh = window.setInterval(refresh, 3500)
    return () => {
      active = false
      window.clearTimeout(refreshTimer)
      window.clearInterval(fallbackRefresh)
      unsubscribe()
    }
  }, [membership?.workshop_id])

  const join = async (displayName) => {
    setJoining(true)
    setJoinError('')
    try {
      const room = await joinWorkshop({ code: roomCode, displayName })
      localStorage.setItem('change-cards-coop-display-name', displayName)
      localStorage.setItem(`change-cards-coop-name-${roomCode}`, displayName)
      setMembership(room)
    } catch (error) {
      setJoinError(error.message || 'Could not join that room.')
      setJoining(false)
    }
  }

  const runAction = async (action) => {
    setActionBusy(true)
    setActionError('')
    try {
      await action()
      await refreshRef.current()
    } catch (error) {
      setActionError(error.message || 'That did not work. Try again.')
    } finally {
      setActionBusy(false)
    }
  }

  const copyInvite = async () => {
    try {
      await writeClipboard(coopInviteUrl(roomCode))
      setInviteCopied(true)
      window.setTimeout(() => setInviteCopied(false), 2200)
    } catch {
      setActionError('Could not copy the invite link.')
    }
  }

  if (!isCoopConfigured) return <CoopConnectionNotice onLeave={onLeave} />
  if (!membership) return <CoopJoin roomCode={roomCode} joining={joining} error={joinError} onJoin={join} onLeave={onLeave} />
  if (!state && actionError) return <CoopLoadError message={actionError} onLeave={onLeave} />
  if (joining || !state) return <CoopLoading roomCode={roomCode} />

  const { workshop, participants, ideas, assignments, currentUserId } = state
  const me = participants.find((participant) => participant.user_id === currentUserId)
  const myIdea = ideas.find((idea) => idea.owner_participant_id === me?.id)
  const isHost = Boolean(me?.is_host)
  const myAssignment = assignments.find((assignment) => assignment.round_number === workshop.round_number && assignment.participant_id === me?.id)
  const participantById = new Map(participants.map((participant) => [participant.id, participant]))

  return (
    <main className={`coop-page coop-status-${workshop.status}`}>
      <CoopTopbar
        roomCode={roomCode}
        name={me?.display_name}
        isHost={isHost}
        roundEndsAt={workshop.status === 'round' ? workshop.round_ends_at : null}
        copied={inviteCopied}
        onCopy={copyInvite}
        onLeave={onLeave}
      />
      {actionError && <div className="coop-action-error" role="alert">{actionError}</div>}

      {!myIdea && workshop.status === 'lobby' && (
        <CoopIdeaEntry name={me?.display_name} busy={actionBusy} onSave={(idea) => runAction(() => saveWorkshopIdea({ workshopId: workshop.id, idea }))} />
      )}

      {myIdea && workshop.status === 'lobby' && (
        <CoopLobby
          participants={participants}
          ideas={ideas}
          myIdea={myIdea}
          isHost={isHost}
          busy={actionBusy}
          copied={inviteCopied}
          onCopy={copyInvite}
          onStart={() => runAction(() => startNextRound(workshop.id))}
        />
      )}

      {workshop.status === 'round' && myAssignment && (
        <CoopRound
          key={myAssignment.id}
          workshop={workshop}
          assignment={myAssignment}
          participantCount={participants.length}
          isHost={isHost}
          onSubmit={(response) => submitTransformation({ assignmentId: myAssignment.id, response })}
          onExpire={() => runAction(() => closeCurrentRound(workshop.id))}
          onClose={() => runAction(() => closeCurrentRound(workshop.id))}
          onEnd={() => runAction(() => endWorkshop(workshop.id))}
        />
      )}

      {workshop.status === 'round' && !myAssignment && <CoopLoading compact message="Passing you a new idea…" />}

      {workshop.status === 'between' && (
        <CoopBetween
          workshop={workshop}
          participantCount={participants.length}
          isHost={isHost}
          busy={actionBusy}
          onNext={() => runAction(() => startNextRound(workshop.id))}
          onEnd={() => runAction(() => endWorkshop(workshop.id))}
        />
      )}

      {workshop.status === 'ended' && myIdea && (
        <CoopReveal
          idea={myIdea}
          assignments={assignments.filter((assignment) => assignment.idea_id === myIdea.id)}
          participantById={participantById}
          targetRounds={workshop.target_rounds}
          onLeave={onLeave}
        />
      )}
    </main>
  )
}

function CoopTopbar({ roomCode, name, isHost, roundEndsAt, copied, onCopy, onLeave }) {
  return (
    <header className="coop-topbar">
      <button className="logo-button" type="button" onClick={onLeave} aria-label="Leave room and return home"><Logo /></button>
      <button className={`coop-room-code ${copied ? 'is-copied' : ''}`} type="button" onClick={onCopy}>
        <span>Room</span><strong>{roomCode}</strong><small>{copied ? 'Copied' : 'Copy invite'}</small>
      </button>
      <div className="coop-topbar-status">
        {roundEndsAt && <CoopCountdown endsAt={roundEndsAt} topbar />}
        <div className="coop-player-mark"><i aria-hidden="true">{name?.slice(0, 1).toUpperCase()}</i><span>{name}</span>{isHost && <small>Host</small>}</div>
      </div>
    </header>
  )
}

function CoopConnectionNotice({ onLeave }) {
  return (
    <main className="coop-gate-page">
      <div className="entry-grain" aria-hidden="true" />
      <header><Logo /></header>
      <section className="coop-gate-card">
        <p className="eyebrow">Co-op is nearly ready</p>
        <h1>Connect the shared table.</h1>
        <p>Add the Supabase project URL and publishable key to <code>.env</code>, then restart the app.</p>
        <button className="ink-button" type="button" onClick={onLeave}>Back home</button>
      </section>
    </main>
  )
}

function CoopLoadError({ message, onLeave }) {
  return (
    <main className="coop-gate-page">
      <div className="entry-grain" aria-hidden="true" />
      <header><Logo /></header>
      <section className="coop-gate-card" role="alert">
        <p className="eyebrow">The room did not load</p>
        <h1>We lost the table.</h1>
        <p>{message} Your work on this device is still here.</p>
        <button className="ink-button" type="button" onClick={onLeave}>Back home</button>
      </section>
    </main>
  )
}

function CoopJoin({ roomCode, joining, error, onJoin, onLeave }) {
  const [name, setName] = useState(() => localStorage.getItem('change-cards-coop-display-name') || '')
  const submit = (event) => {
    event.preventDefault()
    if (name.trim()) onJoin(name.trim())
  }
  return (
    <main className="coop-gate-page">
      <div className="entry-grain" aria-hidden="true" />
      <div className="coop-gate-doodles" aria-hidden="true"><CardIcon id={4} /><CardIcon id={5} /><CardIcon id={16} /></div>
      <header><button className="logo-button" type="button" onClick={onLeave}><Logo /></button><span>Room {roomCode}</span></header>
      <form className="coop-gate-card" onSubmit={submit}>
        <p className="eyebrow">You’ve been invited</p>
        <h1>Pass an idea.<br />Change another.</h1>
        <p>Bring one thing you’re working on. New perspectives will come back to you.</p>
        <label htmlFor="coop-name">What should we call you?</label>
        <input id="coop-name" type="text" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} placeholder="Your name" autoComplete="name" autoFocus />
        {error && <p className="entry-error" role="alert">{error}</p>}
        <button className="ink-button" type="submit" disabled={!name.trim() || joining}>{joining ? 'Joining room…' : 'Join room'}</button>
      </form>
    </main>
  )
}

function CoopIdeaEntry({ name, busy, onSave }) {
  const [idea, setIdea] = useState('')
  const submit = (event) => {
    event.preventDefault()
    if (idea.trim()) onSave(idea.trim())
  }
  return (
    <section className="coop-idea-entry">
      <div>
        <p className="eyebrow">You’re in, {name}</p>
        <h1>What are you<br />working on?</h1>
        <p>This post-it will travel around the room. Keep it to one clear challenge or idea.</p>
      </div>
      <form className="idea-form" onSubmit={submit}>
        <label htmlFor="coop-idea">Your starting idea</label>
        <div className="idea-input-wrap">
          <textarea id="coop-idea" value={idea} maxLength={1000} onChange={(event) => setIdea(event.target.value)} placeholder="A challenge, project or half-formed idea…" autoFocus />
          {idea && <span className="character-count">{idea.length} / 1000</span>}
        </div>
        <button className="ink-button" type="submit" disabled={!idea.trim() || busy}>{busy ? 'Adding idea…' : 'Add idea to the table'}</button>
      </form>
    </section>
  )
}

function CoopLoading({ roomCode, compact = false, message = 'Joining the table…' }) {
  return (
    <section className={`coop-loading ${compact ? 'is-compact' : ''}`} role="status" aria-live="polite">
      {!compact && <Logo />}
      <span className="coop-loading-cards" aria-hidden="true"><i /><i /><i /></span>
      <p>{message}</p>
      {roomCode && <small>Room {roomCode}</small>}
    </section>
  )
}

function CoopPostIt({ idea, label = 'The idea you’re changing', compact = false }) {
  return (
    <article className={`coop-post-it ${compact ? 'is-compact' : ''}`}>
      <span>{label}</span><p>{idea}</p><i aria-hidden="true" />
    </article>
  )
}

function CoopRoundTrack({ current, target = 4 }) {
  const safeCurrent = Math.max(1, Math.min(current, target))
  return (
    <ol className="coop-round-track" aria-label={`Pass ${safeCurrent} of ${target}`}>
      {Array.from({ length: target }, (_, index) => (
        <li
          key={index}
          className={index + 1 < safeCurrent ? 'is-complete' : index + 1 === safeCurrent ? 'is-current' : ''}
          aria-current={index + 1 === safeCurrent ? 'step' : undefined}
          aria-label={`Pass ${index + 1}${index + 1 < safeCurrent ? ', complete' : index + 1 === safeCurrent ? ', current' : ', upcoming'}`}
        >
          <span>{String(index + 1).padStart(2, '0')}</span><i />
        </li>
      ))}
    </ol>
  )
}

function CoopLobby({ participants, ideas, myIdea, isHost, busy, copied, onCopy, onStart }) {
  const readyIds = new Set(ideas.map((idea) => idea.owner_participant_id))
  const everyoneReady = participants.length >= 2 && participants.every((participant) => readyIds.has(participant.id))
  return (
    <section className="coop-lobby">
      <div className="coop-lobby-copy">
        <p className="eyebrow">Co-op · 4 passes</p>
        <h1>{isHost ? 'Gather the players.' : 'Your idea is in the pile.'}</h1>
        <p>{isHost ? 'Share the room. When every player has added an idea, start the first 60-second pass.' : 'Once the host starts, you’ll receive somebody else’s idea and a different Change Card each pass.'}</p>
        <CoopPostIt idea={myIdea.body} label="Your idea" />
      </div>
      <aside className="coop-lobby-panel">
        <header><span>{ideas.length}/{participants.length}</span><div><strong>Ideas ready</strong><small>Each player adds one</small></div></header>
        <ul>
          {participants.map((participant, index) => (
            <li key={participant.id} style={{ '--player-index': index }}>
              <i>{participant.display_name.slice(0, 1).toUpperCase()}</i><span>{participant.display_name}</span>
              <small>{readyIds.has(participant.id) ? 'Ready' : 'Writing…'}</small>
            </li>
          ))}
        </ul>
        <button className={`coop-invite-button ${copied ? 'is-copied' : ''}`} type="button" onClick={onCopy}><b aria-hidden="true">＋</b><span>{copied ? 'Invite copied' : 'Copy invite link'}<small>Anyone with the link can join</small></span></button>
        {isHost ? (
          <button className="ink-button coop-start-button" type="button" onClick={onStart} disabled={!everyoneReady || busy}>{busy ? 'Starting pass…' : everyoneReady ? 'Start pass 1' : participants.length < 2 ? 'Waiting for another player…' : 'Waiting for all ideas…'}</button>
        ) : <p className="coop-waiting-line"><i /> Waiting for the host to start</p>}
      </aside>
    </section>
  )
}

function CoopCountdown({ endsAt, onExpire, topbar = false }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, new Date(endsAt).getTime() - Date.now()))
  const expired = useRef(false)
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire

  useEffect(() => {
    const tick = () => {
      const next = Math.max(0, new Date(endsAt).getTime() - Date.now())
      setRemaining(next)
      if (next === 0 && !expired.current) {
        expired.current = true
        onExpireRef.current?.()
      }
    }
    tick()
    const timer = window.setInterval(tick, 200)
    return () => window.clearInterval(timer)
  }, [endsAt])

  const seconds = Math.ceil(remaining / 1000)
  return (
    <div className={`coop-countdown ${topbar ? 'is-topbar' : ''} ${seconds <= 10 ? 'is-ending' : ''}`} style={{ '--time-left': Math.max(0, Math.min(1, remaining / 60000)) }} role="timer" aria-label={`${seconds} seconds remaining`}>
      <span>{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</span><i />
    </div>
  )
}

function CoopRound({ workshop, assignment, participantCount, isHost, onSubmit, onExpire, onClose, onEnd }) {
  const card = CARDS.find((item) => item.id === assignment.card_id)
  const [sparkState, setSparkState] = useState(null)
  const [draft, setDraft] = useState('')
  const [submitted, setSubmitted] = useState(Boolean(assignment.response))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [postItPinned, setPostItPinned] = useState(false)
  const expiring = useRef(false)
  const expireRef = useRef(null)
  const submissionPromiseRef = useRef(null)

  const catchSparks = async (force = false) => {
    setSparkState({ cardId: card.id, loading: true, sparks: [], error: null })
    try {
      const sparks = await requestSparks({
        originalIdea: assignment.source_text,
        currentIdea: assignment.source_text,
        cardCategory: card.label,
        cardTitle: card.title,
        cardProvocation: card.provocation,
        previousTransformations: [],
      }, force)
      setSparkState({ cardId: card.id, loading: false, sparks, error: null })
    } catch (sparkError) {
      setSparkState({ cardId: card.id, loading: false, sparks: [], error: sparkError.message })
    }
  }

  useEffect(() => { if (!submitted) catchSparks() }, [assignment.id])

  const submit = (response) => {
    if (submissionPromiseRef.current) return submissionPromiseRef.current
    if (submitted || !response.trim()) return Promise.resolve(false)
    const feedbackStartedAt = performance.now()
    let submission
    submission = (async () => {
      setSaving(true)
      setError('')
      try {
        await onSubmit(response.trim())
        const feedbackRemaining = Math.max(0, 420 - (performance.now() - feedbackStartedAt))
        if (feedbackRemaining) await new Promise((resolve) => window.setTimeout(resolve, feedbackRemaining))
        setSubmitted(true)
        return true
      } catch (submitError) {
        setError(submitError.message || 'Your response did not save. Please try again.')
        throw submitError
      } finally {
        setSaving(false)
        if (submissionPromiseRef.current === submission) submissionPromiseRef.current = null
      }
    })()
    submissionPromiseRef.current = submission
    return submission
  }

  const expire = async () => {
    if (expiring.current) return
    expiring.current = true
    try {
      if (submissionPromiseRef.current) await submissionPromiseRef.current
      else if (!submitted && draft.trim()) await submit(draft)
    } catch { /* error remains visible if the round is still open */ }
    await onExpire()
  }
  expireRef.current = expire

  useEffect(() => {
    const remaining = Math.max(0, new Date(workshop.round_ends_at).getTime() - Date.now())
    const timer = window.setTimeout(() => expireRef.current?.(), remaining + 80)
    return () => window.clearTimeout(timer)
  }, [assignment.id, workshop.round_ends_at])

  useEffect(() => {
    const syncPinnedState = () => {
      const postIt = document.querySelector('.coop-round-page .coop-play-space .coop-post-it')
      if (!postIt) return
      const stickyTop = window.matchMedia('(max-width: 820px)').matches ? 74 : 92
      setPostItPinned(window.scrollY > 0 && postIt.getBoundingClientRect().top <= stickyTop + 2)
    }
    syncPinnedState()
    window.addEventListener('scroll', syncPinnedState, { passive: true })
    window.addEventListener('resize', syncPinnedState)
    return () => {
      window.removeEventListener('scroll', syncPinnedState)
      window.removeEventListener('resize', syncPinnedState)
    }
  }, [assignment.id])

  if (submitted) {
    return (
      <section className="coop-round-waiting">
        <CoopRoundTrack current={workshop.round_number} target={workshop.target_rounds} />
        <div className={`coop-folded-card category-${card.category}`}><CardIcon id={card.id} /><span>Pass complete</span></div>
        <h1>Folded and passed on.</h1>
        <p className="coop-pass-saved" role="status"><b aria-hidden="true">✓</b> Your change is saved in the pile.</p>
        <p className="coop-pass-progress">{Math.max(1, workshop.submitted_count)} of {participantCount} players are ready.</p>
        {isHost && <div className="coop-inline-host-actions"><button type="button" onClick={onClose}>End pass</button><button type="button" onClick={onEnd}>End session</button></div>}
      </section>
    )
  }

  return (
    <section className={`coop-round-page ${postItPinned ? 'is-post-it-pinned' : ''}`}>
      <header className="coop-round-heading">
        <div><p className="eyebrow">Pass {workshop.round_number} of {workshop.target_rounds}</p><h1>A new idea<br />has landed.</h1></div>
        <CoopRoundTrack current={workshop.round_number} target={workshop.target_rounds} />
      </header>
      <div className="coop-play-space">
        <CoopPostIt idea={assignment.source_text} />
        <span className="coop-pass-arrow" aria-hidden="true">→</span>
        <div className={`coop-active-card ${saving ? 'is-folding' : ''}`} aria-busy={saving}>
          <ChangeCard card={card} selected>
            <GenerationSurface card={card} sparkState={sparkState} onSubmit={submit} onDraftChange={setDraft} onRetry={() => catchSparks(true)} submitLabel={saving ? 'Passing it on' : 'Pass it on'} submitting={saving} />
          </ChangeCard>
          {saving && (
            <div className="coop-folding-feedback" role="status" aria-live="assertive">
              <span className="coop-folding-sheet" aria-hidden="true"><i /></span>
              <strong>Passing it on…</strong>
              <small>Saving it into the hidden pile</small>
            </div>
          )}
        </div>
      </div>
      {error && <p className="coop-round-error" role="alert">{error}</p>}
      {isHost && <div className="coop-floating-host-actions"><button type="button" onClick={onClose}>End pass</button><button type="button" onClick={onEnd}>End session</button></div>}
    </section>
  )
}

function CoopBetween({ workshop, participantCount, isHost, busy, onNext, onEnd }) {
  return (
    <section className="coop-between">
      <CoopRoundTrack current={workshop.round_number + 1} target={workshop.target_rounds} />
      <div className="coop-between-pile" aria-hidden="true"><i /><i /><i /><i /></div>
      <p className="eyebrow">Pass {workshop.round_number} complete · {workshop.submitted_count} of {participantCount} responses</p>
      <h1>No peeking yet</h1>
      <p>The ideas return to their owners after pass four.</p>
      {isHost ? (
        <div className="coop-between-actions"><button className="ink-button" type="button" onClick={onNext} disabled={busy}>{busy ? 'Starting pass…' : `Start pass ${workshop.round_number + 1}`}</button><button type="button" onClick={onEnd} disabled={busy}>End session</button></div>
      ) : <p className="coop-waiting-line"><i /> Waiting for the host to start the next pass</p>}
    </section>
  )
}

function CoopReveal({ idea, assignments, participantById, targetRounds, onLeave }) {
  const responses = assignments.filter((assignment) => assignment.response).sort((a, b) => a.round_number - b.round_number)
  const [copied, setCopied] = useState(false)
  const [postItPinned, setPostItPinned] = useState(false)

  useEffect(() => {
    const syncPinnedState = () => {
      const postIt = document.querySelector('.coop-reveal > .coop-post-it')
      if (!postIt) return
      const stickyTop = window.matchMedia('(max-width: 820px)').matches ? 74 : 92
      setPostItPinned(window.scrollY > 0 && postIt.getBoundingClientRect().top <= stickyTop + 2)
    }
    syncPinnedState()
    window.addEventListener('scroll', syncPinnedState, { passive: true })
    window.addEventListener('resize', syncPinnedState)
    return () => {
      window.removeEventListener('scroll', syncPinnedState)
      window.removeEventListener('resize', syncPinnedState)
    }
  }, [])

  const copy = async () => {
    const text = [
      `ORIGINAL IDEA\n${idea.body}`,
      ...responses.map((assignment) => {
        const card = CARDS.find((item) => item.id === assignment.card_id)
        const person = participantById.get(assignment.participant_id)
        return `PASS ${assignment.round_number} — ${card.title} — ${person?.display_name || 'Anonymous'}\nQUESTION: ${card.provocation}\nCHANGE: ${assignment.response}`
      }),
    ].join('\n\n')
    await writeClipboard(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2200)
  }
  return (
    <section className={`coop-reveal ${postItPinned ? 'is-post-it-pinned' : ''}`}>
      <header className="coop-reveal-heading"><div><p className="eyebrow">Your idea is back</p><h1>See what happened<br /><em>while it was away.</em></h1></div></header>
      <CoopPostIt idea={idea.body} label="Where it started" compact />
      <div className="coop-reveal-grid">
        {Array.from({ length: targetRounds }, (_, index) => {
          const assignment = responses.find((item) => item.round_number === index + 1)
          if (!assignment) return <article className="coop-reveal-card is-empty" key={index}><span>{String(index + 1).padStart(2, '0')}</span><p>No change was added in this pass.</p></article>
          const card = CARDS.find((item) => item.id === assignment.card_id)
          const person = participantById.get(assignment.participant_id)
          return (
            <article className={`coop-reveal-card category-${card.category}`} key={assignment.id} style={{ '--reveal-index': index }}>
              <header>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <CardIcon id={card.id} />
                <div><strong>{card.title}</strong><p>{card.provocation}</p><small>Changed by {person?.display_name || 'another player'}</small></div>
              </header>
              <p className="coop-reveal-response">{assignment.response}</p>
            </article>
          )
        })}
      </div>
      <div className="coop-reveal-actions"><button className="ink-button" type="button" onClick={copy}>{copied ? 'Copied' : `Copy ${responses.length === 1 ? 'change' : 'all changes'}`}</button><button type="button" onClick={onLeave}>Back home</button></div>
    </section>
  )
}

function Logo() {
  return (
    <span className="logo" aria-label="Change Cards">
      <span>CHANGE</span><span>CARDS</span>
    </span>
  )
}

function PrivacyNotice({ open, onClose }) {
  const sheetRef = useRef(null)
  const closeRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return undefined
    const previousOverflow = document.body.style.overflow
    const page = document.querySelector('main')
    const previousAriaHidden = page?.getAttribute('aria-hidden')
    document.body.style.overflow = 'hidden'
    page?.setAttribute('inert', '')
    page?.setAttribute('aria-hidden', 'true')
    closeRef.current?.focus({ preventScroll: true })

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const controls = [...(sheetRef.current?.querySelectorAll('a[href], button:not([disabled])') || [])]
      if (!controls.length) return
      const first = controls[0]
      const last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      page?.removeAttribute('inert')
      if (previousAriaHidden === null) page?.removeAttribute('aria-hidden')
      else if (previousAriaHidden !== undefined) page?.setAttribute('aria-hidden', previousAriaHidden)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  if (!open) return null

  return (
    <div className="privacy-layer" role="dialog" aria-modal="true" aria-labelledby="privacy-title" aria-describedby="privacy-intro">
      <button className="privacy-scrim" type="button" tabIndex={-1} onClick={onClose} aria-label="Close privacy notice" />
      <article className="privacy-sheet" ref={sheetRef}>
        <header className="privacy-heading">
          <div>
            <p className="eyebrow">Privacy notice · 1 September 2026</p>
            <h1 id="privacy-title">How your ideas<br /><em>are handled.</em></h1>
          </div>
          <button className="privacy-close" ref={closeRef} type="button" onClick={onClose} aria-label="Close privacy notice">×</button>
          <p id="privacy-intro">Change Cards uses the minimum information needed to run the tool. Please don’t enter confidential information or sensitive personal data about yourself or anyone else.</p>
        </header>

        <ul className="privacy-at-a-glance" aria-label="Privacy at a glance">
          <li><strong>Solo</strong><span>Saved in this browser</span></li>
          <li><strong>Co-op</strong><span>Stored in Supabase</span></li>
          <li><strong>AI</strong><span>Sent to OpenAI only when requested</span></li>
        </ul>

        <div className="privacy-details">
          <section>
            <h2>On this device</h2>
            <p>Solo ideas, notes and interface preferences are saved in browser storage. AI suggestions are also cached temporarily for the browser session. Starting again clears the active workshop; clearing this site’s browser data removes the rest.</p>
            <p>Change Cards uses Vercel Web Analytics to understand broad site usage. Vercel says this records anonymised, aggregated page-view information without cookies; its daily visitor identifier is discarded after 24 hours. It may include the page visited, referrer, approximate location, browser, device and operating system. <a href="https://vercel.com/docs/analytics/privacy-policy" target="_blank" rel="noreferrer">Vercel analytics privacy ↗</a></p>
          </section>

          <section>
            <h2>Co-op rooms</h2>
            <p>Supabase creates an anonymous user ID and stores your display name, room membership, ideas, responses and workshop timestamps. Other people in the room can see your name and workshop content as ideas are passed and revealed.</p>
            <p>Supabase may record technical authentication logs, including IP address and browser details, to operate and secure the service.</p>
          </section>

          <section>
            <h2>Optional AI</h2>
            <p>When you request a Spark or generated option, the current idea, selected Change Card and recent workshop context are sent through the Change Cards server to OpenAI.</p>
            <p>OpenAI states that API inputs and outputs are not used to train its models by default. Default abuse-monitoring logs may be retained for up to 30 days. <a href="https://platform.openai.com/docs/models/default-usage-policies-by-endpoint" target="_blank" rel="noreferrer">OpenAI data controls ↗</a></p>
          </section>

          <section>
            <h2>Purpose, storage and sharing</h2>
            <p>The information is used only to provide, secure and understand the use of Change Cards, relying on legitimate interests in operating and improving the workshop. It is not sold or used for advertising. Supabase, Vercel and OpenAI act as service providers and may process information outside the UK under their contractual safeguards.</p>
            <p>Co-op room records and anonymous accounts do not currently expire automatically; they remain in Supabase until the operator deletes them.</p>
          </section>

          <section className="privacy-rights">
            <h2>Your choices and rights</h2>
            <p>You can clear locally saved information through your browser. To ask for access, correction or deletion of co-op data, contact <a href="https://jdcasasbuenas.com" target="_blank" rel="noreferrer">Juan David Casasbuenas ↗</a> and include the room code and display name where possible.</p>
            <p>You can object to this processing. Depending on the circumstances, you may also have rights to access, correct, delete, restrict or move your personal data, and to complain to the <a href="https://ico.org.uk/make-a-complaint/data-protection-complaints/data-protection-complaints/" target="_blank" rel="noreferrer">UK Information Commissioner ↗</a>.</p>
          </section>
        </div>

        <footer className="privacy-footer">
          <span>Data controller: Juan David Casasbuenas</span>
          <button type="button" onClick={onClose}>Done</button>
        </footer>
      </article>
    </div>
  )
}

function ProjectCredit({ compact = false, appFooter = false, hidden = false, privacyOnly = false, onOpenPrivacy }) {
  if (privacyOnly) {
    return (
      <aside className={`project-credit is-privacy-only ${compact ? 'is-compact' : ''} ${appFooter ? 'is-app-footer' : ''}`} aria-label="Privacy">
        <button className="privacy-link" type="button" onClick={onOpenPrivacy}>Privacy</button>
      </aside>
    )
  }

  return (
    <aside className={`project-credit ${compact ? 'is-compact' : ''} ${appFooter ? 'is-app-footer' : ''} ${hidden ? 'is-hidden' : ''}`} aria-label="About Change Cards">
      <span className="credit-maker"><span className="credit-prefix">A small experiment by </span><a href="https://jdcasasbuenas.com" target="_blank" rel="noreferrer">Juan David Casasbuenas</a></span>
      <i className="credit-separator" aria-hidden="true">·</i>
      <span className="credit-context">Inspired by <a href="https://www.gov.uk/guidance/open-policy-making-toolkit/testing-and-improving-policy-ideas" target="_blank" rel="noreferrer">Policy Lab’s Change Cards</a></span>
      <i className="credit-separator" aria-hidden="true">·</i>
      <button className="privacy-link" type="button" onClick={onOpenPrivacy}>Privacy</button>
    </aside>
  )
}

function CopyIcon({ copied = false }) {
  return copied ? (
    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4.5 10.3 3.2 3.2 7.8-8" /></svg>
  ) : (
    <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="6.5" y="3.5" width="9" height="11" rx="1" /><path d="M12.5 16.5h-8v-10" /></svg>
  )
}

function ScrapbookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 5.5h6.2c.8 0 1.3.25 1.3.75v12.2c0-.8-.65-1.2-1.7-1.2H4.5z" />
      <path d="M19.5 5.5h-6.2c-.8 0-1.3.25-1.3.75v12.2c0-.8.65-1.2 1.7-1.2h5.8z" />
      <path d="M7 9h2.5M14.5 9H17M7 12h2.5M14.5 12H17" />
    </svg>
  )
}

function TopBar({ onRestart, savedCards, onOpenSaved, onOpenScrapbook, onCopyAll, copied }) {
  const [showScrapbookTip, setShowScrapbookTip] = useState(() => {
    try {
      return window.matchMedia(COMPACT_TABLE_QUERY).matches && localStorage.getItem('change-cards-scrapbook-tip-v1') !== 'seen'
    } catch {
      return false
    }
  })

  useEffect(() => {
    if (!showScrapbookTip || !savedCards.length) return undefined
    const timer = window.setTimeout(() => {
      setShowScrapbookTip(false)
      try { localStorage.setItem('change-cards-scrapbook-tip-v1', 'seen') } catch { /* the cue can safely repeat */ }
    }, 5200)
    return () => window.clearTimeout(timer)
  }, [showScrapbookTip, savedCards.length])

  const openScrapbook = (event) => {
    setShowScrapbookTip(false)
    try { localStorage.setItem('change-cards-scrapbook-tip-v1', 'seen') } catch { /* the cue can safely repeat */ }
    onOpenScrapbook(event.currentTarget)
  }

  return (
    <header className="topbar">
      <div className="topbar-workshop">
        <button className="logo-button" onClick={onRestart} aria-label="Start Change Cards again"><Logo /></button>
        {savedCards.length > 0 && (
          <nav className="saved-pins" aria-label={`${savedCards.length} saved ${savedCards.length === 1 ? 'card' : 'cards'}`}>
            <button className={`saved-copy-button ${copied ? 'is-copied' : ''}`} type="button" onClick={onCopyAll} aria-label="Copy all saved ideas" title="Copy all saved ideas">
              <CopyIcon copied={copied} />
              <span>{copied ? 'Copied' : 'Copy ideas'}</span>
            </button>
            <div className="saved-pins-scroll">
              {savedCards.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  className={`saved-pin category-${card.category}`}
                  onClick={(event) => onOpenSaved(card.id, event.currentTarget)}
                  aria-label={`Review saved idea for ${card.title}`}
                  title={card.title}
                >
                  <CardIcon id={card.id} />
                </button>
              ))}
            </div>
            <span className="saved-pins-count" aria-hidden="true">{savedCards.length}</span>
          </nav>
        )}
      </div>
      <div className="topbar-actions">
        {savedCards.length > 0 && (
          <div className="scrapbook-nav-entry">
            <button
              className="text-button scrapbook-nav-button"
              type="button"
              onClick={openScrapbook}
              aria-label={`Open scrapbook with ${savedCards.length} saved ${savedCards.length === 1 ? 'card' : 'cards'}`}
            >
              <ScrapbookIcon />
              <span>Scrapbook</span>
            </button>
            {showScrapbookTip && <span className="scrapbook-nav-tip" role="status">Scrapbook</span>}
          </div>
        )}
        <button className="text-button new-idea-button" onClick={onRestart}>New idea</button>
      </div>
    </header>
  )
}

function Scrapbook({ idea, cards, notes, obscured, onClose, onOpenCard, onReorder }) {
  const dialogRef = useRef(null)
  const closeRef = useRef(null)
  const pointerDragRef = useRef(null)
  const [draggingId, setDraggingId] = useState(null)
  const [dropTargetId, setDropTargetId] = useState(null)
  const [reorderMessage, setReorderMessage] = useState('')

  const resetDrag = () => {
    pointerDragRef.current = null
    setDraggingId(null)
    setDropTargetId(null)
  }

  const moveCard = (cardId, targetId) => {
    if (!cardId || !targetId || cardId === targetId) return
    const card = cards.find((item) => item.id === cardId)
    const targetIndex = cards.findIndex((item) => item.id === targetId)
    onReorder(cardId, targetId)
    setReorderMessage(`${card?.title || 'Card'} moved to position ${targetIndex + 1}.`)
  }

  const startPointerDrag = (event, cardId) => {
    if (event.pointerType === 'mouse') return
    event.preventDefault()
    event.stopPropagation()
    pointerDragRef.current = { cardId, pointerId: event.pointerId, targetId: null }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setDraggingId(cardId)
  }

  const updatePointerDrag = (event) => {
    const drag = pointerDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    const target = document.elementsFromPoint(event.clientX, event.clientY)
      .map((element) => element.closest?.('.scrapbook-card-shell'))
      .find((element) => element && Number(element.dataset.cardId) !== drag.cardId)
    const targetId = target ? Number(target.dataset.cardId) : null
    drag.targetId = targetId
    setDropTargetId(targetId)
  }

  const finishPointerDrag = (event) => {
    const drag = pointerDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    moveCard(drag.cardId, drag.targetId)
    resetDrag()
  }

  const moveWithKeyboard = (event, cardId, index) => {
    const previous = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
    const next = event.key === 'ArrowRight' || event.key === 'ArrowDown'
    if (!previous && !next) return
    const target = cards[index + (previous ? -1 : 1)]
    if (!target) return
    event.preventDefault()
    moveCard(cardId, target.id)
  }

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [])

  useEffect(() => {
    const focusTimer = window.setTimeout(() => closeRef.current?.focus({ preventScroll: true }), 280)
    return () => window.clearTimeout(focusTimer)
  }, [])

  useEffect(() => {
    if (dialogRef.current) dialogRef.current.inert = obscured
  }, [obscured])

  useEffect(() => {
    if (obscured) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = [...(dialogRef.current?.querySelectorAll('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])') || [])]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [obscured, onClose])

  return (
    <section
      ref={dialogRef}
      className={`scrapbook-layer ${obscured ? 'is-obscured' : ''}`}
      role="dialog"
      aria-modal={obscured ? undefined : 'true'}
      aria-hidden={obscured || undefined}
      aria-labelledby="scrapbook-title"
    >
      <header className="scrapbook-header">
        <h1 id="scrapbook-title" className="sr-only">Scrapbook</h1>
        <OriginalNote idea={idea} compact scrapbook />
        <button ref={closeRef} className="scrapbook-close" type="button" onClick={onClose} aria-label="Close scrapbook">×</button>
      </header>
      <div className="scrapbook-scroll">
        <div className="scrapbook-spread">
          <span id="scrapbook-reorder-instructions" className="sr-only">Use the move button to drag a card, or focus it and use the arrow keys.</span>
          {cards.map((card, index) => (
            <article
              key={card.id}
              data-card-id={card.id}
              className={`scrapbook-card-shell category-${card.category} ${draggingId === card.id ? 'is-dragging' : ''} ${dropTargetId === card.id ? 'is-drop-target' : ''}`}
              style={{ '--scrapbook-tilt': `${CARD_TILTS[card.id - 1] * .55}deg`, '--scrapbook-delay': `${Math.min(index, 8) * 55}ms` }}
              onDragEnter={() => { if (draggingId && draggingId !== card.id) setDropTargetId(card.id) }}
              onDragOver={(event) => { if (draggingId && draggingId !== card.id) event.preventDefault() }}
              onDrop={(event) => {
                event.preventDefault()
                const sourceId = Number(event.dataTransfer.getData('text/plain')) || draggingId
                moveCard(sourceId, card.id)
                resetDrag()
              }}
            >
              <button
                type="button"
                className="scrapbook-card"
                onClick={(event) => onOpenCard(card.id, event.currentTarget)}
                aria-label={`Review ${card.title}`}
              >
                <span className="scrapbook-card-category">{card.label}</span>
                <CardIcon id={card.id} />
                <strong>{card.title}</strong>
                <span className="scrapbook-card-question">{card.provocation}</span>
                <span className="scrapbook-card-response">{notes[card.id]?.note}</span>
              </button>
              <button
                type="button"
                className="scrapbook-drag-grip"
                draggable="true"
                aria-label={`Move ${card.title}. Use the arrow keys to change its position.`}
                aria-describedby="scrapbook-reorder-instructions"
                onDragStart={(event) => {
                  event.stopPropagation()
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', String(card.id))
                  setDraggingId(card.id)
                }}
                onDragEnd={resetDrag}
                onPointerDown={(event) => startPointerDrag(event, card.id)}
                onPointerMove={updatePointerDrag}
                onPointerUp={finishPointerDrag}
                onPointerCancel={resetDrag}
                onKeyDown={(event) => moveWithKeyboard(event, card.id, index)}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <circle cx="6" cy="5" r="1" /><circle cx="14" cy="5" r="1" />
                  <circle cx="6" cy="10" r="1" /><circle cx="14" cy="10" r="1" />
                  <circle cx="6" cy="15" r="1" /><circle cx="14" cy="15" r="1" />
                </svg>
              </button>
            </article>
          ))}
        </div>
      </div>
      <span className="sr-only" role="status" aria-live="polite">{reorderMessage}</span>
    </section>
  )
}

function OriginalNote({ idea, compact = false, scrapbook = false }) {
  return (
    <aside className={`original-note ${compact ? 'compact' : ''} ${scrapbook ? 'scrapbook-origin' : ''}`}>
      <span>Starting idea</span>
      <p>{idea}</p>
      <i aria-hidden="true" />
    </aside>
  )
}

function Tabletop({ session, update, activeCard: activeState, savedCards, openCard: openActiveCard, closeCard, setActiveCard, copyFeedback, onCopyIdea }) {
  const canvasRef = useRef(null)
  const deckRef = useRef(null)
  const modalRef = useRef(null)
  const sparkRequestsRef = useRef(new Set())
  const [sparkStates, setSparkStates] = useState({})
  const [tableScrolled, setTableScrolled] = useState(false)
  const [dragOverDeck, setDragOverDeck] = useState(false)
  const [mobileRearranging, setMobileRearranging] = useState(false)
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
  const activeCard = CARDS.find((card) => card.id === activeState?.cardId)
  const activeMode = activeState?.mode
  const reviewIndex = activeMode === 'review' ? savedCards.findIndex((card) => card.id === activeCard?.id) : -1
  const previousSavedCard = reviewIndex > 0 ? savedCards[reviewIndex - 1] : null
  const nextSavedCard = reviewIndex >= 0 && reviewIndex < savedCards.length - 1 ? savedCards[reviewIndex + 1] : null

  useEffect(() => {
    if (!activeCard) return undefined
    const previousOverflow = document.body.style.overflow
    const viewport = window.visualViewport
    const syncViewport = () => {
      const height = viewport?.height || window.innerHeight
      const offset = viewport?.offsetTop || 0
      document.documentElement.style.setProperty('--workshop-viewport-height', `${height}px`)
      document.documentElement.style.setProperty('--workshop-viewport-offset', `${offset}px`)
    }
    const handleDialogKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeCard()
        return
      }
      if (activeMode === 'review' && event.key === 'ArrowLeft' && previousSavedCard) {
        event.preventDefault()
        setActiveCard({ cardId: previousSavedCard.id, mode: 'review' })
        return
      }
      if (activeMode === 'review' && event.key === 'ArrowRight' && nextSavedCard) {
        event.preventDefault()
        setActiveCard({ cardId: nextSavedCard.id, mode: 'review' })
        return
      }
      if (event.key !== 'Tab') return
      const focusable = [...(modalRef.current?.querySelectorAll('button:not(:disabled), textarea, [href], [tabindex]:not([tabindex="-1"])') || [])]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    syncViewport()
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleDialogKey)
    window.addEventListener('resize', syncViewport)
    viewport?.addEventListener('resize', syncViewport)
    viewport?.addEventListener('scroll', syncViewport)
    return () => {
      document.body.style.overflow = previousOverflow
      document.documentElement.style.removeProperty('--workshop-viewport-height')
      document.documentElement.style.removeProperty('--workshop-viewport-offset')
      window.removeEventListener('keydown', handleDialogKey)
      window.removeEventListener('resize', syncViewport)
      viewport?.removeEventListener('resize', syncViewport)
      viewport?.removeEventListener('scroll', syncViewport)
    }
  }, [activeCard, activeMode, previousSavedCard, nextSavedCard, closeCard, setActiveCard])

  useEffect(() => {
    if (activeMode !== 'review') return undefined
    const focusTimer = window.setTimeout(() => modalRef.current?.querySelector('.saved-review-close')?.focus({ preventScroll: true }), 420)
    return () => window.clearTimeout(focusTimer)
  }, [activeCard?.id, activeMode])

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
    window.setTimeout(() => {
      setDealFlight((current) => current?.id === pending.id ? null : current)
      if (window.matchMedia?.(COMPACT_TABLE_QUERY).matches) {
        canvasRef.current?.querySelector(`[data-card-id="${pending.id}"]`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest',
        })
      }
    }, duration)
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

  function reorderCard(cardId, targetId) {
    if (!targetId || targetId === cardId) return
    const nextIds = [...dealtCardIds]
    const fromIndex = nextIds.indexOf(cardId)
    const toIndex = nextIds.indexOf(targetId)
    if (fromIndex < 0 || toIndex < 0) return
    nextIds.splice(fromIndex, 1)
    nextIds.splice(toIndex, 0, cardId)
    update({ dealtCardIds: nextIds })
  }

  async function ensureSparks(card, force = false) {
    const existing = sparkStates[card.id]
    if (sparkRequestsRef.current.has(card.id) || (!force && (existing?.loading || existing?.sparks?.length))) return
    sparkRequestsRef.current.add(card.id)
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
    } finally {
      sparkRequestsRef.current.delete(card.id)
    }
  }

  useEffect(() => {
    if (activeCard && activeMode === 'edit') ensureSparks(activeCard)
  }, [activeCard?.id, activeMode])

  function openCard(card, trigger) {
    if (coachStep !== 'complete') {
      setCoachStep('complete')
      try { localStorage.setItem('change-cards-onboarding-v2', 'complete') } catch { /* onboarding persistence is optional */ }
    }
    const mode = notes[card.id]?.visited ? 'review' : 'edit'
    openActiveCard(card.id, mode, trigger)
    if (mode === 'edit') ensureSparks(card)
  }

  function saveNote(card, note) {
    const cleanNote = note.trim()
    if (!cleanNote) return
    if (import.meta.env.DEV) console.info('[change-cards:save]', { stage: 'commit', cardId: card.id, noteLength: cleanNote.length })
    update({
      swarm: {
        ...notes,
        [card.id]: { note: cleanNote, visited: true, updatedAt: Date.now() },
      },
    })
    setSparkStates({})
    closeCard()
  }

  return (
    <section
      className={`tabletop ${mobileRearranging ? 'is-rearranging' : ''} ${tableScrolled ? 'has-scrolled' : ''}`}
      aria-label="Change Cards idea table"
      onScroll={(event) => setTableScrolled(event.currentTarget.scrollTop > 32)}
    >
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
            <span><strong><span className="tap-label">Tap the deck</span><span className="click-label">Click the deck</span></strong><small>to deal a card</small></span>
          </div>
        )}
        {(dragOverDeck || !remainingCards.length) && <p>{dragOverDeck ? 'Drop to return it' : 'All cards dealt'}</p>}
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
              previousCardId={dealtCardIds[index - 1]}
              nextCardId={dealtCardIds[index + 1]}
              canvasRef={canvasRef}
              position={cardPositions[card.id] || defaultPosition(index)}
              isDealing={dealFlight?.id === card.id}
              visited={Boolean(notes[card.id]?.visited)}
              savedNote={notes[card.id]?.note || ''}
              onMove={(position) => moveCard(card.id, position)}
              onReorder={(targetId) => reorderCard(card.id, targetId)}
              deckRef={deckRef}
              onReturn={() => returnCard(card.id)}
              onDeckTarget={setDragOverDeck}
              onMobileDragStart={() => setMobileRearranging(true)}
              onMobileDragEnd={() => setMobileRearranging(false)}
              onOpen={(trigger) => openCard(card, trigger)}
              onWarm={() => { if (!notes[card.id]?.visited) ensureSparks(card) }}
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
        <div
          ref={modalRef}
          className={`active-card-layer is-${activeMode}`}
          role="dialog"
          aria-modal="true"
          aria-label={activeMode === 'review' ? undefined : `Edit idea with ${activeCard.title}`}
          aria-labelledby={activeMode === 'review' ? `saved-review-title-${activeCard.id}` : undefined}
        >
          <button className="active-card-scrim" tabIndex={-1} onClick={closeCard} aria-label={activeMode === 'review' ? 'Close saved idea' : 'Close card'} />
          <div className={`active-card-wrap ${activeMode === 'review' ? 'is-reviewing' : 'is-editing'}`}>
            {activeMode === 'review' ? (
              <SavedIdeaViewer
                card={activeCard}
                note={notes[activeCard.id]?.note || ''}
                index={reviewIndex}
                count={savedCards.length}
                previousCard={previousSavedCard}
                nextCard={nextSavedCard}
                copied={copyFeedback.key === `card-${activeCard.id}`}
                onCopy={() => onCopyIdea(activeCard, notes[activeCard.id]?.note || '')}
                onEdit={() => setActiveCard({ cardId: activeCard.id, mode: 'edit' })}
                onClose={closeCard}
                onPrevious={() => previousSavedCard && setActiveCard({ cardId: previousSavedCard.id, mode: 'review' })}
                onNext={() => nextSavedCard && setActiveCard({ cardId: nextSavedCard.id, mode: 'review' })}
              />
            ) : (
              <ChangeCard card={activeCard} selected>
                <GenerationSurface
                  card={activeCard}
                  initialValue={notes[activeCard.id]?.note || ''}
                  submitLabel="Save idea"
                  sparkState={sparkStates[activeCard.id]}
                  onSubmit={(response) => saveNote(activeCard, response)}
                  onRetry={() => ensureSparks(activeCard, true)}
                  onClose={closeCard}
                />
              </ChangeCard>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

function DraggableTableCard({ card, index, previousCardId, nextCardId, canvasRef, deckRef, position, isDealing, visited, savedNote, onMove, onReorder, onReturn, onDeckTarget, onMobileDragStart, onMobileDragEnd, onOpen, onWarm, showCoachmark }) {
  const [localPosition, setLocalPosition] = useState(position)
  const [mobileDragOffset, setMobileDragOffset] = useState({ x: 0, y: 0 })
  const [mobileDragging, setMobileDragging] = useState(false)
  const drag = useRef(null)
  const mobileDrag = useRef(null)
  const mobileAutoScroll = useRef(null)
  const mobileAutoScrollSpeed = useRef(0)
  const mobileDropTarget = useRef(null)
  const dragged = useRef(false)
  const pointerActivated = useRef(false)
  const overDeck = useRef(false)

  useEffect(() => setLocalPosition(position), [position.x, position.y])

  useEffect(() => () => {
    if (mobileAutoScroll.current) window.cancelAnimationFrame(mobileAutoScroll.current)
    mobileDropTarget.current?.classList.remove('is-mobile-drop-target')
  }, [])

  function pointerDown(event) {
    if (event.button !== 0) return
    // Touch is for tapping and scrolling. Freeform table dragging remains a
    // desktop interaction so a small finger wobble can never swallow a tap.
    if (event.pointerType !== 'mouse' || window.matchMedia?.(COMPACT_TABLE_QUERY).matches) return
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
      onOpen(event.currentTarget.querySelector('.card-face'))
    }
    dragged.current = false
  }

  function select(event) {
    if (pointerActivated.current) {
      pointerActivated.current = false
      return
    }
    if (dragged.current) {
      dragged.current = false
      return
    }
    onOpen(event?.currentTarget)
  }

  function syncMobileDragOffset() {
    const current = mobileDrag.current
    if (!current) return
    const scrollDelta = current.scrollContainer.scrollTop - current.startScrollTop
    setMobileDragOffset({
      x: current.clientX - current.startX,
      y: current.clientY - current.startY + scrollDelta,
    })
  }

  function runMobileAutoScroll() {
    if (mobileAutoScroll.current || !mobileDrag.current || !mobileAutoScrollSpeed.current) return
    const tick = () => {
      const current = mobileDrag.current
      const speed = mobileAutoScrollSpeed.current
      if (!current || !speed) {
        mobileAutoScroll.current = null
        return
      }
      current.scrollContainer.scrollBy(0, speed)
      syncMobileDragOffset()
      mobileAutoScroll.current = window.requestAnimationFrame(tick)
    }
    mobileAutoScroll.current = window.requestAnimationFrame(tick)
  }

  function stopMobileAutoScroll() {
    mobileAutoScrollSpeed.current = 0
    if (mobileAutoScroll.current) window.cancelAnimationFrame(mobileAutoScroll.current)
    mobileAutoScroll.current = null
  }

  function mobilePointerDown(event) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const scrollContainer = canvasRef.current?.closest('.tabletop')
    if (!scrollContainer) return
    mobileDrag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
      startScrollTop: scrollContainer.scrollTop,
      scrollContainer,
      activated: false,
    }
    setMobileDragOffset({ x: 0, y: 0 })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function mobileHandleKeyDown(event) {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      event.stopPropagation()
      onReturn()
      return
    }
    const targetId = (event.key === 'ArrowLeft' || event.key === 'ArrowUp') ? previousCardId
      : (event.key === 'ArrowRight' || event.key === 'ArrowDown') ? nextCardId
        : null
    if (!targetId) return
    event.preventDefault()
    event.stopPropagation()
    onReorder(targetId)
  }

  function mobilePointerMove(event) {
    const current = mobileDrag.current
    if (!current || current.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    current.clientX = event.clientX
    current.clientY = event.clientY
    if (!current.activated) {
      if (Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 7) return
      current.activated = true
      setMobileDragging(true)
      onMobileDragStart()
    }
    syncMobileDragOffset()

    const deck = deckRef.current?.getBoundingClientRect()
    const insideDeck = Boolean(deck && event.clientX >= deck.left - 14 && event.clientX <= deck.right + 14 && event.clientY >= deck.top - 14 && event.clientY <= deck.bottom + 14)
    if (insideDeck !== overDeck.current) {
      overDeck.current = insideDeck
      onDeckTarget(insideDeck)
    }

    const nextDropTarget = insideDeck ? null : document.elementsFromPoint(event.clientX, event.clientY)
      .map((element) => element.closest?.('.table-card-shell'))
      .find((element) => element && element.dataset.cardId !== String(card.id) && !element.classList.contains('deal-flight-card'))
    if (nextDropTarget !== mobileDropTarget.current) {
      mobileDropTarget.current?.classList.remove('is-mobile-drop-target')
      nextDropTarget?.classList.add('is-mobile-drop-target')
      mobileDropTarget.current = nextDropTarget || null
    }

    const edgeSize = Math.min(130, window.innerHeight * 0.18)
    if (event.clientY < 60 + edgeSize) {
      mobileAutoScrollSpeed.current = -Math.max(4, (60 + edgeSize - event.clientY) * 0.12)
    } else if (event.clientY > window.innerHeight - edgeSize) {
      mobileAutoScrollSpeed.current = Math.max(4, (event.clientY - (window.innerHeight - edgeSize)) * 0.12)
    } else {
      stopMobileAutoScroll()
    }
    runMobileAutoScroll()
  }

  function finishMobileDrag(event, cancelled = false) {
    const current = mobileDrag.current
    if (!current || (event && current.pointerId !== event.pointerId)) return
    if (event) {
      event.preventDefault()
      event.stopPropagation()
    }
    stopMobileAutoScroll()
    mobileDropTarget.current?.classList.remove('is-mobile-drop-target')
    mobileDropTarget.current = null

    const clientX = event?.clientX ?? current.clientX
    const clientY = event?.clientY ?? current.clientY
    const deck = deckRef.current?.getBoundingClientRect()
    const releasedOnDeck = Boolean(deck && clientX >= deck.left - 14 && clientX <= deck.right + 14 && clientY >= deck.top - 14 && clientY <= deck.bottom + 14)
    if (!cancelled && current.activated && (overDeck.current || releasedOnDeck)) {
      onReturn()
    } else if (!cancelled && current.activated) {
      let target = document.elementsFromPoint(clientX, clientY)
        .map((element) => element.closest?.('.table-card-shell'))
        .find((element) => element && element.dataset.cardId !== String(card.id) && !element.classList.contains('deal-flight-card'))
      if (!target) {
        target = [...(canvasRef.current?.querySelectorAll('.table-card-shell') || [])]
          .filter((element) => element.dataset.cardId !== String(card.id) && !element.classList.contains('deal-flight-card'))
          .map((element) => {
            const rect = element.getBoundingClientRect()
            return {
              element,
              distance: Math.hypot(clientX - (rect.left + rect.width / 2), clientY - (rect.top + rect.height / 2)),
            }
          })
          .filter(({ distance }) => distance < 180)
          .sort((a, b) => a.distance - b.distance)[0]?.element
      }
      if (target) onReorder(Number(target.dataset.cardId))
    }

    mobileDrag.current = null
    overDeck.current = false
    setMobileDragging(false)
    setMobileDragOffset({ x: 0, y: 0 })
    onDeckTarget(false)
    if (current.activated) onMobileDragEnd()
  }

  return (
    <div
      className={`table-card-shell ${visited ? 'is-visited' : ''} ${isDealing ? 'is-dealing' : ''} ${showCoachmark ? 'has-coachmark' : ''} ${mobileDragging ? 'is-mobile-dragging' : ''}`}
      data-card-id={card.id}
      style={{
        left: `${localPosition.x}%`,
        top: `${localPosition.y}%`,
        '--table-z': index + 2,
        '--mobile-drag-x': `${mobileDragOffset.x}px`,
        '--mobile-drag-y': `${mobileDragOffset.y}px`,
      }}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={() => { drag.current = null; dragged.current = false; pointerActivated.current = false; overDeck.current = false; onDeckTarget(false) }}
      onPointerEnter={onWarm}
    >
      <ChangeCard card={card} index={index} onSelect={select} faceDown={visited} used={visited} savedNote={savedNote} />
      <button
        className="mobile-card-drag-handle"
        type="button"
        aria-label={`Drag ${card.title} to rearrange it or return it to the deck. Arrow keys move it; Delete returns it.`}
        onKeyDown={mobileHandleKeyDown}
        onPointerDown={mobilePointerDown}
        onPointerMove={mobilePointerMove}
        onPointerUp={(event) => finishMobileDrag(event)}
        onPointerCancel={(event) => finishMobileDrag(event, true)}
      >
        <span className="mobile-drag-dots" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>
        <span aria-hidden="true">Drag</span>
      </button>
      {showCoachmark && !visited && (
        <div className="onboarding-hint card-onboarding-hint" role="note">
          <span><strong><span className="tap-label">Tap the card</span><span className="click-label">Click the card</span></strong><small>the grip below moves it</small></span>
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
    </>
  )
}

function ChangeCard({ card, index = 0, selected, disabled, onSelect, children, swarm = false, used = false, faceDown = false, savedNote = '' }) {
  const rotation = CARD_TILTS[(card.id - 1) % CARD_TILTS.length]
  const showingBack = Boolean(selected || faceDown)
  return (
    <article
      className={`change-card category-${card.category} ${selected ? 'is-selected is-flipped' : ''} ${faceDown ? 'is-face-down is-flipped' : ''} ${swarm ? 'swarm-card' : ''} ${used ? 'is-used' : ''}`}
      style={{ '--tilt': `${rotation}deg`, '--deal-delay': `${Math.min(index, 16) * 34}ms` }}
    >
      <div className="card-rotator">
        <button
          className="card-face card-front"
          disabled={disabled}
          tabIndex={showingBack ? -1 : undefined}
          aria-hidden={showingBack || undefined}
          onClick={onSelect}
          title={`${card.title} — ${card.provocation}`}
          aria-label={`${card.title}: ${card.provocation}`}
        >
          <CardArtwork card={card} />
        </button>
        <div className="card-face card-back" aria-hidden={!showingBack || undefined} inert={!showingBack}>
          {children || (
            <button className="used-card-back" tabIndex={showingBack ? undefined : -1} onClick={onSelect} aria-label={`Open ideas from ${card.title}`}>
              <CardIcon id={card.id} />
              {!used && <span>Turn me over</span>}
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

function SavedIdeaViewer({ card, note, index, count, previousCard, nextCard, copied, onCopy, onEdit, onClose, onPrevious, onNext }) {
  const swipeStart = useRef(null)

  const startSwipe = (event) => {
    const touch = event.touches?.[0]
    if (touch) swipeStart.current = { x: touch.clientX, y: touch.clientY }
  }

  const finishSwipe = (event) => {
    const start = swipeStart.current
    const touch = event.changedTouches?.[0]
    swipeStart.current = null
    if (!start || !touch) return
    const deltaX = touch.clientX - start.x
    const deltaY = touch.clientY - start.y
    if (Math.abs(deltaX) < 54 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return
    if (deltaX > 0 && previousCard) onPrevious()
    if (deltaX < 0 && nextCard) onNext()
  }

  return (
    <section className="saved-review" onTouchStart={startSwipe} onTouchEnd={finishSwipe}>
      <button className="saved-review-close" type="button" onClick={onClose} aria-label="Close saved idea">×</button>
      <article className={`saved-review-card category-${card.category}`} data-card-id={card.id}>
        <header className="saved-review-heading">
          <span>{card.label}</span>
          <CardIcon id={card.id} />
          <h2 id={`saved-review-title-${card.id}`}>{card.title}</h2>
        </header>
        <div className="saved-review-question">
          <p>{card.provocation}</p>
        </div>
        <div className="saved-review-idea">
          <p>{note}</p>
        </div>
        <footer className="saved-review-actions">
          <button className={`saved-review-copy ${copied ? 'is-copied' : ''}`} type="button" onClick={onCopy}>
            <CopyIcon copied={copied} />
            <span>{copied ? 'Copied' : 'Copy idea'}</span>
          </button>
          <button className="saved-review-edit" type="button" onClick={onEdit}><span aria-hidden="true">✎</span> Edit idea</button>
        </footer>
      </article>
      <nav className="saved-review-navigation" aria-label="Browse saved ideas">
        <button type="button" onClick={onPrevious} disabled={!previousCard} aria-label={previousCard ? `Previous saved idea: ${previousCard.title}` : 'No previous saved idea'}>←</button>
        <span>{index + 1} of {count}</span>
        <button type="button" onClick={onNext} disabled={!nextCard} aria-label={nextCard ? `Next saved idea: ${nextCard.title}` : 'No next saved idea'}>→</button>
      </nav>
    </section>
  )
}

function GenerationSurface({ card, sparkState, onSubmit, onRetry, onClose, onDraftChange, initialValue = '', submitLabel = 'Save idea', submitting = false }) {
  const [draft, setDraft] = useState(initialValue)
  const [takenSparks, setTakenSparks] = useState([])
  const [sparkIndex, setSparkIndex] = useState(0)
  const [sparkVisible, setSparkVisible] = useState(true)
  const [sparkPaused, setSparkPaused] = useState(false)
  const editorRef = useRef(null)
  const localSubmissionRef = useRef(false)
  const sparks = sparkState?.sparks || []
  const formId = `response-form-${card.id}`

  useEffect(() => {
    if (window.matchMedia?.(COMPACT_TABLE_QUERY).matches) return undefined
    const focusTimer = window.setTimeout(() => editorRef.current?.focus({ preventScroll: true }), 720)
    return () => window.clearTimeout(focusTimer)
  }, [])

  useEffect(() => {
    setDraft(initialValue)
    setTakenSparks([])
    onDraftChange?.(initialValue)
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

  const saveDraft = async () => {
    const latestDraft = editorRef.current?.value ?? draft
    if (!latestDraft.trim() || submitting || localSubmissionRef.current) return
    localSubmissionRef.current = true
    if (import.meta.env.DEV) console.info('[change-cards:save]', { stage: 'activate', cardId: card.id, draftLength: latestDraft.trim().length })
    try {
      await onSubmit(latestDraft)
    } catch { /* the parent surface owns and displays submission errors */ }
    finally { localSubmissionRef.current = false }
  }

  const submit = (event) => {
    event.preventDefault()
    void saveDraft()
  }

  const takeSpark = (spark) => {
    setDraft((current) => {
      const next = `${current.trim()}${current.trim() ? '\n' : ''}${spark} — `
      onDraftChange?.(next)
      return next
    })
    setTakenSparks((current) => current.includes(spark) ? current : [...current, spark])
    window.setTimeout(() => editorRef.current?.focus({ preventScroll: true }), 0)
  }

  return (
    <div className="generation-surface">
      {onClose && <button className="surface-close" type="button" onClick={onClose} aria-label="Close card">×</button>}
      <form id={formId} className="response-workbench" onSubmit={submit}>
        <div className="provocation-copy">
          <p>{card.provocation}</p>
        </div>
        <label className="sr-only" htmlFor={`response-${card.id}`}>Write the next version of your idea</label>
        <div className={`response-editor-shell ${draft ? 'has-writing' : 'is-empty'} ${sparkState?.loading ? 'is-catching' : ''}`}>
          <textarea
            id={`response-${card.id}`}
            ref={editorRef}
            className="response-editor"
            value={draft}
            maxLength={1000}
            onChange={(event) => {
              setDraft(event.target.value)
              onDraftChange?.(event.target.value)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                void saveDraft()
              }
            }}
            placeholder="Type here — one changed detail is enough…"
          />
          <span className="spark-dust" aria-hidden="true">
            {Array.from({ length: 9 }, (_, index) => <i key={index}>✦</i>)}
          </span>
          <div className="editor-spark" aria-label="AI-generated subject-specific writing prompts">
            {sparkState?.loading ? (
              <span className="editor-spark-loading" role="status"><i aria-hidden="true">✦</i> Catching a thought…</span>
            ) : sparkState?.error ? (
              <button className="spark-retry" type="button" onClick={onRetry}>Try another spark ↻</button>
            ) : sparks.length ? (
              <button
                type="button"
                data-spark={sparks[sparkIndex]}
                className={`${sparkVisible ? 'is-visible' : ''} ${takenSparks.includes(sparks[sparkIndex]) ? 'is-taken' : ''}`}
                onFocus={() => setSparkPaused(true)}
                onBlur={() => setSparkPaused(false)}
                onMouseEnter={() => setSparkPaused(true)}
                onMouseLeave={() => setSparkPaused(false)}
                onClick={() => takeSpark(sparks[sparkIndex])}
                aria-label={`Use this spark: ${sparks[sparkIndex]}`}
              >
                <span aria-hidden="true">✦</span>{sparks[sparkIndex]}
              </button>
            ) : null}
          </div>
        </div>
      </form>
      <div className="response-submit-dock">
        <button className={`response-submit ${submitting ? 'is-submitting' : ''}`} type="submit" form={formId} disabled={!draft.trim() || submitting} aria-busy={submitting} data-card-id={card.id}>
          <span>{submitLabel}</span>
          {submitting && <i className="response-submit-dots" aria-hidden="true"><b /><b /><b /></i>}
        </button>
      </div>
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
