import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSync } from '@tldraw/sync'
import { atom, createUserId, defaultBindingUtils, defaultShapeUtils, UserRecordType } from 'tldraw'
import { parseSessionLink } from '../../../shared/safari-session.mjs'
import { CanvasSurface, SAFARI_SHAPES } from '../field-table/FieldCanvas.jsx'
import { boardRequest, readIdentity, rememberSession, saveIdentity, sharedAssets, sharingConfig } from './session-client.js'
import { Icon } from '../primitives.jsx'
import './sharing.css'

const SHAPES = [...defaultShapeUtils, ...SAFARI_SHAPES]
function boardBrand(safari) {
  if (safari?.kind === 'develop') return { name: 'Change Cards', label: 'CHANGE CARDS', home: '/develop', back: 'Back to your tables', loading: 'Bringing everyone’s ideas and notes together.', invitation: 'Try a card, build an idea, make connections. Your view stays your own.' }
  if (!safari || safari.defaultStage === 'develop') return { name: 'Workshop', label: 'WORKSHOP', home: '/develop', back: 'Back to your tables', loading: 'Bringing everyone’s work together.', invitation: 'Follow the evidence, build ideas, make connections. Your view stays your own.' }
  return { name: 'Evidence Safari', label: 'EVIDENCE SAFARI', home: '/safari/', back: 'Back to your safaris', loading: 'Bringing everyone’s notes and finds together.', invitation: 'Explore, add notes, make connections. Your view stays your own.' }
}

export default function SharedSafari() {
  const [loaded, setLoaded] = useState(null), [error, setError] = useState(''), [attempt, setAttempt] = useState(0)
  const [identity, setIdentity] = useState(readIdentity), [name, setName] = useState('')
  const brand = boardBrand(loaded?.safari)
  useEffect(() => { document.title = `${brand.name} — a shared table` }, [brand.name])
  useEffect(() => {
    const controller = new AbortController()
    setError('')
    async function load() {
      try {
        const access = parseSessionLink(location.pathname, location.hash)
        const { server } = await sharingConfig(controller.signal)
        const session = { ...access, server, ready: true }
        const { safari } = await boardRequest(session, '', { signal: controller.signal })
        rememberSession(safari.id, session)
        let handoff = null
        try { handoff = JSON.parse(sessionStorage.getItem(`evidence-safari.handoff:${session.roomId}`)); sessionStorage.removeItem(`evidence-safari.handoff:${session.roomId}`) } catch {}
        setLoaded({ session, safari: { ...safari, cards: [], sources: [], stations: [] }, handoff })
      } catch (err) { if (!controller.signal.aborted) setError(err.message) }
    }
    load()
    return () => controller.abort()
  }, [attempt])
  if (!loaded || error) return <main className="esc-join"><a href={brand.home} className="esc-join-brand">{brand.label} ✳</a><h1>{error ? 'A loose end.' : 'Opening the shared table…'}</h1><p role={error ? 'alert' : 'status'}>{error || brand.loading}</p>{error && <button className="esc-share-primary" onClick={() => setAttempt(value => value + 1)}>Try again</button>}<a href={brand.home}>{brand.back}</a></main>
  if (!identity) return <main className="esc-join"><a href={brand.home} className="esc-join-brand">{brand.label} ✳</a><span className="esc-share-spark" aria-hidden="true">✳</span><h1>There’s room<br/>at the table.</h1><p className="esc-join-question">{loaded.safari.challenge}</p><form onSubmit={event => { event.preventDefault(); setIdentity(saveIdentity(name)) }}><label>Your name<input autoComplete="given-name" value={name} maxLength={40} required placeholder="What should we call you?" onChange={event => setName(event.target.value)}/></label><button className="esc-share-primary" disabled={!name.trim()}>Join the board<Icon name="arrow" size={17}/></button></form><small>{brand.invitation}</small></main>
  return <ConnectedBoard {...loaded} identity={identity} onIdentity={setIdentity}/>
}
function ConnectedBoard({ session, safari, handoff, identity, onIdentity }) {
  const [problem, setProblem] = useState('')
  const [users] = useState(() => ({ currentUser: atom('safari visitor', UserRecordType.create({ id: createUserId(identity.id), name: identity.name, color: identity.color })) }))
  const uri = useCallback(async () => {
    const url = new URL(`${session.server}/rooms/${session.roomId}/connect`)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    try {
      const { ticket } = await boardRequest(session, '/ticket', { method: 'POST', signal: AbortSignal.timeout(10000) })
      setProblem('')
      url.searchParams.set('ticket', ticket)
    } catch (error) {
      setProblem(error instanceof TypeError || error.name === 'TimeoutError' ? '' : error.message)
      // In SDK 5.4.2 a rejected URI promise stalls reconnection. A ticketless
      // upgrade is denied by our server and enters the SDK's normal backoff.
    }
    return url.href
  }, [session])
  const store = useSync({ uri, assets: sharedAssets, users, shapeUtils: SHAPES, bindingUtils: defaultBindingUtils })
  const onNameChange = useCallback(name => {
    const next = saveIdentity(name)
    users.currentUser.set({ ...users.currentUser.get(), name: next.name })
    onIdentity(next)
  }, [users, onIdentity])
  const collaboration = useMemo(() => ({ session, identity, onNameChange, camera: handoff?.camera, stage: handoff?.stage || safari.defaultStage, activeLens: handoff?.activeLens, showInvite: handoff?.openInvite,
    status: store.status === 'synced-remote' ? store.connectionStatus : store.status, problem }), [session, identity, onNameChange, handoff, store.status, store.connectionStatus, problem])
  return <main className="esc-app" aria-label={`Shared ${boardBrand(safari).name} board`}><CanvasSurface safari={safari} store={store} collaboration={collaboration}/></main>
}
