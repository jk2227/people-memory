import { supabase } from './supabase'

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')
  return {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  }
}

async function request(path, options = {}) {
  const headers = await authHeaders()
  const res = await fetch(path, { ...options, headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || 'Request failed')
  }
  return res.json()
}

// People
export const listPeople = () => request('/api/people')

export const getPerson = (id) => request(`/api/people/${id}`)

export const createPerson = (name, relationship) =>
  request('/api/people', {
    method: 'POST',
    body: JSON.stringify({ name, relationship }),
  })

export const updatePerson = (id, data) =>
  request(`/api/people/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })

export const deletePerson = (id) =>
  request(`/api/people/${id}`, { method: 'DELETE' })

// Facts
export const addFact = (personId, text) =>
  request(`/api/people/${personId}/facts`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  })

export const removeFact = (personId, factId) =>
  request(`/api/people/${personId}/facts/${factId}`, { method: 'DELETE' })

// Told
export const addTold = (personId, text) =>
  request(`/api/people/${personId}/told`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  })

export const removeTold = (personId, toldId) =>
  request(`/api/people/${personId}/told/${toldId}`, { method: 'DELETE' })

// Interactions
export const addInteraction = (personId, text, date) =>
  request(`/api/people/${personId}/interactions`, {
    method: 'POST',
    body: JSON.stringify({ text, date }),
  })

export const removeInteraction = (personId, interactionId) =>
  request(`/api/people/${personId}/interactions/${interactionId}`, { method: 'DELETE' })
