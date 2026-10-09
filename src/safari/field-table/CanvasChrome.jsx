import { useEffect, useRef, useState } from 'react'
import { DefaultMainMenu, DefaultMainMenuContent, DefaultStylePanel, useEditor, useValue } from 'tldraw'
import DesignPhase from '../../components/DesignPhase.jsx'
import { cardMarkdown, copyText, downloadGuide } from '../field-guide.js'
import { Doodle, Icon } from '../primitives.jsx'
import { formatDuration, LENSES, LENS_COPY } from '../discovery.js'
import { trailStatus } from '../live.js'
import { canvasFieldNotes } from './canvas-model.js'
import { LENS_COLORS } from './model.js'
import { useSafariCanvas } from './canvas-context.js'
import { addNote, evidenceShapes, ignorePointer, tidyStation, visitStation, wander } from './canvas-actions.js'
import { turnCard } from './card-reading.js'
import Invite from '../collaboration/Invite.jsx'
import { useDevelop } from '../../develop/develop-context.js'
import { developMarkdown, showDevelop, collectDevelopEntries } from '../../develop/canvas-actions.js'
import { CARDS } from '../../develop/catalog.js'
import { FeedbackButton } from '../../components/Feedback.jsx'

function ToolIcon({ name, size = 19 }) {
  const paths = {
    select: 'm5 3 15 9-7 1-4 7Z', hand: 'M8 12V5a2 2 0 0 1 4 0v7-9a2 2 0 0 1 4 0v9-6a2 2 0 0 1 4 0v9c0 5-3 7-7 7-3 0-5-2-7-5l-3-5a2 2 0 0 1 3-2l2 2Z',
    note: 'M4 3h16v12l-6 6H4Zm10 18v-6h6', arrow: 'M4 20 20 4m-9 0h9v9',
    draw: 'm4 16 11-11 4 4L8 20l-5 1Zm11-11 2-2a2 2 0 0 1 3 3l-1 3',
    undo: 'M8 4 3 9l5 5M3 9h11a6 6 0 0 1 0 12', redo: 'm16 4 5 5-5 5m5-5H10a6 6 0 0 0 0 12',
    fit: 'M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6', minus: 'M4 12h16', plus: 'M12 4v16M4 12h16',
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>
}

export function CanvasHeader({ editor }) {
  const { safari, run, activeLens, stage, setStage } = useSafariCanvas()
  const develop = useDevelop()
  const [toast, setToast] = useState('')
  const exportMenu = useRef(null)
  const shapes = useValue('exportable table', () => editor ? evidenceShapes(editor, true) : [], [editor])
  const readonly = useValue('table editing available', () => !editor || editor.getInstanceState().isReadonly, [editor])
  const kept = [...new Map(shapes.filter(shape => shape.meta.safariKept).map(shape => [shape.props.evidence.card.id, shape])).values()]
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer) }, [toast])
  const notes = () => {
    const all = editor.getCurrentPageShapes()
    return canvasFieldNotes(safari, all, all.flatMap(shape => shape.type === 'arrow' ? editor.getBindingsFromShape(shape.id, 'arrow') : [])) + (all.some(shape => shape.type === 'change-card') ? '\n' + developMarkdown(editor, safari.challenge) : '')
  }
  const copy = async (onlyKept = false) => {
    try {
      await copyText(onlyKept ? `# Kept on my evidence safari\n\n${safari.challenge}\n\n${kept.map(shape => cardMarkdown(shape.props.evidence.card, shape.props.evidence.source)).join('\n')}` : notes())
      setToast(onlyKept ? 'Kept finds copied with sources.' : 'Copied with sources and canvas notes.')
    } catch { setToast('Copy unavailable. Download your field notes instead.') }
    exportMenu.current.open = false
  }
  return <header className="esc-header">
    <button className="esc-brand" onClick={() => run?.onHome ? run.onHome() : location.assign(stage === 'develop' ? '/develop' : '/safari/')} aria-label={stage === 'develop' ? 'Change Cards home' : 'Evidence Safari home'}><span>{stage === 'develop' ? 'CHANGE' : 'EVIDENCE'}<br/>{stage === 'develop' ? 'CARDS' : 'SAFARI'}<span className="esc-brand-star">✳</span></span></button>
    <DesignPhase stage={stage} onChange={setStage}/>
    <details className="esc-question"><summary><span><small>The question we came with</small><strong>{safari.challenge}</strong></span><Icon name="down" size={16}/></summary><p>{safari.challenge}</p></details>
    <Invite editor={editor}/>
    <details className="esc-export" ref={exportMenu}><summary aria-label="Export"><Icon name="download" size={16}/><span>Export</span></summary>
      <div className="esc-export-menu"><button disabled={!editor} onClick={() => copy()}>Copy the whole workshop<Icon name="copy" size={16}/></button>
        <button disabled={!kept.length} onClick={() => copy(true)}>Copy kept finds ({kept.length})<Icon name="bookmark" size={16}/></button>
        <button disabled={!editor} onClick={() => { downloadGuide(notes(), safari.challenge); exportMenu.current.open = false }}>Download field notes<Icon name="download" size={16}/></button>
        <hr/>{stage === 'discover' && <button disabled={readonly || run?.busy || activeLens === 'kept'} onClick={() => { tidyStation(editor, activeLens); exportMenu.current.open = false; setToast('Evidence tidied. Undo will put it back.') }}>Tidy {activeLens === 'all' ? 'the evidence' : activeLens}<Icon name="shuffle" size={16}/></button>}
        {stage === 'develop' && <div className="dv-board-actions"><button disabled={readonly} onClick={() => { for (const card of CARDS) if (!collectDevelopEntries(editor).some(shape => shape.props.cardId === card.id)) develop.drawCard(card.id); develop.visit('table'); exportMenu.current.open = false }}>Deal all 40 cards<Icon name="plus" size={16}/></button><button disabled={readonly} onClick={() => { editor.markHistoryStoppingPoint('return-unused'); editor.deleteShapes(collectDevelopEntries(editor).filter(shape => !shape.props.note && !shape.props.draft).map(shape => shape.id)); showDevelop(editor); exportMenu.current.open = false }}>Return unused cards<Icon name="shuffle" size={16}/></button><button onClick={() => { develop.visit('all'); exportMenu.current.open = false }}>See the whole catalogue<Icon name="arrow" size={16}/></button></div>}
        <FeedbackButton/>
        {safari.timing && <small>{formatDuration(safari.timing.totalMs)} · estimated API cost ${(safari.cost?.estimatedUsd || 0).toFixed(3)}</small>}
      </div>
    </details>
    {toast && <div className="esc-toast" role="status">{toast}</div>}
  </header>
}

export function StationNav({ editor }) {
  const { safari, activeLens, setActiveLens, shelf, setShelf, run } = useSafariCanvas()
  const shapes = useValue('station contents', () => editor ? evidenceShapes(editor) : [], [editor])
  const kept = [...new Map(shapes.filter(shape => shape.meta.safariKept).map(shape => [shape.props.evidence.card.id, shape])).values()]
  const visit = lens => { setShelf(false); setActiveLens(lens); if (editor) visitStation(editor, lens) }
  return <div className="esc-explore-bar">
    <nav className="esc-stations" aria-label="Explore evidence stations">
      <button className="esc-overview" aria-pressed={activeLens === 'all' && !shelf} disabled={!editor} onClick={() => visit('all')} title="See the whole table"><ToolIcon name="fit" size={16}/><span>All</span></button>
      {LENSES.map(lens => {
        const count = editor ? new Set(shapes.filter(shape => shape.props.evidence.card.lens === lens).map(shape => shape.props.evidence.card.id)).size : safari.cards.filter(card => card.lens === lens).length
        return <button key={lens} className="esc-station-tab" aria-pressed={activeLens === lens && !shelf} disabled={!editor} onClick={() => visit(lens)} style={{ '--evidence-color': LENS_COLORS[lens] }} title={count ? `${LENS_COPY[lens]} · ${count} findings` : trailStatus(lens, run?.progress, run?.busy)}>
          <Doodle lens={lens}/><span>{lens}</span><b className={!count && run?.busy ? 'is-searching' : ''}>{count || (run?.busy ? '·' : '0')}</b>
        </button>
      })}
    </nav>
    <div className="esc-explore-actions"><button className="esc-kept-button" aria-expanded={shelf} disabled={!editor} onClick={() => setShelf(!shelf)}><Icon name="bookmark" size={16}/><span>Kept</span><b>{kept.length}</b></button>
      <button className="esc-wander" aria-label="Surprise me" disabled={!shapes.length} onClick={() => wander(editor)}><Icon name="shuffle" size={17}/><span>Surprise me</span></button></div>
    {shelf && <section className="esc-kept-panel" aria-label="Kept findings"><header><h2>Worth keeping.</h2><button aria-label="Close kept findings" onClick={() => setShelf(false)}><Icon name="close"/></button></header>
      {kept.length ? <ul>{kept.map(shape => { const { card } = shape.props.evidence; return <li key={card.id}><button onClick={() => turnCard(editor, shape)} style={{ '--evidence-color': LENS_COLORS[card.lens] }}><span>{card.lens}</span><strong>{card.title}</strong><Icon name="arrow" size={17}/></button></li> })}</ul>
        : <p>Keep a finding as you read.<br/>Come back to the ones that stick.</p>}
    </section>}
  </div>
}

export function CanvasProgress() {
  const { safari, run } = useSafariCanvas()
  const editor = useEditor()
  const [now, setNow] = useState(Date.now())
  useEffect(() => { if (!run?.busy) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [run?.busy])
  if (!run?.busy && !run?.error && !run?.notice) return null
  const count = safari.cards.length
  const headline = run.error ? 'Your finds are here to keep.' : !run.busy ? run.notice : count ? `${count} finds on the table. More on the way.` : run.progress?.stage === 'searching' ? 'Following six leads…' : 'Looking for a fresh perspective…'
  return <div className={`esc-progress ${run.busy ? 'is-working' : ''}`} data-research-busy={Boolean(run.busy)} onPointerDown={ignorePointer} onKeyDown={ignorePointer}>
    <div className="esc-progress-copy" role="status" aria-live="polite"><span className="esc-progress-spark" aria-hidden="true">✳</span><strong>{headline}</strong>{run?.error && <p>{run.error}</p>}</div>
    <div className="esc-progress-bottom"><span className="esc-progress-trails" aria-label={`${new Set(safari.cards.map(card => card.lens)).size} of six perspectives on the table`}>{LENSES.map(lens => <i key={lens} title={`${lens}: ${trailStatus(lens, run.progress, run.busy)}`} className={safari.cards.some(card => card.lens === lens) ? 'has-finds' : ''} style={{ '--trail-color': LENS_COLORS[lens] }}/>)}</span>
      {run.busy && <time aria-label="Elapsed time">{formatDuration(Math.max(0, now - run.startedAt))}</time>}
      {count > 0 && run.busy && <button className="esc-latest" onClick={() => { const last = evidenceShapes(editor).at(-1); if (last) turnCard(editor, last) }}>See latest<Icon name="arrow" size={14}/></button>}
      {run.busy && (run.onStop || run.onHome) && <button className="esc-stop" onClick={run.onStop || run.onHome}>{count ? 'Stop here' : 'Cancel'}</button>}
    </div>
  </div>
}

export function CanvasToolbar() {
  const editor = useEditor()
  const { stage } = useSafariCanvas()
  const tool = useValue('active table tool', () => editor.getCurrentToolId(), [editor])
  const readonly = useValue('table is read only', () => editor.getInstanceState().isReadonly, [editor])
  const canUndo = useValue('can undo', () => editor.getCanUndo(), [editor])
  const canRedo = useValue('can redo', () => editor.getCanRedo(), [editor])
  return <div className="esc-tools" role="toolbar" aria-label="Work with your evidence" onPointerDown={ignorePointer}>
    {[['select', 'Move'], ['hand', 'Pan'], ['note', 'Note'], ['arrow', 'Connect'], ['draw', 'Draw']].map(([id, label]) => <button key={id} disabled={readonly && !['select', 'hand'].includes(id)} aria-label={id === 'note' ? 'Add a note' : label} aria-pressed={tool === id} title={label} onClick={() => id === 'note' ? addNote(editor, '', stage) : editor.setCurrentTool(id)}><ToolIcon name={id}/><span>{label}</span></button>)}
    <span className="esc-tool-divider"/>
    <button className="esc-history" disabled={readonly || !canUndo} onClick={() => editor.undo()} aria-label="Undo" title="Undo"><ToolIcon name="undo" size={17}/></button>
    <button className="esc-history esc-redo" disabled={readonly || !canRedo} onClick={() => editor.redo()} aria-label="Redo" title="Redo"><ToolIcon name="redo" size={17}/></button>
    <DefaultMainMenu><DefaultMainMenuContent/></DefaultMainMenu>
  </div>
}

export function CanvasNavigation() {
  const editor = useEditor()
  const { setActiveLens, setShelf, stage } = useSafariCanvas()
  const zoom = useValue('table zoom', () => Math.round(editor.getZoomLevel() * 100), [editor])
  return <div className="esc-navigation" onPointerDown={ignorePointer}>
    <button onClick={() => editor.zoomOut()} aria-label="Zoom out"><ToolIcon name="minus" size={16}/></button><span>{zoom}%</span><button onClick={() => editor.zoomIn()} aria-label="Zoom in"><ToolIcon name="plus" size={16}/></button>
    <button className="esc-home-view" title="Back to the whole table" aria-label="Show the whole table" onClick={() => { setActiveLens('all'); setShelf(false); if (stage === 'develop') showDevelop(editor); else visitStation(editor, 'all') }}><ToolIcon name="fit" size={16}/></button>
  </div>
}

export function CanvasStylePanel(props) {
  const editor = useEditor()
  const needed = useValue('show drawing styles', () => ['draw', 'arrow', 'note', 'text', 'geo'].includes(editor.getCurrentToolId()) || editor.getSelectedShapes().some(shape => !shape.props.evidence && !['safari-station', 'change-card', 'change-station'].includes(shape.type)), [editor])
  return needed ? <DefaultStylePanel {...props}/> : null
}
