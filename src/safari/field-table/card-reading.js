import { atom } from 'tldraw'

// Reading never transforms a card, moves the camera, or alters the document.
const sessions = new WeakMap()
const privateReading = new WeakMap()
export function setPrivateReading(editor, roomId) { privateReading.set(editor, { roomId, seen: null }) }
export function seenFindings(editor) {
  const session = privateReading.get(editor)
  if (!session) return editor.getCurrentPage().meta.safariSeenIds || []
  if (!session.seen) { try { session.seen = JSON.parse(sessionStorage.getItem(`evidence-safari.seen:${session.roomId}`) || '[]') } catch { session.seen = [] } }
  return session.seen
}
export function markFindingSeen(editor, cardId) {
  const seen = [...new Set([...seenFindings(editor), cardId])], session = privateReading.get(editor)
  if (session) {
    session.seen = seen
    try { sessionStorage.setItem(`evidence-safari.seen:${session.roomId}`, JSON.stringify(seen)) } catch {}
  } else {
    const page = editor.getCurrentPage()
    editor.run(() => editor.updatePage({ id: page.id, meta: { ...page.meta, safariSeenIds: seen } }), { history: 'ignore' })
  }
}
export function readingSession(editor) {
  if (!sessions.has(editor)) sessions.set(editor, atom('evidence card reading', null))
  return sessions.get(editor)
}

export function closeReading(editor) {
  const state = readingSession(editor), session = state.get()
  if (!session) return
  state.set(null)
  requestAnimationFrame(() => {
    if (session.returnFocus?.isConnected) session.returnFocus.focus({ preventScroll: true })
    else if (!editor.isDisposed) editor.getContainer().focus({ preventScroll: true })
  })
}

export function turnCard(editor, shape) {
  if (!shape?.props?.evidence?.card?.id) return
  const state = readingSession(editor), previous = state.get()
  state.set({ shapeId: shape.id, returnFocus: previous?.returnFocus || editor.getContainerWindow().document.activeElement })
}
