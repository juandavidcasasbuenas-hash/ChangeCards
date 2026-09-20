import { atom } from 'tldraw'
import { CARD_W } from './canvas-model.js'

// Reading is a view state, never a shape or a change to the saved document.
const sessions = new WeakMap()
const animation = editor => ({ duration: editor.getContainerWindow().matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 420 })
export function readingSession(editor) {
  if (!sessions.has(editor)) sessions.set(editor, atom('evidence card reading', null))
  return sessions.get(editor)
}

export function closeReading(editor) {
  const state = readingSession(editor), session = state.get()
  if (!session) return
  state.set(null)
  editor.select(...session.selectedIds.filter(id => editor.getShape(id)))
  editor.setCamera(session.camera, { animation: animation(editor) })
  editor.getContainer().focus({ preventScroll: true })
}

export function turnCard(editor, shape) {
  const state = readingSession(editor), previous = state.get()
  if (previous?.shapeId === shape.id) { closeReading(editor); return }
  const bounds = editor.getShapePageBounds(shape.id)
  if (!bounds) return
  const { x, y, z } = editor.getCamera()
  state.set({ shapeId: shape.id, camera: previous?.camera || { x, y, z }, selectedIds: previous?.selectedIds || [...editor.getSelectedShapeIds()] })
  editor.setCurrentTool('select').select(shape.id)
  editor.zoomToBounds(bounds, {
    inset: editor.getViewportScreenBounds().w < 500 ? 64 : 100,
    targetZoom: 1.55 * CARD_W / shape.props.w,
    animation: animation(editor),
  })
}
