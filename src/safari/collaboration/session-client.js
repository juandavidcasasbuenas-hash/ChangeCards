import { MAX_IMAGE_BYTES, ROOM_ID, ROOM_KEY, sessionLink } from '../../../shared/safari-session.mjs'

const SESSION_KEY = 'evidence-safari.shared.v1:'
export function rememberedSession(safariId, { pending = false } = {}) {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY + safariId) || 'null')
    return session && ROOM_ID.test(session.roomId) && ROOM_KEY.test(session.key) && (pending || session.ready) ? session : null
  } catch { return null }
}
export function rememberSession(safariId, session) {
  try { localStorage.setItem(SESSION_KEY + safariId, JSON.stringify(session)) } catch { /* The URL remains the way back. */ }
}
export function newSession() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return { roomId: crypto.randomUUID(), key: btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''), ready: false }
}
export async function readResponse(response) {
  let result
  try { result = await response.json() } catch { throw Error('Sharing is temporarily unavailable. Please try again.') }
  if (!response.ok) throw Error(result.error || 'Could not connect to the shared board.')
  return result
}
export async function sharingConfig(signal) {
  const config = await readResponse(await fetch('/api/safari/session', { signal }))
  if (!config.enabled || !config.server) throw Error('Shared boards are not available yet. Your local board is safe.')
  return config
}
export function boardRequest(session, path = '', options = {}) {
  return fetch(`${session.server}/rooms/${session.roomId}${path}`, { ...options,
    headers: { Authorization: `Bearer ${session.key}`, ...options.headers } }).then(readResponse)
}
export function linkFor(session) { return sessionLink(location.origin, session) }
export function readIdentity() {
  try { return JSON.parse(sessionStorage.getItem('evidence-safari.visitor.v1') || 'null') } catch { return null }
}
export function saveIdentity(name) {
  const old = readIdentity()
  const identity = { id: old?.id || crypto.randomUUID(), name: name.trim().slice(0, 40) || 'Explorer', color: old?.color || ['#b34d39', '#665080', '#38759e', '#557941', '#a7681e'][Math.floor(Math.random() * 5)] }
  try { sessionStorage.setItem('evidence-safari.visitor.v1', JSON.stringify(identity)) } catch {}
  return identity
}
// Small pasted images work without another storage service or public media URLs.
export const sharedAssets = {
  async upload(_asset, file) {
    if (file.size > MAX_IMAGE_BYTES || !/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw Error('Shared boards support PNG, JPEG, WebP and GIF images up to 200 KB.')
    const src = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(Error('The image could not be read.'))
      reader.readAsDataURL(file)
    })
    return { src }
  },
  resolve: asset => asset.props.src,
}
