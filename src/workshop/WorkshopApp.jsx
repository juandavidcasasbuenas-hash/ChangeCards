import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import DesignPhase from '../components/DesignPhase.jsx'
import { FeedbackButton } from '../components/Feedback.jsx'
import { CARDS, CATEGORIES, IDEA_EXAMPLES, cardArtwork } from '../develop/catalog.js'
import { LEGACY_BOARD_ID, readBoards, readLegacySession, rememberBoard } from '../develop/storage.js'
import { readGuides, writeGuides } from '../safari/field-guide.js'
import { mergeProgress, mergeSafari } from '../safari/live.js'
import { requestSafari } from '../safari/stream.js'
import { Doodle } from '../safari/primitives.jsx'
import '../develop/landing.css'
import '../safari/safari.css'
import './workshop.css'

let canvasModule
const preloadCanvas = () => canvasModule ||= import('../safari/field-table/FieldCanvas.jsx')
const warmCanvas = () => { void preloadCanvas().catch(() => {}) }
const FieldCanvas = lazy(preloadCanvas)
const EMPTY_BOARD = { cards: [], sources: [], stations: [] }
const phaseForLocation = () => /^\/safari(?:\/|$)/.test(location.pathname) ? 'discover' : 'develop'
const phasePath = phase => phase === 'discover' ? '/safari/' : '/develop'
const dateLabel = value => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(date)
}

function readLibrary() {
  const boards = readBoards(), guides = readGuides()
  const entries = new Map(guides.safaris.map(board => [board.id, { ...board, kind: 'safari' }]))
  for (const board of boards) entries.set(board.id, { ...entries.get(board.id), ...board })
  return { boards: [...entries.values()].sort((a, b) => String(b.generatedAt).localeCompare(String(a.generatedAt))), error: boards.storageError || guides.storageError || '' }
}

function resolveBoard(board, stage) {
  const guide = readGuides().safaris.find(item => item.id === board.id)
  return { ...EMPTY_BOARD, ...board, ...guide, kind: board.kind || 'safari', defaultStage: stage,
    status: board.status === 'researching' ? 'partial' : guide?.status || board.status || 'complete' }
}

function legacyBoard(session) {
  return { ...EMPTY_BOARD, id: LEGACY_BOARD_ID, kind: 'develop', defaultStage: 'develop', status: 'complete', challenge: session.idea, generatedAt: new Date().toISOString(), legacy: session }
}

function boardForLocation(library, legacy) {
  const params = new URLSearchParams(location.search), id = params.get('board') || params.get('safari')
  const board = library.find(item => item.id === id)
  if (board) return resolveBoard(board, phaseForLocation())
  return id === LEGACY_BOARD_ID && legacy ? { ...legacyBoard(legacy), defaultStage: phaseForLocation() } : null
}

function CardArtwork({ card }) {
  const art = cardArtwork(card), sprite = art.spriteIndex
  return <span className="dev-entry-artwork" style={{ '--artwork': `url("${art.src}")`, '--artwork-size': sprite === undefined ? 'contain' : '600% 400%', '--artwork-position': sprite === undefined ? 'center' : `${(sprite % 6) * 20}% ${Math.floor(sprite / 6) * (100 / 3)}%` }}/>
}

function LandingArtwork({ stage }) {
  return <div className="wk-artwork" aria-hidden="true">
    <div className="dev-entry-fan wk-artwork-layer" data-active={stage === 'develop'}>{[1, 6, 30].map((id, i) => {
      const card = CARDS.find(item => item.id === id), category = CATEGORIES.find(item => item.id === card.category)
      return <div className={`dev-entry-sample dev-entry-sample-${i}`} key={id} style={{ '--sample-color': category.color }}><span>{category.shortLabel}</span><CardArtwork card={card}/><strong>{card.title}</strong></div>
    })}<span className="dev-entry-scribble">what if…?</span></div>
    <div className="dev-entry-fan wk-artwork-layer wk-evidence-fan" data-active={stage === 'discover'}>{[['Patterns', '#9cc1d7'], ['Elsewhere', '#c2acd8'], ['People', '#f59883']].map(([lens, color], i) => <div className={`dev-entry-sample dev-entry-sample-${i}`} key={lens} style={{ '--sample-color': color }}><span>Evidence Safari</span><Doodle lens={lens}/><strong>{lens}</strong></div>)}<span className="dev-entry-scribble">oh, that's interesting.</span></div>
  </div>
}

export default function WorkshopApp() {
  const [initial] = useState(() => ({ library: readLibrary(), legacy: readLegacySession() }))
  const [library, setLibrary] = useState(initial.library.boards)
  const [stage, setStage] = useState(phaseForLocation)
  const [current, setCurrent] = useState(() => boardForLocation(initial.library.boards, initial.legacy))
  const [challenge, setChallenge] = useState(() => boardForLocation(initial.library.boards, initial.legacy)?.challenge || '')
  const [exampleIndex, setExampleIndex] = useState(() => Math.floor(Math.random() * IDEA_EXAMPLES.length))
  const [busy, setBusy] = useState(false), [exampleLoading, setExampleLoading] = useState(false)
  const [progress, setProgress] = useState({ stage: 'planning' }), [startedAt, setStartedAt] = useState(0)
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [storageError, setStorageError] = useState(initial.library.error)
  const currentRef = useRef(current), requestRef = useRef(null), exampleRequest = useRef(null), textarea = useRef(null)
  const hasLegacy = initial.legacy && !library.some(board => board.id === LEGACY_BOARD_ID)
  currentRef.current = current

  useEffect(() => { document.title = current ? `${current.challenge.slice(0, 65)} — Change Cards` : 'Change Cards — discover & develop' }, [current])
  useEffect(() => { const timer = setTimeout(() => { preloadCanvas().catch(() => {}) }, 700); return () => clearTimeout(timer) }, [])
  useEffect(() => () => { requestRef.current?.abort(); exampleRequest.current?.abort() }, [])
  useEffect(() => {
    if (!busy) return
    const warn = event => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [busy])

  const persist = useCallback(board => {
    try {
      if (board.kind === 'safari') {
        const guides = readGuides()
        if (guides.storageError) throw Error(guides.storageError)
        writeGuides(mergeSafari(guides, board))
      }
      rememberBoard(board)
      setLibrary(readLibrary().boards)
      setStorageError('')
    } catch { setStorageError('This browser could not save your board. Keep this tab open and export your work before leaving.') }
  }, [])

  const updateCurrent = useCallback(board => { currentRef.current = board; setCurrent(board) }, [])
  const stop = useCallback(() => {
    requestRef.current?.abort(); requestRef.current = null
    exampleRequest.current?.abort(); exampleRequest.current = null
    setBusy(false); setExampleLoading(false)
    const board = currentRef.current
    if (board?.status === 'researching') { const partial = { ...board, status: 'partial' }; updateCurrent(partial); persist(partial) }
  }, [persist, updateCurrent])

  useEffect(() => {
    const restore = () => {
      stop()
      const nextLibrary = readLibrary(), next = boardForLocation(nextLibrary.boards, initial.legacy)
      setStage(phaseForLocation()); setLibrary(nextLibrary.boards); updateCurrent(next)
      if (next) setChallenge(next.challenge)
      setError(''); setNotice('')
    }
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [initial.legacy, stop, updateCurrent])

  const onPhaseChange = useCallback(next => {
    if (!['discover', 'develop'].includes(next) || !currentRef.current) return
    const board = { ...currentRef.current, defaultStage: next }
    setStage(next); updateCurrent(board); persist(board)
    // A phase is a view of this board, not another board or a new history step.
    // Refresh restores that view while Back still returns to the landing page.
    history.replaceState(history.state, '', `${phasePath(next)}?board=${encodeURIComponent(board.id)}`)
  }, [persist, updateCurrent])

  const changeStage = next => {
    if (next === stage) return
    exampleRequest.current?.abort(); exampleRequest.current = null; setExampleLoading(false)
    setStage(next); setError(''); setNotice('')
    history.pushState({}, '', phasePath(next))
  }
  const goHome = (nextStage = stage) => {
    stop(); setStage(nextStage); updateCurrent(null); setError(''); setNotice('')
    setLibrary(readLibrary().boards)
    history.pushState({}, '', phasePath(nextStage))
  }
  const open = (board, phase = stage) => {
    preloadCanvas().catch(() => {})
    const resolved = resolveBoard(board, phase)
    persist(resolved); updateCurrent(resolved); setChallenge(resolved.challenge); setStage(phase); setError(''); setNotice('')
    history.pushState({}, '', `${phasePath(phase)}?board=${encodeURIComponent(resolved.id)}`)
  }

  const start = async event => {
    event.preventDefault()
    if (busy || exampleLoading || !challenge.trim() || (stage === 'discover' && challenge.trim().length < 8)) return
    const board = { ...EMPTY_BOARD, id: crypto.randomUUID(), kind: stage === 'develop' ? 'develop' : 'safari', defaultStage: stage,
      status: stage === 'develop' ? 'complete' : 'researching', challenge: challenge.trim(), generatedAt: new Date().toISOString() }
    preloadCanvas().catch(() => {})
    persist(board); updateCurrent(board); setError(''); setNotice('')
    history.pushState({}, '', `${phasePath(stage)}?board=${encodeURIComponent(board.id)}`)
    if (stage === 'develop') return
    const controller = new AbortController(); requestRef.current = controller
    setBusy(true); setProgress({ stage: 'planning', updatedAt: Date.now() }); setStartedAt(Date.now())
    let latest = board, received = false
    try {
      await requestSafari(board.challenge, { signal: controller.signal, onEvent: event => {
        if (controller.signal.aborted || requestRef.current !== controller) return
        if (event.type === 'progress') setProgress(previous => mergeProgress(previous, event))
        if (event.type === 'evidence' || event.type === 'result') {
          received ||= event.type === 'result'
          // The client board's identity never changes as research arrives. Native
          // shapes, the camera and any writing made while waiting stay in place.
          latest = { ...latest, ...event.safari, id: board.id, researchId: event.safari.id, kind: 'safari', defaultStage: currentRef.current?.defaultStage || 'discover' }
          updateCurrent(latest); persist(latest)
        }
        if (event.type === 'done') { latest = { ...latest, defaultStage: currentRef.current?.defaultStage || latest.defaultStage, cost: event.cost, timing: event.timing }; updateCurrent(latest); persist(latest) }
        if (event.type === 'completion_interrupted') setNotice('Your evidence is ready. The final usage report did not arrive.')
      } })
    } catch (err) {
      if (!controller.signal.aborted) {
        latest = { ...latest, defaultStage: currentRef.current?.defaultStage || latest.defaultStage, status: received ? latest.status : 'partial' }; updateCurrent(latest); persist(latest)
        if (received) setNotice('Your evidence is ready. The final usage report did not arrive.')
        else setError(latest.cards.length ? 'The search stopped early. The checked evidence on your board is saved.' : err.message)
      }
    } finally { if (requestRef.current === controller) { setBusy(false); requestRef.current = null } }
  }

  const tryExample = async () => {
    if (busy || exampleLoading) return
    if (stage === 'develop') { setChallenge(IDEA_EXAMPLES[exampleIndex]); setExampleIndex(index => (index + 1) % IDEA_EXAMPLES.length); textarea.current?.focus(); return }
    const controller = new AbortController(); exampleRequest.current = controller
    setExampleLoading(true); setError(''); warmCanvas()
    try {
      const response = await fetch('/safari/example/workshop.json', { signal: controller.signal })
      if (!response.ok) throw Error('The example could not load. Please try again.')
      const data = await response.json()
      if (!controller.signal.aborted && exampleRequest.current === controller) open({ ...data, kind: 'safari' }, 'discover')
    } catch (err) { if (!controller.signal.aborted) setError(err.message) } finally { if (exampleRequest.current === controller) { exampleRequest.current = null; setExampleLoading(false) } }
  }

  if (current) return <main className="esc-app wk-canvas" aria-label="Discover and Develop board"><Suspense fallback={<div className="wk-canvas-opening" role="status"><DesignPhase stage={current.defaultStage}/><span>Opening your board…</span></div>}>
    <FieldCanvas key={current.id} safari={current} run={{ busy, progress, startedAt, error: error || storageError, notice, onHome: goHome, onPhaseChange, onStop: () => { stop(); setNotice('Research stopped. Your board is still here.') } }}/>
  </Suspense></main>

  return <div className="dev-entry wk-entry" data-stage={stage}>
    <a className="dev-skip" href="#workshop-main">Skip to your challenge</a>
    <header className="dev-entry-header">
      <a className="dev-entry-brand" href="/develop" onClick={event => { event.preventDefault(); changeStage('develop') }} aria-label="Change Cards home"><span>CHANGE</span><span>CARDS<i aria-hidden="true">✳</i></span></a>
      <DesignPhase stage={stage} onChange={changeStage}/>
    </header>
    <main id="workshop-main" className="dev-entry-main">
      <section className="dev-entry-copy" aria-label={stage === 'discover' ? 'Evidence Safari' : 'Change Cards'}>
        <div className="wk-hero-copy">
          <div className="wk-copy-layer" data-active={stage === 'develop'} aria-hidden={stage !== 'develop'}><span className="wk-eyebrow">Change Cards · Develop</span><h1>Give your idea<br/><em>some room.</em></h1><p>Forty ways to think differently.<br/>See what your idea could become.</p></div>
          <div className="wk-copy-layer" data-active={stage === 'discover'} aria-hidden={stage !== 'discover'}><span className="wk-eyebrow">Evidence Safari · Discover</span><h1>Follow a<br/><em>loose thread.</em></h1><p>Small findings. Different worlds.<br/>See what connects.</p></div>
        </div>
        <LandingArtwork stage={stage}/>
      </section>
      <section className="dev-entry-workspace" aria-label="Start with your challenge">
        <form className="dev-entry-form" onSubmit={start}>
          <label htmlFor="workshop-challenge">What are you working on?</label>
          <textarea ref={textarea} id="workshop-challenge" value={challenge} maxLength={1200} minLength={stage === 'discover' ? 8 : undefined} onFocus={warmCanvas} onChange={event => setChallenge(event.target.value)} placeholder="How might we…" rows={4} required/>
          <button className="dev-entry-submit" type="submit" disabled={exampleLoading || !challenge.trim() || (stage === 'discover' && challenge.trim().length < 8)} onPointerEnter={warmCanvas}><span>{stage === 'discover' ? 'Go on a safari' : 'Open the table'}</span><span aria-hidden="true">↗</span></button>
        </form>
        <div className="wk-example-line"><button className="dev-entry-example" type="button" onClick={tryExample} disabled={exampleLoading} onPointerEnter={warmCanvas}>{exampleLoading ? 'Opening example…' : 'Try an example'} <span aria-hidden="true">✦</span></button><small>{stage === 'discover' ? 'A ready-made trail, no waiting.' : 'A little nudge to get started.'}</small></div>
        {(error || storageError) && <p className="dev-entry-error" role="alert">{error || storageError}</p>}
        {hasLegacy && <button className="dev-legacy-resume" type="button" onClick={() => open(legacyBoard(initial.legacy), 'develop')}><span><strong>Resume your previous table</strong><small>{initial.legacy.idea}</small></span><span aria-hidden="true">→</span></button>}
        {library.length > 0 && <section className="dev-entry-recents" aria-label="Your saved boards"><h2>Pick up a thread <span>{library.length}</span></h2><div>{library.map(board => <button key={board.id} className="dev-entry-recent" onClick={() => open(board)} onPointerEnter={warmCanvas}><span><strong>{board.challenge}</strong><small>{board.kind === 'safari' ? 'Evidence & ideas' : 'Ideas'} · {dateLabel(board.generatedAt)}</small></span><span aria-hidden="true">↗</span></button>)}</div></section>}
      </section>
    </main>
    <footer className="dev-entry-footer"><span>A small experiment by <a href="https://jdcasasbuenas.com" target="_blank" rel="noreferrer">Juan David Casasbuenas ↗</a></span><div><details className="dev-entry-privacy"><summary>Privacy</summary><div>
      <p>Your board is saved in this browser. Creating an invite puts a shared copy on Cloudflare; anyone with its edit link can join and change it.</p>
      <p>Starting a Safari sends your challenge to research services. Sparks send the selected card and relevant writing or evidence to OpenAI when you request them. Browsing your board makes no AI calls.</p>
      <p>Shared boards do not expire automatically. Clear browser data to remove local work, or <a href="https://jdcasasbuenas.com" target="_blank" rel="noreferrer">contact Juan</a> about a shared board. Feedback is stored privately in Supabase and emailed to Juan.</p>
    </div></details><FeedbackButton className="dev-entry-feedback"/></div></footer>
  </div>
}
