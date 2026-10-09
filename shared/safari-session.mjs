export const ROOM_ID = /^[a-f0-9-]{36}$/
export const ROOM_KEY = /^[A-Za-z0-9_-]{43}$/
export const MAX_BOARD_BYTES = 1_500_000
export const MAX_RECORD_BYTES = 300_000
export const MAX_RECORDS = 1500
export const MAX_IMAGE_BYTES = 200_000
export const byteSize = value => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)).length

export function prepareSharedBoard(safari, document) {
  if (!safari?.id || !safari?.challenge || safari.status === 'researching') throw Error('Finish creating the board before inviting people.')
  const snapshot = structuredClone(document)
  if (!snapshot?.store || !snapshot?.schema) throw Error('The board could not be read. Please reopen it and try again.')
  const records = Object.values(snapshot.store)
  if (!records.some(record => record.typeName === 'shape' && ['safari-evidence-card', 'change-card'].includes(record.type))) throw Error('Add evidence or a Change Card to the board before inviting people.')
  if (records.filter(record => record.typeName === 'page').length !== 1 || records.length > MAX_RECORDS) throw Error('This board is too large to share.')
  for (const record of records) {
    if (!['document', 'page', 'shape', 'binding', 'asset', 'user'].includes(record.typeName)) throw Error('Only the board document can be shared.')
    if (record.typeName === 'page') {
      delete record.meta.safariSeenIds
      delete record.meta.safariActiveLens
      delete record.meta.workshopStage
      delete record.meta.developCategory
    }
    if (record.typeName === 'asset' && /^(blob:|asset:)/.test(record.props?.src || '')) throw Error('An image is only stored in this browser. Remove it before sharing this board.')
    if (byteSize(record) > MAX_RECORD_BYTES) throw Error('An image or note is too large to share. Use images smaller than 200 KB.')
  }
  const kind = safari.kind === 'develop' ? 'develop' : 'safari'
  const defaultStage = ['discover', 'develop'].includes(safari.defaultStage) ? safari.defaultStage : kind === 'develop' ? 'develop' : 'discover'
  const result = { safari: { id: String(safari.id).slice(0, 150), challenge: String(safari.challenge).slice(0, 6000), generatedAt: safari.generatedAt, status: safari.status || 'complete', kind, defaultStage }, snapshot }
  if (byteSize(result) > MAX_BOARD_BYTES) throw Error('This board is too large to share. Remove large images and try again.')
  return result
}

export function sessionLink(origin, { roomId, key }) {
  return `${origin}/safari/session/${roomId}#key=${key}`
}

export function parseSessionLink(pathname, hash) {
  const roomId = pathname.match(/^\/safari\/session\/([^/]+)\/?$/)?.[1]
  const key = new URLSearchParams(hash.replace(/^#/, '')).get('key')
  if (!ROOM_ID.test(roomId || '') || !ROOM_KEY.test(key || '')) throw Error('This invite link is incomplete. Ask for the full link, including the part after #.')
  return { roomId, key }
}
