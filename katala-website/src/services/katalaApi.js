const demoUserId = (import.meta.env.VITE_DEMO_USER_ID || '').trim()
const AUTH_KEY = 'katala-auth-v2'
let currentSessionSnapshot = null
let authReady = false

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
  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify(nextSnapshot))
  } catch {
    // Ignore storage restrictions.
  }

  if (changed) emitAuthChanged()
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

export function clearStoredSession() {
  const hadSession = Boolean(currentSessionSnapshot)
  currentSessionSnapshot = null

  // Clean up snapshots that may have been created by an older build.
  try {
    localStorage.removeItem(AUTH_KEY)
    localStorage.removeItem('katala-auth-v1')
  } catch {
    // Ignore storage restrictions.
  }

  if (hadSession) emitAuthChanged()
}

try {
  const stored = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null')
  if (stored?.token && (!stored.expiresAt || Date.now() < Number(stored.expiresAt) * 1000)) {
    currentSessionSnapshot = stored
  } else {
    localStorage.removeItem(AUTH_KEY)
  }
} catch {
  localStorage.removeItem(AUTH_KEY)
}
markAuthReady()

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {})
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  if (currentSessionSnapshot?.token) {
    headers.set('Authorization', `Bearer ${currentSessionSnapshot.token}`)
  } else if (demoUserId) {
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
    const data = await request('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    if (data.session) saveSession(data.session)
    if (data.user) patchSessionUser(data.user)
    return data
  },

  async signin({ email, password, portal = 'customer' }) {
    const data = await request('/api/auth/signin', {
      method: 'POST',
      body: JSON.stringify({ email, password, portal }),
    })
    if (!data.session) throw new Error('Unable to create a signed-in session.')
    saveSession(data.session)
    const user = patchSessionUser(data.user || sessionUser(data.session)) || sessionUser(data.session)
    const requestedPortal = String(portal || 'customer').toLowerCase()
    const role = user?.role || 'customer'
    const allowed = requestedPortal === 'customer'
      ? role === 'customer'
      : role === requestedPortal || (requestedPortal === 'staff' && role === 'admin')
    if (!allowed) {
      clearStoredSession()
      const portalLabel = role === 'admin' ? 'Administrator' : role.charAt(0).toUpperCase() + role.slice(1)
      throw new Error(`This account is registered as ${portalLabel}. Choose the matching portal in "Sign in as".`)
    }
    return { ok: true, user, session: data.session }
  },

  async signout() {
    clearStoredSession()
    return { ok: true }
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
    void password
    throw new Error('Password updates are not available for portal auth yet.')
  },

  async session() {
    return {
      ok: true,
      user: getStoredSession()?.user || null,
      session: currentSessionSnapshot
        ? { access_token: currentSessionSnapshot.token, expires_at: currentSessionSnapshot.expiresAt, user: currentSessionSnapshot.user }
        : null,
    }
  },

  async resendVerification(email) {
    return { ok: true, email }
  },
}

export const schemaApi = {
  health() {
    return request('/api/health')
  },

  listCatalogMaterials() {
    return request('/api/catalog/materials')
  },

  listCatalogServices() {
    return request('/api/catalog/services')
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

  createXenditCheckout(referenceNumber) {
    return request(`/api/quotations/${encodeURIComponent(referenceNumber)}/xendit-checkout`, {
      method: 'POST',
    })
  },

  confirmQuotation(referenceNumber) {
    return request(`/api/quotations/${encodeURIComponent(referenceNumber)}/confirm`, {
      method: 'POST',
    })
  },

  submitManualPayment(payload) {
    return request('/api/payments/manual-proof', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  confirmServiceRequest(referenceNumber) {
    return request(`/api/service-requests/${encodeURIComponent(referenceNumber)}/confirm`, {
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

  listStaffMembers() {
    return request('/api/staff/members')
  },

  listStaffPaymentConfirmations() {
    return request('/api/staff/payment-confirmations')
  },

  reviewStaffPayment(paymentReference, status) {
    return request(`/api/staff/payment-confirmations/${encodeURIComponent(paymentReference)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
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

  getAdminDashboard() {
    return request('/api/admin/dashboard')
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
    if (currentSessionSnapshot?.token) {
      headers.set('Authorization', `Bearer ${currentSessionSnapshot.token}`)
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
