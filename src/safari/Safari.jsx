import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { readGuides, writeGuides, cardMarkdown, guideMarkdown, copyText, downloadGuide } from './field-guide.js'
import { requestSafari } from './stream.js'
import { LENSES, LENS_COPY, lensClass, chooseFinding, formatDuration } from './discovery.js'
import { Doodle, Icon, Modal } from './primitives.jsx'
import DesignPhase from '../components/DesignPhase.jsx'
import EvidenceFind from './EvidenceFind.jsx'
import ResearchWait from './ResearchWait.jsx'
import FieldGuide, { PrintGuide } from './FieldGuide.jsx'
import './safari.css'
import { mergeSafari, mergeProgress } from './live.js'

const FieldCanvas = lazy(() => import('./field-table/FieldCanvas.jsx'))

const TILTS = [-5, 3, -3, 4, -4, 4]
const date = value => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(value))

export default function Safari() {
  const [library, setLibrary] = useState(readGuides)
  const [challenge, setChallenge] = useState('')
  const [view, setView] = useState('home')
  const [activeId, setActiveId] = useState(null)
  const [modal, setModal] = useState(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState({ stage: 'planning' })
  const [startedAt, setStartedAt] = useState(0)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [printCards, setPrintCards] = useState(null)
  const [storageError, setStorageError] = useState(library.storageError || '')
  const request = useRef(null), firstSave = useRef(true)
  const safari = library.safaris.find(s => s.id === library.currentId)
  const saved = safari?.cards.filter(c => safari.savedIds?.includes(c.id)) || []
  const seen = (safari?.seenIds || []).filter(id => safari.cards.some(c => c.id === id))
  const active = safari?.cards.find(c => c.id === activeId)
  const sourceFor = card => safari?.sources.find(s => s.id === card.sourceId)

  useEffect(() => { document.title = 'Evidence Safari — follow a loose thread' }, [])
  useEffect(() => {
    if (firstSave.current) { firstSave.current = false; return }
    try { writeGuides(library) } catch { setStorageError('Browser storage is full or unavailable. Copy or download your field guide to keep it.') }
  }, [library])
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer) } }, [toast])
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [view])
  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => {
    if (!printCards) return
    const done = () => setPrintCards(null)
    window.addEventListener('afterprint', done)
    const timer = setTimeout(() => window.print(), 100)
    return () => { clearTimeout(timer); window.removeEventListener('afterprint', done) }
  }, [printCards])

  const updateSafari = (id, update) => setLibrary(old => ({ ...old, safaris: old.safaris.map(s => s.id === id ? { ...s, ...update(s) } : s) }))
  const addSafari = (data, destination = 'board') => {
    setLibrary(old => mergeSafari(old, data))
    setActiveId(null); setModal(null); setView(destination)
  }
  const openFind = card => {
    if (!card) return
    updateSafari(safari.id, s => ({ seenIds: [...new Set([...(s.seenIds || []), card.id])] }))
    setModal(null); setActiveId(card.id); setToast('')
  }
  const draw = options => openFind(chooseFinding(safari.cards, seen, options))
  const copy = async text => { try { await copyText(text); setToast('Copied with references') } catch (err) { setToast(err.message) } }
  const toggleSave = card => updateSafari(safari.id, s => ({ savedIds: s.savedIds?.includes(card.id) ? s.savedIds.filter(id => id !== card.id) : [...(s.savedIds || []), card.id] }))
  const stopResearch = () => {
    request.current?.abort(); request.current = null; setBusy(false)
    if (safari?.status === 'researching') {
      if (safari.cards.length) updateSafari(safari.id, () => ({ status: 'partial' }))
      else setLibrary(old => ({ ...old, currentId: old.currentId === safari.id ? null : old.currentId, safaris: old.safaris.filter(s => s.id !== safari.id) }))
    }
  }
  const goHome = () => { stopResearch(); setError(''); setView('home'); setActiveId(null); setModal(null) }
  const start = async event => {
    event?.preventDefault()
    if (busy || challenge.trim().length < 8) return
    const controller = new AbortController(); request.current = controller
    setError(''); setBusy(true); setProgress({ stage: 'planning', updatedAt: Date.now() }); setStartedAt(Date.now()); setView('loading')
    let received = false, revealed = false, runId = null
    try {
      await requestSafari(challenge.trim(), { signal: controller.signal, onEvent: event => {
        if (controller.signal.aborted || request.current !== controller) return
        if (event.type === 'progress') setProgress(old => mergeProgress(old, event))
        if (event.type === 'evidence' || event.type === 'result') {
          received ||= event.type === 'result'; revealed ||= event.safari.cards.length > 0; runId = event.safari.id
          setLibrary(old => mergeSafari(old, { ...event.safari, preferredView: 'canvas' })); setView('canvas')
        }
        if (event.type === 'done') updateSafari(event.safariId, () => ({ cost: event.cost, timing: event.timing }))
        if (event.type === 'completion_interrupted') setToast('Your evidence is ready. The final usage report did not arrive.')
      } })
    } catch (err) {
      if (!controller.signal.aborted) {
        if (received) setToast('Your evidence is ready. The final usage report did not arrive.')
        else if (revealed) { updateSafari(runId, () => ({ status: 'partial' })); setError('The search stopped early. The checked evidence on your table is saved.') }
        else {
          if (runId) setLibrary(old => ({ ...old, safaris: old.safaris.filter(s => s.id !== runId), currentId: old.currentId === runId ? null : old.currentId }))
          setError(err.message); setView('home')
        }
      }
    } finally { if (request.current === controller) { setBusy(false); request.current = null } }
  }
  const example = async () => {
    if (busy) return
    setError(''); setBusy(true)
    try {
      const response = await fetch('/safari/example/workshop.json')
      if (!response.ok) throw Error('The example could not load. You can still create a safari.')
      addSafari(await response.json())
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  const openRecent = id => {
    const destination = library.safaris.find(s => s.id === id)?.preferredView === 'canvas' ? 'canvas' : 'board'
    setLibrary(old => ({ ...old, currentId: id, safaris: old.safaris.map(s => s.id === id && s.status === 'researching' ? { ...s, status: 'partial' } : s) }))
    setActiveId(null); setError(''); setToast(''); setView(destination)
  }
  const exportText = (cards, savedOnly = false) => guideMarkdown(safari, cards, { savedOnly })
  const print = cards => { setPrintCards(cards); setModal(null); setActiveId(null) }

  if (view === 'canvas' && safari) return <Suspense fallback={<div className="sf-canvas-opening" role="status">Opening your field table…</div>}>
    <main className="esc-app" aria-label="Evidence Safari field table"><FieldCanvas key={safari.id} safari={safari}
      run={{ busy, progress, startedAt, error: error || storageError, notice: toast, onStop: safari.cards.length ? stopResearch : goHome, onHome: goHome }}/></main>
  </Suspense>

  return <div className={`sf-app sf-view-${view}`}>
    <a className="sf-skip" href="#safari-main">Skip to content</a>
    <header className="sf-header">
      <button className="sf-brand" onClick={goHome} aria-label="Evidence Safari home"><span>EVIDENCE</span><span>SAFARI<span className="sf-brand-star">✳</span></span></button>
      <DesignPhase stage="discover" />
      <nav aria-label="Safari navigation">
        {view === 'home' ? <a className="sf-text-button sf-change-link" href="/">Change Cards <Icon name="arrow" size={15}/></a> : view === 'board' && <>
          <button className="sf-text-button sf-new" onClick={goHome}><Icon name="plus" size={16}/><span>New safari</span></button>
          <button className="sf-guide-button" onClick={() => setModal('guide')}><Icon name="book" size={19}/><span>Field guide</span><b>{saved.length}</b></button>
        </>}
      </nav>
    </header>
    {storageError && <p className="sf-storage-alert" role="alert">{storageError}</p>}
    <main id="safari-main">
      {view === 'home' && <section className="sf-home">
        <div className="sf-home-copy"><h1>Follow a<br/><em>loose thread.</em></h1><p className="sf-intro">Small findings. Different worlds.<br/>See what connects.</p>
          <div className="sf-home-fan" aria-hidden="true">{['Patterns', 'Elsewhere', 'People'].map((lens, i) => <div key={lens} className={`sf-fan-card ${lensClass(lens)}`} style={{ '--tilt': `${[-15, 7, 22][i]}deg` }}><span>{lens}</span><Doodle lens={lens}/></div>)}<span className="sf-hand-note">oh, that's interesting.</span></div>
        </div>
        <div className="sf-home-right">
          <form className="sf-challenge-form" onSubmit={start}><label htmlFor="sf-challenge">What are you curious about?</label><textarea id="sf-challenge" value={challenge} onChange={event => setChallenge(event.target.value)} placeholder="How might we…" required minLength={8} maxLength={1200} rows={3}/><button type="submit" className="sf-primary" disabled={busy || challenge.trim().length < 8}>Go on a safari <Icon name="arrow"/></button></form>
          {error && <p className="sf-error" role="alert">{error}</p>}
          <button className="sf-example sf-text-button" onClick={example} disabled={busy}>Try an example <span className="example-spark" aria-hidden="true">✦</span></button>
          <p className="sf-example-note">Science communicators & a free design thinking workshop</p>
          <a className="sf-field-table-link" href="/safari/field-table"><Icon name="shuffle" size={19}/><span><strong>Open the canvas field table</strong><small>Pull out evidence, draw connections and think on the page.</small></span><Icon name="arrow" size={17}/></a>
          {library.safaris.length > 0 && <details className="sf-recent"><summary>Pick up a previous trail <span>{library.safaris.length}</span><Icon name="down" size={15}/></summary><div>{library.safaris.map(s => <button key={s.id} onClick={() => openRecent(s.id)}><span>{s.challenge}</span><small>{s.savedIds?.length || 0} kept · {date(s.generatedAt)}</small><Icon name="arrow" size={16}/></button>)}</div></details>}
        </div>
      </section>}

      {view === 'loading' && <ResearchWait progress={progress} challenge={challenge} startedAt={startedAt} onCancel={goHome}/>}

      {view === 'board' && safari && <section className="sf-board">
        <div className="sf-board-heading"><div><p className="sf-eyebrow">{safari.cards.length} little ways to see it differently</p><h1>Let curiosity <em>lead.</em></h1><button className="sf-surprise" onClick={() => draw({})}><Icon name="shuffle" size={19}/>{seen.length === safari.cards.length ? 'Find it again' : 'Surprise me'}<Icon name="arrow" size={19}/></button></div><aside className="sf-challenge-note"><span>The question we came with</span><p>{safari.challenge}</p></aside></div>
        <div className="sf-tabletop" aria-label="Six evidence piles">
          <svg className="sf-wandering-line" viewBox="0 0 1100 540" preserveAspectRatio="none" aria-hidden="true"><path d="M45 130C210-150 335 280 420 120S820-10 1030 150C1240 450 800 570 755 370S430 270 410 425 70 650 58 400"/></svg>
          {LENSES.map((lens, i) => {
            const cards = safari.cards.filter(c => c.lens === lens), found = cards.filter(c => seen.includes(c.id)).length
            return <div className={`sf-pile-wrap ${lensClass(lens)}`} style={{ '--tilt': `${TILTS[i]}deg` }} key={lens}>
              <button className="sf-pile" onClick={() => draw({ lens })} disabled={!cards.length} aria-label={`Explore ${lens}: ${cards.length - found} unseen of ${cards.length} findings`}>
                <span className="sf-pile-number">{String(i + 1).padStart(2, '0')} / {LENS_COPY[lens]}</span><Doodle lens={lens}/><strong>{lens}</strong><span className="sf-pile-bottom"><span>{cards.length ? found === cards.length ? 'All uncovered · revisit' : `${cards.length - found} waiting to be found` : 'An open question'}</span><Icon name="arrow" size={19}/></span>
              </button>
            </div>
          })}
        </div>
        <div className="sf-board-footer"><button className="sf-text-button sf-trail-button" onClick={() => setModal('trail')} disabled={!seen.length}><span className="sf-trail-dots" aria-hidden="true">{LENSES.map(lens => <i key={lens} className={`${lensClass(lens)} ${safari.cards.some(c => c.lens === lens && seen.includes(c.id)) ? 'is-visited' : ''}`}/>)}</span>Your trail <span>{seen.length} / {safari.cards.length}</span></button><div><a className="sf-text-button" href={`/safari/field-table?safari=${encodeURIComponent(safari.id)}`}><Icon name="shuffle" size={15}/>Field table</a><button className="sf-text-button sf-export-button" onClick={() => setModal('export')}><Icon name="download" size={15}/>Export</button><button className="sf-text-button" onClick={() => setModal('curation')}>Behind the finds <Icon name="plus" size={14}/></button></div></div>
        {safari.status !== 'complete' && <p className="sf-partial">Some trails are lighter. We kept the gaps rather than filling them with weak evidence.</p>}
      </section>}
    </main>
    <footer className="sf-site-footer"><span>Evidence Safari</span><span>Follow a thread. Find a new one.</span></footer>
    {toast && !modal && !active && <div className="sf-toast" role="status">{toast}</div>}

    {active && view === 'board' && <EvidenceFind card={active} source={sourceFor(active)} saved={safari.savedIds?.includes(active.id)} onSave={() => toggleSave(active)} onCopy={() => copy(cardMarkdown(active, sourceFor(active), safari.notes?.[active.id]))} onClose={() => setActiveId(null)} onNext={() => draw({ lens: active.lens, currentId: active.id })} onDetour={() => draw({ avoidLens: active.lens, currentId: active.id })} canNext={safari.cards.some(c => c.id !== active.id && c.lens === active.lens)} canDetour={safari.cards.some(c => c.lens !== active.lens)} feedback={toast} index={seen.indexOf(active.id) + 1} total={safari.cards.length}/>}

    {modal === 'guide' && safari && <FieldGuide safari={safari} cards={saved} onClose={() => setModal(null)} onCopy={() => copy(exportText(saved, true))} onDownload={() => downloadGuide(exportText(saved, true), safari.challenge)} onPrint={() => print(saved)} onRemove={toggleSave} onUpdate={patch => updateSafari(safari.id, () => patch)} onReview={openFind} feedback={toast}/>}

    {modal === 'trail' && safari && <Modal title="Your trail so far" className="sf-trail-dialog" onClose={() => setModal(null)}><p className="sf-modal-copy">{seen.length} discoveries. Which one stayed with you?</p><ol className="sf-trail-list">{seen.map((id, i) => { const card = safari.cards.find(c => c.id === id); return <li className={lensClass(card.lens)} key={id}><button onClick={() => openFind(card)}><span className="sf-trail-index">{String(i + 1).padStart(2, '0')}</span><span><small>{card.lens}</small><strong>{card.title}</strong></span>{safari.savedIds?.includes(id) ? <Icon name="star" size={17}/> : <Icon name="arrow" size={17}/>}</button></li> })}</ol></Modal>}

    {modal === 'export' && safari && <Modal title="Take your finds with you" feedback={toast} onClose={() => setModal(null)}><p className="sf-modal-copy">All {safari.cards.length} findings, with context, caveats and references.</p><div className="sf-export-options"><button onClick={() => copy(exportText(safari.cards))}><Icon name="copy"/><span><strong>Copy safari</strong><small>Ready to paste, references included</small></span><Icon name="arrow" size={16}/></button><button onClick={() => downloadGuide(exportText(safari.cards), safari.challenge)}><Icon name="download"/><span><strong>Download Markdown</strong><small>An editable file to make your own</small></span><Icon name="arrow" size={16}/></button><button onClick={() => print(safari.cards)}><Icon name="print"/><span><strong>Print / save PDF</strong><small>A complete reading copy</small></span><Icon name="arrow" size={16}/></button></div></Modal>}

    {modal === 'curation' && safari && <Modal title="Behind the finds" onClose={() => setModal(null)}><div className="sf-curation-copy"><p>Your question sets the direction. Six perspectives widen the search, from lived experience to unlikely analogies.</p><p>This trail draws on <strong>{safari.sources.length} sources across {safari.coverage?.disciplines?.length || 'several'} disciplines</strong>. Automated checks compare findings with retrieved extracts and filter unsupported or repeated claims. Full texts have not been independently verified.</p><p>The connection to your challenge is a hypothesis. The original setting and caveats travel with every finding.</p>{!!safari.gaps?.length && <details><summary>Gaps worth exploring <Icon name="down" size={15}/></summary><ul>{safari.gaps.map((gap, i) => <li key={i}>{gap}</li>)}</ul></details>}{!!safari.assumptions?.length && <details><summary>Context left open <Icon name="down" size={15}/></summary><ul>{safari.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul></details>}{safari.timing && <details className="sf-run-details"><summary>Time & cost <Icon name="down" size={15}/></summary><p>{formatDuration(safari.timing.totalMs)} · estimated API cost <strong>${(safari.cost?.estimatedUsd || 0).toFixed(3)} USD</strong>{safari.cacheHit ? ' · reused cached research' : ''}.</p><p>Category doodles are reused. No images are generated for this safari.</p><small>Provider usage estimate, not a billing receipt.</small></details>}</div></Modal>}
    {printCards && safari && <PrintGuide safari={safari} cards={printCards}/>}
  </div>
}
