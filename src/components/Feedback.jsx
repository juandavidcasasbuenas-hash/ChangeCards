import { createContext, useContext, useRef, useState } from 'react'
import './feedback.css'

const FeedbackContext = createContext(null)

export function FeedbackProvider({ children }) {
  const dialogRef = useRef(null)
  const triggerRef = useRef(null)
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const attemptRef = useRef(null)
  const sendingRef = useRef(false)
  const screenRef = useRef('landing')

  const submit = async (event) => {
    event.preventDefault()
    if (sendingRef.current) return
    const payload = { message: message.trim(), email: email.trim(), screen: screenRef.current }
    const signature = JSON.stringify(payload)
    if (attemptRef.current?.signature !== signature) attemptRef.current = { signature, id: crypto.randomUUID() }
    sendingRef.current = true
    setStatus('sending')
    setError('')
    try {
      const response = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, id: attemptRef.current.id }), signal: AbortSignal.timeout(50000) })
      const result = await response.json()
      if (!response.ok || !result.saved) throw new Error(result.error || 'Could not send feedback. Please try again.')
      setStatus('success')
      setMessage('')
      setEmail('')
      attemptRef.current = null
    } catch (err) {
      setStatus('error')
      setError(err instanceof SyntaxError || err.name === 'TypeError' || err.name === 'TimeoutError' ? 'Could not send feedback. Please try again.' : err.message)
    } finally { sendingRef.current = false }
  }

  const open = (trigger) => {
    triggerRef.current = trigger.closest('.secondary-table-actions')?.querySelector('.table-actions-toggle') || trigger
    if (!sendingRef.current) { setStatus('idle'); setError('') }
    screenRef.current = new URLSearchParams(window.location.search).has('room') ? 'co-op' : document.querySelector('.tabletop') ? 'table' : 'landing'
    dialogRef.current.showModal()
    requestAnimationFrame(() => dialogRef.current?.querySelector('textarea')?.focus({ preventScroll: true }))
  }

  return (
    <FeedbackContext.Provider value={open}>
      {children}
      <dialog ref={dialogRef} className="feedback-dialog" aria-labelledby="feedback-title" aria-describedby="feedback-intro" onClose={() => triggerRef.current?.focus({ preventScroll: true })} onClick={(event) => {
        if (event.target !== event.currentTarget) return
        const rect = event.currentTarget.getBoundingClientRect()
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.currentTarget.close()
      }}>
        <button className="feedback-close" type="button" aria-label="Close feedback" onClick={() => dialogRef.current.close()}>×</button>
        <h2 id="feedback-title">Share a little feedback</h2>
        <p id="feedback-intro">What worked well, felt confusing, or could be better?</p>
        {status === 'success' ? <p className="feedback-preview-status" role="status">Thanks — your feedback has been saved.</p> : <form onSubmit={submit} aria-busy={status === 'sending'}>
          <label htmlFor="tester-feedback">Your feedback</label>
          <textarea id="tester-feedback" value={message} disabled={status === 'sending'} onChange={(event) => setMessage(event.target.value)} placeholder="I noticed…" maxLength={3000} required autoFocus />
          <label htmlFor="tester-email">Email <span>Optional, if you’d like a reply</span></label>
          <input id="tester-email" disabled={status === 'sending'} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" maxLength={254} />
          <div className="feedback-form-footer">
            <p>Shared privately with Juan.</p>
            <button className="ink-button" type="submit" disabled={!message.trim() || status === 'sending'}>{status === 'sending' ? 'Sending…' : 'Send feedback'} <span aria-hidden="true">→</span></button>
          </div>
          {error && <p className="feedback-preview-status" role="alert">{error}</p>}
        </form>}
      </dialog>
    </FeedbackContext.Provider>
  )
}

export function FeedbackButton({ className = '', onOpen }) {
  const open = useContext(FeedbackContext)
  return <button type="button" className={`feedback-button ${className}`} onClick={(event) => { open(event.currentTarget); onOpen?.() }} aria-label="Give feedback">Feedback</button>
}
