export const BOARD_LIBRARY_KEY = 'change-cards.boards.v2'
export const LEGACY_BOARD_ID = 'change-cards-imported-v1'
const LEGACY_SESSION_KEY = 'change-cards-session-v1'

function metadata(board) {
  if (!board || typeof board.id !== 'string' || !board.id || typeof board.challenge !== 'string') return null
  return {
    id: board.id,
    challenge: board.challenge,
    kind: board.kind === 'develop' ? 'develop' : 'safari',
    defaultStage: board.defaultStage === 'discover' ? 'discover' : 'develop',
    generatedAt: typeof board.generatedAt === 'string' ? board.generatedAt : new Date().toISOString(),
    status: board.status || 'complete',
    ...(board.id === LEGACY_BOARD_ID && board.legacy && typeof board.legacy === 'object' ? { legacy: board.legacy } : {}),
  }
}

// The canvas document lives in tldraw's browser store. The library is deliberately
// small: a question, its stable ID, and the one-time legacy import if needed.
export function readBoards() {
  try {
    const value = JSON.parse(localStorage.getItem(BOARD_LIBRARY_KEY) || '[]')
    if (!Array.isArray(value)) throw new Error('Invalid board library')
    const boards = value.map(metadata)
    if (boards.some(board => !board)) throw new Error('Invalid board metadata')
    return boards
  } catch {
    const empty = []
    empty.storageError = 'Your saved tables could not be read in this browser. Your original browser data has been left untouched.'
    return empty
  }
}

export function rememberBoard(board) {
  const entry = metadata(board)
  if (!entry) throw new Error('This table could not be saved.')
  const current = readBoards()
  if (current.storageError) throw new Error(current.storageError)
  const previous = current.find(item => item.id === entry.id)
  const nextEntry = previous?.legacy && !entry.legacy ? { ...entry, legacy: previous.legacy } : entry
  const next = [nextEntry, ...current.filter(item => item.id !== entry.id)]
  localStorage.setItem(BOARD_LIBRARY_KEY, JSON.stringify(next))
  return next
}

export function readLegacySession() {
  try {
    const session = JSON.parse(localStorage.getItem(LEGACY_SESSION_KEY) || 'null')
    if (!session || typeof session.idea !== 'string' || !session.idea.trim()) return null
    const hasWork = session.stage === 'play' || session.dealtCardIds?.length || Object.values(session.swarm || {}).some(item => item?.note || item?.visited) || Object.values(session.drafts || {}).some(value => typeof value === 'string' && value.trim())
    return hasWork ? session : null
  } catch { return null }
}
