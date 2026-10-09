import { useCallback, useEffect, useRef, useState } from 'react'
import { useValue } from 'tldraw'
import { requestSafari } from '../safari/stream.js'
import { mergeProgress } from '../safari/live.js'
import { boardRequest } from '../safari/collaboration/session-client.js'

const LEASE_MS = 10 * 60 * 1000
const emptyRun = { busy: false, progress: { stage: 'planning' }, startedAt: 0, error: '', notice: '' }
const available = editor => Boolean(editor && !editor.isDisposed)
const writable = editor => available(editor) && !editor.getInstanceState().isReadonly
const freshLease = (lease, now) => typeof lease?.ownerId === 'string' && Number.isFinite(lease.startedAt) && lease.startedAt > now - LEASE_MS && lease.startedAt <= now + LEASE_MS

// Provider ledgers and extracts can be large. The shared page only needs the
// final status and a few usage numbers; findings keep provenance in their shapes.
function reportFor(data, startedAt) {
  const report = { status: data.status || 'partial', cardCount: data.cards?.length || 0 }
  if (data.generatedAt) report.generatedAt = data.generatedAt
  if (Number.isFinite(data.cost?.estimatedUsd)) report.cost = { estimatedUsd: data.cost.estimatedUsd }
  const timing = Object.fromEntries(Object.entries(data.timing || {}).filter(([, value]) => Number.isFinite(value)).slice(0, 12))
  report.timing = { ...timing, totalMs: timing.totalMs ?? Math.max(0, Date.now() - startedAt) }
  return report
}

export function useDiscoveryResearch({ editor, safari, appendEvidence, seedCanvas, collaboration = null, session = null }) {
  const sharedSession = session || collaboration?.session || null
  const [researchSafari, setResearchSafari] = useState(null)
  const [state, setState] = useState(null)
  const [leaseClock, setLeaseClock] = useState(Date.now)
  const latest = useRef({ editor, safari, appendEvidence, seedCanvas, sharedSession, shared: Boolean(collaboration || session) })
  const request = useRef(null)
  const pendingRelease = useRef(null)
  const mounted = useRef(false)
  latest.current = { editor, safari, appendEvidence, seedCanvas, sharedSession, shared: Boolean(collaboration || session) }

  const lease = useValue('discovery research lease', () => available(editor) ? editor.getCurrentPage().meta.discoveryResearch : null, [editor])
  const readonly = useValue('discovery research permission', () => !writable(editor), [editor])

  const ownsLease = attempt => available(attempt.editor) && attempt.editor.getCurrentPageId() === attempt.pageId && attempt.editor.getCurrentPage().meta.discoveryResearch?.ownerId === attempt.ownerId

  const releaseRemote = useCallback(attempt => {
    if (!attempt?.session || !attempt.remoteRequested || attempt.remotePending || attempt.remoteReleaseSent) return
    attempt.remoteReleaseSent = true
    // Cleanup is independent of the aborted research request and may outlive the
    // editor. The server deletes only this owner; a lost response is bounded by
    // the durable lease expiry, and can never clear another user's reservation.
    void boardRequest(attempt.session, '/research', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ownerId: attempt.ownerId }),
      keepalive: true, signal: AbortSignal.timeout(10000),
    }).catch(() => {})
  }, [])

  const release = useCallback(attempt => {
    releaseRemote(attempt)
    if (!attempt || !ownsLease(attempt)) {
      if (pendingRelease.current === attempt) pendingRelease.current = null
      return
    }
    if (!writable(attempt.editor)) { pendingRelease.current = attempt; return }
    const page = attempt.editor.getCurrentPage()
    const { discoveryResearch, ...meta } = page.meta
    attempt.editor.run(() => attempt.editor.updatePage({ id: page.id, meta }), { history: 'ignore' })
    if (pendingRelease.current === attempt) pendingRelease.current = null
  }, [releaseRemote])

  const saveReport = useCallback(attempt => {
    if (!writable(attempt.editor) || !ownsLease(attempt)) return
    const page = attempt.editor.getCurrentPage()
    attempt.editor.run(() => attempt.editor.updatePage({ id: page.id, meta: { ...page.meta, discoveryReport: reportFor(attempt.data, attempt.startedAt) } }), { history: 'ignore' })
  }, [])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      const attempt = request.current
      if (!attempt) return
      attempt.stopped = true
      attempt.controller.abort()
      attempt.data = { ...attempt.data, status: attempt.received ? attempt.data.status : 'partial' }
      saveReport(attempt)
      release(attempt)
      request.current = null
    }
  }, [editor, safari.id, sharedSession?.roomId, release, saveReport])

  useEffect(() => {
    if (!readonly && pendingRelease.current) {
      saveReport(pendingRelease.current)
      release(pendingRelease.current)
    }
  }, [readonly, lease, release, saveReport])

  useEffect(() => {
    if (!Number.isFinite(lease?.startedAt)) return undefined
    const remaining = lease.startedAt + LEASE_MS - Date.now()
    if (remaining <= 0) { setLeaseClock(Date.now()); return undefined }
    const timer = setTimeout(() => setLeaseClock(Date.now()), Math.min(remaining + 25, LEASE_MS * 2 + 25))
    return () => clearTimeout(timer)
  }, [lease?.startedAt])

  const stop = useCallback(() => {
    const attempt = request.current
    if (!attempt) return
    attempt.stopped = true
    attempt.controller.abort()
    attempt.data = { ...attempt.data, status: attempt.received ? attempt.data.status : 'partial' }
    if (mounted.current) {
      if (attempt.seeded) setResearchSafari(attempt.data)
      setState(previous => ({ ...previous, busy: false, error: '', notice: attempt.data.cards.length ? 'Research stopped. The checked findings on your table are saved.' : 'Research stopped. Your idea table is unchanged.' }))
    }
    saveReport(attempt)
    release(attempt)
  }, [release, saveReport])

  const start = useCallback(async () => {
    const source = latest.current
    const activeEditor = source.editor
    if (request.current || !available(activeEditor)) return
    if (!writable(activeEditor)) {
      setState({ ...emptyRun, error: 'Reconnect to the table before starting research.' })
      return
    }
    if (source.shared && !source.sharedSession) {
      setState({ ...emptyRun, error: 'The shared table is still connecting. Please try again in a moment.' })
      return
    }
    const page = activeEditor.getCurrentPage()
    if (freshLease(page.meta.discoveryResearch, Date.now())) {
      setState({ ...emptyRun, error: 'Someone is already gathering evidence for this table.' })
      return
    }
    if (activeEditor.getCurrentPageShapes().some(shape => shape.type === 'safari-evidence-card' && shape.props.evidence?.card?.id)) {
      setState({ ...emptyRun, notice: 'Your evidence is already on the table.' })
      return
    }
    if (!source.safari.challenge?.trim()) {
      setState({ ...emptyRun, error: 'Add a challenge before starting research.' })
      return
    }

    const startedAt = Date.now()
    const attempt = {
      editor: activeEditor, pageId: page.id, ownerId: crypto.randomUUID(), startedAt,
      controller: new AbortController(), received: false, stopped: false,
      session: source.sharedSession, remoteRequested: false, remotePending: false, remoteReleaseSent: false, seeded: false,
      data: { ...source.safari, cards: [], sources: [], stations: [], status: 'researching' },
    }
    request.current = attempt
    setState({ ...emptyRun, busy: true, startedAt })
    const isCurrent = () => mounted.current && request.current === attempt && !attempt.controller.signal.aborted && available(activeEditor) && activeEditor.getCurrentPageId() === attempt.pageId

    try {
      if (attempt.session) {
        attempt.remoteRequested = true
        attempt.remotePending = true
        try {
          // Do not abort this reservation with Stop: awaiting its bounded
          // response lets finally release a reservation that landed just after
          // the user left, without ever starting the paid request afterwards.
          const reservation = await boardRequest(attempt.session, '/research', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ownerId: attempt.ownerId }),
            signal: AbortSignal.timeout(15000),
          })
          if (!reservation.ok || reservation.ownerId !== attempt.ownerId || !Number.isFinite(reservation.expiresAt)) throw Error('The research slot could not be reserved. Please try again.')
        } finally { attempt.remotePending = false }
      }
      if (!isCurrent()) return
      if (!writable(activeEditor)) throw Error('Reconnect to the table before starting research.')
      // A previous owner can finish while our reservation is in flight. Its
      // evidence wins; never reset those imports or make a duplicate model call.
      if (activeEditor.getCurrentPageShapes().some(shape => shape.type === 'safari-evidence-card' && shape.props.evidence?.card?.id)) {
        setState(previous => ({ ...previous, notice: 'Your evidence is already on the table.' }))
        return
      }
      const currentPage = activeEditor.getCurrentPage()
      activeEditor.run(() => activeEditor.updatePage({ id: currentPage.id, meta: { ...currentPage.meta, discoveryResearch: { ownerId: attempt.ownerId, startedAt } } }), { history: 'ignore' })
      source.seedCanvas(activeEditor, attempt.data)
      const seeded = activeEditor.getCurrentPage()
      activeEditor.run(() => activeEditor.updatePage({ id: seeded.id, meta: { ...seeded.meta, safariImportedIds: [], safariCardSlots: {} } }), { history: 'ignore' })
      attempt.seeded = true
      setResearchSafari(attempt.data)

      await requestSafari(source.safari.challenge, { signal: attempt.controller.signal, onEvent: event => {
        if (!isCurrent()) return
        if (!writable(activeEditor)) throw Error('The connection paused. Reconnect to keep gathering evidence.')
        if (!ownsLease(attempt)) throw Error('Another research run has taken over this table.')
        if (event.type === 'progress') setState(previous => ({ ...previous, progress: mergeProgress(previous?.progress || {}, event) }))
        if (event.type === 'evidence' || event.type === 'result') {
          attempt.received ||= event.type === 'result'
          attempt.data = {
            ...event.safari,
            id: source.safari.id, challenge: source.safari.challenge,
            kind: source.safari.kind, defaultStage: source.safari.defaultStage,
          }
          source.appendEvidence(activeEditor, attempt.data)
          setResearchSafari(attempt.data)
          if (event.type === 'result') saveReport(attempt)
        }
        if (event.type === 'done') {
          attempt.data = { ...attempt.data, cost: event.cost, timing: event.timing }
          setResearchSafari(attempt.data)
          saveReport(attempt)
        }
        if (event.type === 'completion_interrupted') setState(previous => ({ ...previous, notice: 'Your evidence is ready. The final usage report did not arrive.' }))
      } })
    } catch (error) {
      attempt.controller.abort()
      if (mounted.current && request.current === attempt) {
        // Abort from Stop/unmount already preserves the checked findings. An
        // actual failure is still useful when one or more lanes have arrived.
        if (error?.name !== 'AbortError' && !attempt.stopped) {
          attempt.data = { ...attempt.data, status: attempt.received ? attempt.data.status : 'partial' }
          if (attempt.seeded) setResearchSafari(attempt.data)
          setState(previous => ({ ...previous, error: attempt.received ? '' : error?.message || 'Research stopped early.', notice: attempt.received ? 'Your evidence is ready. The final usage report did not arrive.' : attempt.data.cards.length ? 'The checked findings on your table are saved.' : '' }))
        }
      }
    } finally {
      if (attempt.seeded && attempt.data.status === 'researching') {
        attempt.data = { ...attempt.data, status: attempt.received ? 'complete' : 'partial' }
        if (mounted.current && request.current === attempt) setResearchSafari(attempt.data)
      }
      saveReport(attempt)
      release(attempt)
      if (request.current === attempt) {
        request.current = null
        if (mounted.current) setState(previous => ({ ...previous, busy: false }))
      }
    }
  }, [release, saveReport])

  const otherResearch = freshLease(lease, Math.max(leaseClock, Date.now())) && lease.ownerId !== request.current?.ownerId
  const run = otherResearch
    ? { ...emptyRun, ...state, busy: true, startedAt: lease.startedAt, notice: 'Someone is gathering evidence for this table.', onStop: undefined }
    : state ? { ...state, onStop: state.busy ? stop : undefined } : null
  return { researchSafari, run, start }
}
