import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim()
const supabasePublishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim()

if (!supabaseUrl || !supabasePublishableKey) {
  console.warn('Supabase Auth is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.')
}

// Security policy for the Katala client portal:
// - Authentication is kept only in memory for the current page instance.
// - Reloading/reopening the app requires the customer to sign in again.
// - Remove auth data left behind by older versions that persisted tokens.
function clearLegacyPersistedAuth() {
  try {
    localStorage.removeItem('katala-auth-v1')
    localStorage.removeItem('katala-auth-v2')

    const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
    if (projectRef) {
      localStorage.removeItem(`sb-${projectRef}-auth-token`)
    }
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

clearLegacyPersistedAuth()

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    // Do not save access/refresh tokens to localStorage.
    persistSession: false,

    // Keep an active in-memory session refreshed while this page is open.
    autoRefreshToken: true,

    // Keep support for Supabase email-confirmation callbacks.
    detectSessionInUrl: true,
  },
})