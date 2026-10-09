import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import DesignPhase from '../components/DesignPhase.jsx'
import { FeedbackButton } from '../components/Feedback.jsx'
import { readGuides } from '../safari/field-guide.js'
import { CARDS, CATEGORIES, IDEA_EXAMPLES, cardArtwork } from './catalog.js'
import { LEGACY_BOARD_ID, readBoards, readLegacySession, rememberBoard } from './storage.js'
import './landing.css'

const FieldCanvas = lazy(() => import('../safari/field-table/FieldCanvas.jsx'))
const emptyBoard = { cards: [], sources: [], stations: [] }

function resolveBoard(board) {
  const guide = board.kind === 'safari' ? readGuides().safaris.find(item => item.id === board.id) : null
  return { ...emptyBoard, ...board, ...guide, kind: board.kind, defaultStage: 'develop' }
}

function legacyBoard(session) {
  return { ...emptyBoard, id: LEGACY_BOARD_ID, kind: 'develop', defaultStage: 'develop', status: 'complete', challenge: session.idea, generatedAt: new Date().toISOString(), legacy: session }
}

function initialBoard(library, legacy) {
  const id = new URLSearchParams(window.location.search).get('board')
  const board = library.find(item => item.id === id)
  if (board) return resolveBoard(board)
  return id === LEGACY_BOARD_ID && legacy ? legacyBoard(legacy) : null
}

function BoardArtwork({ card }) {
  const art = cardArtwork(card)
  const sprite = art.spriteIndex
  return <span className="dev-entry-artwork" style={{
    '--artwork': `url("${art.src}")`,
    '--artwork-size': sprite === undefined ? 'contain' : '600% 400%',
    '--artwork-position': sprite === undefined ? 'center' : `${(sprite % 6) * 20}% ${Math.floor(sprite / 6) * (100 / 3)}%`,
  }} />
}

const dateLabel = value => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(date)
}

export default function DevelopApp() {
  const [library, setLibrary] = useState(readBoards)
  const [legacy] = useState(readLegacySession)
  const [current, setCurrent] = useState(() => initialBoard(library, legacy))
  const [challenge, setChallenge] = useState('')
  const [exampleIndex, setExampleIndex] = useState(() => Math.floor(Math.random() * IDEA_EXAMPLES.length))
  const [storageError, setStorageError] = useState(library.storageError || '')
  const textarea = useRef(null)
  const hasLegacy = legacy && !library.some(board => board.id === LEGACY_BOARD_ID)

  useEffect(() => { document.title = current ? `${current.challenge.slice(0, 70)} — Change Cards` : 'Change Cards — give your idea some room' }, [current])

  const open = board => {
    const resolved = resolveBoard(board)
    try { setLibrary(rememberBoard(resolved)); setStorageError('') }
    catch { setStorageError('This browser could not save your table. Keep this tab open and export your work before leaving.') }
    window.history.replaceState({}, '', `/develop?board=${encodeURIComponent(resolved.id)}`)
    setCurrent(resolved)
  }

  const home = () => {
    window.history.replaceState({}, '', '/develop')
    setCurrent(null)
    const next = readBoards()
    setLibrary(next)
    if (next.storageError) setStorageError(next.storageError)
  }

  const create = event => {
    event.preventDefault()
    if (!challenge.trim()) return
    open({ ...emptyBoard, id: crypto.randomUUID(), kind: 'develop', defaultStage: 'develop', status: 'complete', challenge: challenge.trim(), generatedAt: new Date().toISOString() })
  }

  const example = () => {
    setChallenge(IDEA_EXAMPLES[exampleIndex])
    setExampleIndex(index => (index + 1) % IDEA_EXAMPLES.length)
    textarea.current?.focus()
  }

  if (current) return <Suspense fallback={<div className="dev-opening" role="status">Opening your table…</div>}>
    <main className="esc-app" aria-label="Change Cards table"><FieldCanvas key={current.id} safari={current} run={{ onHome: home, error: storageError }}/></main>
  </Suspense>

  return <div className="dev-entry">
    <a className="dev-skip" href="#develop-main">Skip to your idea</a>
    <header className="dev-entry-header">
      <a className="dev-entry-brand" href="/develop" aria-label="Change Cards home"><span>CHANGE</span><span>CARDS<i aria-hidden="true">✳</i></span></a>
      <DesignPhase stage="develop" />
    </header>
    <main id="develop-main" className="dev-entry-main">
      <section className="dev-entry-copy" aria-labelledby="develop-heading">
        <h1 id="develop-heading">Give your idea<br/><em>some room.</em></h1>
        <p>Forty ways to think differently.<br/>See what your idea could become.</p>
        <div className="dev-entry-fan" aria-hidden="true">
          {[1, 6, 30].map((id, index) => {
            const card = CARDS.find(item => item.id === id)
            const category = CATEGORIES.find(item => item.id === card.category)
            return <div className={`dev-entry-sample dev-entry-sample-${index}`} key={id} style={{ '--sample-color': category.color }}><span>{category.shortLabel}</span><BoardArtwork card={card}/><strong>{card.title}</strong></div>
          })}
          <span className="dev-entry-scribble">what if…?</span>
        </div>
      </section>
      <section className="dev-entry-workspace" aria-label="Open an idea table">
        <form className="dev-entry-form" onSubmit={create}>
          <label htmlFor="develop-idea">What are you working on?</label>
          <textarea ref={textarea} id="develop-idea" value={challenge} maxLength={1000} onChange={event => setChallenge(event.target.value)} placeholder={IDEA_EXAMPLES[exampleIndex]} rows={4} required />
          <button className="dev-entry-submit" type="submit" disabled={!challenge.trim()}>Open the table <span aria-hidden="true">↗</span></button>
        </form>
        <button className="dev-entry-example" type="button" onClick={example}>Try an example <span aria-hidden="true">✦</span></button>
        {storageError && <p className="dev-entry-error" role="alert">{storageError}</p>}
        {hasLegacy && <button className="dev-legacy-resume" type="button" onClick={() => open(legacyBoard(legacy))}><span><strong>Resume your previous table</strong><small>{legacy.idea}</small></span><span aria-hidden="true">→</span></button>}
        {library.length > 0 && <section className="dev-entry-recents" aria-label="Your saved tables">
          <h2>Pick up a thread <span>{library.length}</span></h2>
          <div>{library.map(board => <button key={board.id} className="dev-entry-recent" onClick={() => open(board)}><span><strong>{board.challenge}</strong><small>{board.kind === 'safari' ? 'Evidence & ideas' : 'Ideas'} · {dateLabel(board.generatedAt)}</small></span><span aria-hidden="true">↗</span></button>)}</div>
        </section>}
      </section>
    </main>
    <footer className="dev-entry-footer">
      <span>A small experiment by <a href="https://jdcasasbuenas.com" target="_blank" rel="noreferrer">Juan David Casasbuenas ↗</a></span>
      <div><details className="dev-entry-privacy"><summary>Privacy</summary><div>
        <p>Your table is saved in this browser. Creating an invite puts a shared copy on Cloudflare; anyone with its edit link can join and change it.</p>
        <p>Sparks send your challenge, selected card and relevant writing or evidence to OpenAI when you request them. Opening a table doesn’t generate AI content.</p>
        <p>Shared boards do not expire automatically. Clear browser data to remove local work, or <a href="https://jdcasasbuenas.com" target="_blank" rel="noreferrer">contact Juan</a> about a shared board. Feedback is stored privately in Supabase and emailed to Juan.</p>
      </div></details><FeedbackButton className="dev-entry-feedback"/></div>
    </footer>
  </div>
}
