import { supabase } from './supabaseClient'

const demoUserId = (import.meta.env.VITE_DEMO_USER_ID || '').trim()
const AUTH_KEY = 'katala-auth-v2'
let currentSessionSnapshot = null
let authReady = false
let portalSessionCache = { token: '', expiresAt: 0, user: null, promise: null }

function sameUser(a, b) {
  return JSON.stringify(a || null) === JSON.stringify(b || null)
}

function roleRank(role) {
  if (role === 'admin') return 3
  if (role === 'staff') return 2
  return 1
}

function mergeSessionUser(nextUser) {
  const currentUser = currentSessionSnapshot?.user
  if (!currentUser || !nextUser || currentUser.userId !== nextUser.userId) return nextUser

  const strongestRole = roleRank(currentUser.role) > roleRank(nextUser.role)
    ? currentUser.role
    : nextUser.role

  return {
    ...currentUser,
    ...nextUser,
    role: strongestRole,
    name: nextUser.name || currentUser.name,
    companyName: nextUser.companyName || currentUser.companyName,
    contactNumber: nextUser.contactNumber || currentUser.contactNumber,
  }
}

function sessionUser(session) {
  const user = session?.user
  if (!user) return null
  const metadata = user.user_metadata || {}
  const appMetadata = user.app_metadata || {}
  const firstName = String(metadata.first_name || '').trim()
  const lastName = String(metadata.last_name || '').trim()
  const fullName = [firstName, lastName].filter(Boolean).join(' ')
  const role = String(
    appMetadata.role
      || appMetadata.user_role
      || metadata.role
      || metadata.account_type
      || 'customer',
  ).trim().toLowerCase()

  return {
    userId: user.id,
    email: user.email || '',
    name: fullName || user.email || 'Customer',
    role,
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

export function isAuthReady() {
  return authReady
}

export function hasPortalRole(...roles) {
  const role = getStoredSession()?.user?.role || 'customer'
  return roles.map((item) => String(item).toLowerCase()).includes(role)
}

function emitAuthChanged() {
  window.dispatchEvent(new CustomEvent('katala-auth-changed'))
}

function markAuthReady() {
  if (authReady) return
  authReady = true
  emitAuthChanged()
}

function saveSession(session) {
  if (!session?.access_token) {
    clearStoredSession()
    return
  }

  const nextSnapshot = {
    token: session.access_token,
    expiresAt: session.expires_at || null,
    user: mergeSessionUser(sessionUser(session)),
  }
  const changed = currentSessionSnapshot?.token !== nextSnapshot.token
    || currentSessionSnapshot?.expiresAt !== nextSnapshot.expiresAt
    || !sameUser(currentSessionSnapshot?.user, nextSnapshot.user)

  // Keep only the minimum UI snapshot in memory. Do not persist the JWT.
  currentSessionSnapshot = nextSnapshot

  if (changed) emitAuthChanged()
}

async function syncSession(session, options = {}) {
  if (!session?.access_token) {
    clearStoredSession()
    if (options.markReady) markAuthReady()
    return
  }

  saveSession(session)
  try {
    const portalUser = await loadPortalSession(session)
    patchSessionUser({
      ...(portalUser || {}),
      role: portalUser?.role || currentSessionSnapshot?.user?.role || 'customer',
    })
  } catch (error) {
    if (error?.status === 401 || error?.status === 403) clearStoredSession()
    throw error
  } finally {
    if (options.markReady) markAuthReady()
  }
}

function patchSessionUser(patch) {
  if (!currentSessionSnapshot?.user) return currentSessionSnapshot?.user || null
  const nextUser = {
    ...currentSessionSnapshot.user,
    ...patch,
  }
  const changed = !sameUser(currentSessionSnapshot.user, nextUser)
  currentSessionSnapshot = {
    ...currentSessionSnapshot,
    user: nextUser,
  }
  if (changed) emitAuthChanged()
  return currentSessionSnapshot.user
}

async function loadPortalSession(session) {
  const token = session?.access_token || ''
  if (!token) return null

  if (portalSessionCache.token === token && portalSessionCache.user && Date.now() < portalSessionCache.expiresAt) {
    return portalSessionCache.user
  }
  if (portalSessionCache.token === token && portalSessionCache.promise) {
    return await portalSessionCache.promise
  }

  portalSessionCache = {
    token,
    expiresAt: 0,
    user: null,
    promise: fetch('/api/auth/portal-session', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }).then(async (response) => {
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        const error = new Error(data.error || `Request failed (${response.status}).`)
        error.status = response.status
        throw error
      }
      portalSessionCache.user = data.user || null
      portalSessionCache.expiresAt = Date.now() + 5_000
      return portalSessionCache.user
    }).finally(() => {
      portalSessionCache.promise = null
    }),
  }

  return await portalSessionCache.promise
}

export function clearStoredSession() {
  const hadSession = Boolean(currentSessionSnapshot)
  currentSessionSnapshot = null
  portalSessionCache = { token: '', expiresAt: 0, user: null, promise: null }

  // Clean up snapshots that may have been created by an older build.
  try {
    localStorage.removeItem(AUTH_KEY)
    localStorage.removeItem('katala-auth-v1')
  } catch {
    // Ignore storage restrictions.
  }

  if (hadSession) emitAuthChanged()
}

// Align the synchronous UI snapshot with the current in-memory Supabase session.
supabase.auth.getSession().then(({ data }) => {
  return syncSession(data?.session, { markReady: true })
}).catch(() => {
  clearStoredSession()
  markAuthReady()
})

supabase.auth.onAuthStateChange((_event, session) => {
  syncSession(session).catch(() => {})
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
    const accountType = ['staff', 'customer'].includes(String(payload.accountType || '').toLowerCase())
      ? String(payload.accountType).toLowerCase()
      : 'customer'
    const redirectUrl = `${window.location.origin}${window.location.pathname}`
    const { data, error } = await supabase.auth.signUp({
      email: payload.email,
      password: payload.password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          account_type: accountType,
          role: accountType,
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
    if (data.user?.id) {
      await request('/api/auth/register-profile', {
        method: 'POST',
        body: JSON.stringify({
          userId: data.user.id,
          accountType,
          firstName: payload.firstName,
          lastName: payload.lastName,
          email: payload.email,
          contactNumber: payload.contactNumber,
          companyName: payload.companyName,
          jobTitle: payload.jobTitle,
          industry: payload.industry,
          companyAddress: payload.companyAddress,
        }),
      })
    }
    return {
      ok: true,
      user: data.user,
      accountType,
      requiresApproval: accountType === 'staff',
      requiresEmailConfirmation: !data.session,
    }
  },

  async signin({ email, password, portal = 'customer' }) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    if (!data.session) throw new Error('Unable to create a signed-in session.')

    saveSession(data.session)
    const baseUser = sessionUser(data.session)
    let portalUser = null
    try {
      portalUser = await loadPortalSession(data.session)
    } catch (error) {
      await supabase.auth.signOut().catch(() => {})
      clearStoredSession()
      throw error
    }
    const user = patchSessionUser({
      ...(portalUser || {}),
      role: portalUser?.role || baseUser?.role || 'customer',
    }) || baseUser

    const requestedPortal = String(portal || 'customer').toLowerCase()
    const role = user?.role || 'customer'
    const allowed = requestedPortal === 'customer'
      ? role === 'customer'
      : role === requestedPortal || (requestedPortal === 'staff' && role === 'admin')
    if (!allowed) {
      await supabase.auth.signOut().catch(() => {})
      clearStoredSession()
      const portalLabel = role === 'admin' ? 'Administrator' : role.charAt(0).toUpperCase() + role.slice(1)
      throw new Error(`This account is registered as ${portalLabel}. Choose the matching portal in "Sign in as".`)
    }
    return { ok: true, user, session: data.session }
  },

  async signout() {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    } finally {
      clearStoredSession()
    }
  },

  async updateProfile(payload) {
    const data = await request('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
    if (data.user) patchSessionUser(data.user)
    return data
  },

  async updatePassword(password) {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error
    return { ok: true }
  },

  async session() {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    if (!data.session) {
      clearStoredSession()
      return { ok: true, user: null, session: null }
    }
    saveSession(data.session)
    const baseUser = sessionUser(data.session)
    const portalUser = await loadPortalSession(data.session)
    const user = patchSessionUser({
      ...(portalUser || {}),
      role: portalUser?.role || baseUser?.role || 'customer',
    }) || baseUser
    return { ok: true, user, session: data.session }
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

  listCatalogMaterials() {
    return request('/api/catalog/materials')
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

  createPaymongoCheckout(referenceNumber) {
    return request(`/api/quotations/${encodeURIComponent(referenceNumber)}/paymongo-checkout`, {
      method: 'POST',
    })
  },

  getPaymentReceipt(paymentReference) {
    return request(`/api/payments/${encodeURIComponent(paymentReference)}/receipt`)
  },

  getCustomerInbox() {
    return request('/api/customer/inbox')
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

  listStaffRequests() {
    return request('/api/staff/work-queue')
  },

  updateStaffQuotation(referenceNumber, payload) {
    return request(`/api/staff/quotations/${encodeURIComponent(referenceNumber)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  },

  updateStaffServiceRequest(referenceNumber, payload) {
    return request(`/api/staff/service-requests/${encodeURIComponent(referenceNumber)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  },

  listAdminMaterials() {
    return request('/api/admin/materials')
  },

  createAdminMaterial(payload) {
    return request('/api/admin/materials', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  updateAdminMaterial(variantId, payload) {
    return request(`/api/admin/materials/${encodeURIComponent(variantId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  },

  deleteAdminMaterial(variantId) {
    return request(`/api/admin/materials/${encodeURIComponent(variantId)}`, {
      method: 'DELETE',
    })
  },

  listAdminServices() {
    return request('/api/admin/services')
  },

  createAdminService(payload) {
    return request('/api/admin/services', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  updateAdminService(serviceId, payload) {
    return request(`/api/admin/services/${encodeURIComponent(serviceId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  },

  deleteAdminService(serviceId) {
    return request(`/api/admin/services/${encodeURIComponent(serviceId)}`, {
      method: 'DELETE',
    })
  },

  listAdminAccounts() {
    return request('/api/admin/accounts')
  },

  updateAdminAccount(userId, payload) {
    return request(`/api/admin/accounts/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  },

  async downloadAdminDatabaseBackup() {
    const headers = new Headers()
    const { data: { session } = {} } = await supabase.auth.getSession()
    if (session?.access_token) {
      saveSession(session)
      headers.set('Authorization', `Bearer ${session.access_token}`)
    } else if (demoUserId) {
      headers.set('X-Development-User-Id', demoUserId)
      headers.set('X-Development-Role', 'admin')
    }

    const response = await fetch('/api/admin/database-backup', { headers })
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || `Request failed (${response.status}).`)
    }

    const blob = await response.blob()
    const disposition = response.headers.get('Content-Disposition') || ''
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] || 'katala-database-backup.csv'
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    return { ok: true, filename }
  },
}
