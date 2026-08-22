import { supabase } from './supabaseClient'

const demoUserId = (import.meta.env.VITE_DEMO_USER_ID || '').trim()
const AUTH_KEY = 'katala-auth-v2'
let currentSessionSnapshot = null

function sessionUser(session) {
  const user = session?.user
  if (!user) return null
  const metadata = user.user_metadata || {}
  const firstName = String(metadata.first_name || '').trim()
  const lastName = String(metadata.last_name || '').trim()
  const fullName = [firstName, lastName].filter(Boolean).join(' ')

  return {
    userId: user.id,
    email: user.email || '',
    name: fullName || user.email || 'Customer',
    companyName: metadata.company_name || null,
    contactNumber: metadata.contact_number || null,
  }
}

export function getStoredSession() {
  if (!currentSessionSnapshot?.token) return null

  // Never expose an already-expired JWT as an authenticated UI session.
  if (
    currentSessionSnapshot.expiresAt &&
    Date.now() >= Number(currentSessionSnapshot.expiresAt) * 1000
  ) {
    currentSessionSnapshot = null
    return null
  }

  return currentSessionSnapshot
}

export function isSignedIn() {
  return Boolean(getStoredSession()?.token)
}

function emitAuthChanged() {
  window.dispatchEvent(new CustomEvent('katala-auth-changed'))
}

function saveSession(session) {
  if (!session?.access_token) {
    clearStoredSession()
    return
  }

  // Keep only the minimum UI snapshot in memory. Do not persist the JWT.
  currentSessionSnapshot = {
    token: session.access_token,
    expiresAt: session.expires_at || null,
    user: sessionUser(session),
  }

  emitAuthChanged()
}

export function clearStoredSession() {
  currentSessionSnapshot = null

  // Clean up snapshots that may have been created by an older build.
  try {
    localStorage.removeItem(AUTH_KEY)
    localStorage.removeItem('katala-auth-v1')
  } catch {
    // Ignore storage restrictions.
  }

  emitAuthChanged()
}

// Align the synchronous UI snapshot with the current in-memory Supabase session.
supabase.auth.getSession().then(({ data }) => {
  if (data?.session) saveSession(data.session)
  else clearStoredSession()
}).catch(() => clearStoredSession())

supabase.auth.onAuthStateChange((_event, session) => {
  if (session) saveSession(session)
  else clearStoredSession()
})

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {})
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  // Always ask Supabase for the latest access token so refreshed JWTs are sent to the API.
  const { data: { session } = {} } = await supabase.auth.getSession()
  if (session?.access_token) {
    saveSession(session)
    headers.set('Authorization', `Bearer ${session.access_token}`)
  } else if (demoUserId) {
    // Optional local-development fallback only.
    headers.set('X-Development-User-Id', demoUserId)
  }

  const response = await fetch(path, { ...options, headers })
  const data = await response.json().catch(() => ({}))

  if (response.status === 401) {
    clearStoredSession()
  }
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`)
  return data
}

export const authApi = {
  async signup(payload) {
    const redirectUrl = `${window.location.origin}${window.location.pathname}`
    const { data, error } = await supabase.auth.signUp({
      email: payload.email,
      password: payload.password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          first_name: payload.firstName,
          last_name: payload.lastName,
          contact_number: payload.contactNumber,
          company_name: payload.companyName,
          job_title: payload.jobTitle,
          industry: payload.industry,
          company_address: payload.companyAddress,
        },
      },
    })

    if (error) throw error
    return {
      ok: true,
      user: data.user,
      requiresEmailConfirmation: !data.session,
    }
  },

  async signin({ email, password }) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    if (!data.session) throw new Error('Unable to create a signed-in session.')
    saveSession(data.session)
    return { ok: true, user: sessionUser(data.session), session: data.session }
  },

  async signout() {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    } finally {
      clearStoredSession()
    }
  },

  async session() {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    if (!data.session) {
      clearStoredSession()
      return { ok: true, user: null, session: null }
    }
    saveSession(data.session)
    return { ok: true, user: sessionUser(data.session), session: data.session }
  },

  async resendVerification(email) {
    const redirectUrl = `${window.location.origin}${window.location.pathname}`
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: redirectUrl },
    })
    if (error) throw error
    return { ok: true }
  },
}

export const schemaApi = {
  health() {
    return request('/api/health')
  },

  createQuotation(payload) {
    return request('/api/quotations', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  getQuotation(referenceNumber) {
    return request(`/api/quotations/${encodeURIComponent(referenceNumber)}`)
  },

  updateQuotation(referenceNumber, payload) {
    return request(`/api/quotations/${encodeURIComponent(referenceNumber)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  },

  cancelQuotation(referenceNumber) {
    return request(`/api/quotations/${encodeURIComponent(referenceNumber)}`, {
      method: 'DELETE',
    })
  },

  createServiceRequest(payload) {
    return request('/api/service-requests', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  getServiceRequest(referenceNumber) {
    return request(`/api/service-requests/${encodeURIComponent(referenceNumber)}`)
  },

  updateServiceRequest(referenceNumber, payload) {
    return request(`/api/service-requests/${encodeURIComponent(referenceNumber)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  },

  cancelServiceRequest(referenceNumber) {
    return request(`/api/service-requests/${encodeURIComponent(referenceNumber)}`, {
      method: 'DELETE',
    })
  },
}