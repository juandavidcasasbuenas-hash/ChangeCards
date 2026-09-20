// Keep personal work when a newer snapshot of the same research arrives.
export function mergeSafari(library, data) {
  const { artwork, ...evidence } = data
  const existing = library.safaris.find(safari => safari.id === data.id)
  return { ...library, currentId: data.id, safaris: [{
    ...existing, ...evidence, savedIds: existing?.savedIds || [], seenIds: existing?.seenIds || [],
    notes: existing?.notes || {}, reflection: existing?.reflection || '',
  }, ...library.safaris.filter(safari => safari.id !== data.id)] }
}

export function mergeProgress(previous, event, now = Date.now()) {
  // Writing and checking overlap; one stage changing must not erase another lane.
  return { ...previous, ...event, updatedAt: now, lenses: {
    ...previous.lenses, ...(event.lens ? { [event.lens]: { stage: event.stage, state: event.lensState } } : {}),
  } }
}

export function trailStatus(lens, progress, busy) {
  if (!busy) return 'An open question'
  const lane = progress?.lenses?.[lens]
  if (lane?.state === 'unavailable') return 'A gap to explore'
  if (lane?.stage === 'checking') return lane.state === 'done' ? 'A gap to explore' : 'Checking what holds up…'
  if (lane?.stage === 'writing') return lane.state === 'done' ? 'Taking a closer look…' : 'Finding the nuggets…'
  if (lane?.stage === 'searching') return lane.state === 'done' ? 'Sources gathered' : 'Following a lead…'
  return 'On the map'
}
