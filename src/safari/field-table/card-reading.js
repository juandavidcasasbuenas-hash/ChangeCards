import { atom } from 'tldraw'

// Reading never transforms a card, moves the camera, or alters the document.
const sessions = new WeakMap()
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
