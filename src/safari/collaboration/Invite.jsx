import { useEffect, useRef, useState } from 'react'
import { getSnapshot, useValue } from 'tldraw'
import { prepareSharedBoard } from '../../../shared/safari-session.mjs'
import { copyText } from '../field-guide.js'
import { Icon } from '../primitives.jsx'
import { useSafariCanvas } from '../field-table/canvas-context.js'
import { linkFor, newSession, readIdentity, readResponse, rememberedSession, rememberSession, saveIdentity } from './session-client.js'
import './sharing.css'

export default function Invite({ editor }) {
  const { safari, run, collaboration, activeLens } = useSafariCanvas()
  const [open, setOpen] = useState(() => Boolean(collaboration?.showInvite))
  const people = useValue('people at this table', () => editor ? editor.getCollaborators() : [], [editor])
  if (run?.busy || safari.status === 'researching') return null
  return <>
    <button className="esc-invite" disabled={!editor} onClick={() => setOpen(true)} title={collaboration ? 'Invite people to this shared board' : 'Invite someone to this board'}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M19 7v8m-4-4h8"/></svg><span>Invite</span>
      {collaboration && <b className="esc-people-count" aria-label={`${people.length + 1} people on the board`}>{people.length + 1}</b>}
    </button>
    {open && <InviteDialog editor={editor} safari={safari} collaboration={collaboration} activeLens={activeLens} people={people} onClose={() => setOpen(false)}/>}
  </>
}
function InviteDialog({ editor, safari, collaboration, activeLens, people, onClose }) {
  const ref = useRef(null)
  const [name, setName] = useState(() => readIdentity()?.name || '')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [copied, setCopied] = useState(false)
  const [session, setSession] = useState(collaboration?.session || null)
  useEffect(() => { const dialog = ref.current; dialog.showModal(); return () => dialog.close() }, [])
  const create = async event => {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try {
      const board = prepareSharedBoard(safari, getSnapshot(editor.store).document)
      const pending = rememberedSession(safari.id, { pending: true }) || newSession()
      rememberSession(safari.id, pending)
      const result = await readResponse(await fetch('/api/safari/session', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...board, roomId: pending.roomId, key: pending.key }), signal: AbortSignal.timeout(30000) }))
      const created = { ...pending, server: result.server, ready: true }
      rememberSession(safari.id, created); saveIdentity(name); setSession(created)
      try { sessionStorage.setItem(`evidence-safari.handoff:${created.roomId}`, JSON.stringify({ camera: editor.getCamera(), activeLens, openInvite: true })) } catch {}
      location.assign(linkFor(created))
    } catch (err) { setError(err.message); setBusy(false) }
  }
  const copy = async () => {
    try { await copyText(linkFor(session)); setCopied(true); setError('') } catch { setError('Select and copy the link below.') }
  }
  return <dialog ref={ref} className="esc-invite-dialog" aria-labelledby="esc-invite-title" onCancel={event => { if (busy) event.preventDefault(); else onClose() }}
    onClick={event => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <header><span className="esc-share-spark" aria-hidden="true">✳</span><button onClick={onClose} disabled={busy} aria-label="Close invite"><Icon name="close"/></button></header>
    <h2 id="esc-invite-title">A little company<br/>on the safari.</h2>
    <p>{session ? 'Anyone with this link can explore and edit this board.' : 'Bring someone onto this board. Your finds, notes and connections come with you.'}</p>
    {session ? <>
      <label className="esc-invite-link">Invite link<input aria-label="Invite link" readOnly value={linkFor(session)} onFocus={event => event.target.select()}/></label>
      <button className="esc-share-primary" onClick={copy}><Icon name={copied ? 'check' : 'copy'} size={17}/>{copied ? 'Link copied' : 'Copy invite link'}</button>
      {collaboration && <div className="esc-present"><small>At the table</small><ul><li><i style={{ background: collaboration.identity.color }}/>{collaboration.identity.name}<span>you</span></li>{people.map(person => <li key={person.userId}><i style={{ background: person.color }}/>{person.userName || 'Explorer'}</li>)}</ul>
        <label>Your name<input value={name} maxLength={40} onChange={event => { setName(event.target.value); collaboration.onNameChange(event.target.value) }}/></label></div>}
    </> : <form onSubmit={create}>
      <label>Your name<input autoComplete="given-name" placeholder="What should we call you?" value={name} onChange={event => setName(event.target.value)} maxLength={40} required disabled={busy}/></label>
      <button className="esc-share-primary" disabled={busy || !name.trim()}>{busy ? 'Opening the shared board…' : 'Create invite link'}<Icon name="arrow" size={17}/></button>
      <small className="esc-share-footnote">Anyone with the link can edit. Your view stays your own.</small>
    </form>}
    {error && <p className="esc-share-error" role="alert">{error}</p>}
  </dialog>
}
