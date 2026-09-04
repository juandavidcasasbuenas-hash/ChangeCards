import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY

export const isCoopConfigured = Boolean(supabaseUrl && supabaseKey)

const supabase = isCoopConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null

function requireClient() {
  if (!supabase) {
    throw new Error('Co-op is not connected yet. Add the Supabase project URL and publishable key to .env.')
  }
  return supabase
}

function firstRow(data) {
  return Array.isArray(data) ? data[0] : data
}

async function ensureAnonymousSession() {
  const client = requireClient()
  const { data: sessionData, error: sessionError } = await client.auth.getSession()
  if (sessionError) throw sessionError
  if (sessionData.session?.user) return sessionData.session.user

  const { data, error } = await client.auth.signInAnonymously()
  if (error) throw error
  return data.user
}

export async function createWorkshop({ displayName, idea }) {
  await ensureAnonymousSession()
  const { data, error } = await requireClient().rpc('create_change_cards_workshop', {
    p_display_name: displayName,
    p_idea: idea,
  })
  if (error) throw error
  return firstRow(data)
}

export async function joinWorkshop({ code, displayName }) {
  await ensureAnonymousSession()
  const { data, error } = await requireClient().rpc('join_change_cards_workshop', {
    p_code: code,
    p_display_name: displayName,
  })
  if (error) throw error
  return firstRow(data)
}

export async function saveWorkshopIdea({ workshopId, idea }) {
  const { error } = await requireClient().rpc('save_change_cards_idea', {
    p_workshop_id: workshopId,
    p_body: idea,
  })
  if (error) throw error
}

export async function setWorkshopRoute({ workshopId, routeId }) {
  const { error } = await requireClient().rpc('set_change_cards_route', {
    p_workshop_id: workshopId,
    p_route_id: routeId,
  })
  if (error) throw error
}

export async function startNextRound(workshopId) {
  const { error } = await requireClient().rpc('start_change_cards_round', {
    p_workshop_id: workshopId,
  })
  if (error) throw error
}

export async function closeCurrentRound(workshopId) {
  const { error } = await requireClient().rpc('close_change_cards_round', {
    p_workshop_id: workshopId,
  })
  if (error) throw error
}

export async function submitTransformation({ assignmentId, response }) {
  const { data, error } = await requireClient().rpc('submit_change_cards_transformation', {
    p_assignment_id: assignmentId,
    p_response: response,
  })
  if (error) throw error
  return data
}

export async function endWorkshop(workshopId) {
  const { error } = await requireClient().rpc('end_change_cards_workshop', {
    p_workshop_id: workshopId,
  })
  if (error) throw error
}

export async function loadWorkshop(workshopId) {
  const client = requireClient()
  const user = await ensureAnonymousSession()
  const [workshopResult, participantsResult, ideasResult, assignmentsResult] = await Promise.all([
    client.from('workshops').select('*').eq('id', workshopId).single(),
    client.from('participants').select('*').eq('workshop_id', workshopId).order('joined_at'),
    client.from('ideas').select('*').eq('workshop_id', workshopId).order('created_at'),
    client.from('assignments').select('*').eq('workshop_id', workshopId).order('round_number'),
  ])

  const error = workshopResult.error || participantsResult.error || ideasResult.error || assignmentsResult.error
  if (error) throw error
  return {
    workshop: workshopResult.data,
    participants: participantsResult.data || [],
    ideas: ideasResult.data || [],
    assignments: assignmentsResult.data || [],
    currentUserId: user.id,
  }
}

export function subscribeToWorkshop(workshopId, onChange) {
  const client = requireClient()
  const channel = client
    .channel(`change-cards-workshop-${workshopId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workshops', filter: `id=eq.${workshopId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `workshop_id=eq.${workshopId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ideas', filter: `workshop_id=eq.${workshopId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments', filter: `workshop_id=eq.${workshopId}` }, onChange)
    .subscribe((status) => { if (status === 'SUBSCRIBED') onChange() })

  return () => client.removeChannel(channel)
}
