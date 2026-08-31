import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim()
const supabasePublishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim()
const useLocalAuth = (import.meta.env.VITE_AUTH_PROVIDER || '').trim().toLowerCase() === 'local'
export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey)

if (!isSupabaseConfigured && !useLocalAuth) {
  console.warn('Supabase Auth is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.')
}


function clearLegacyPersistedAuth() {
  try {
    localStorage.removeItem('katala-auth-v1')
    localStorage.removeItem('katala-auth-v2')

    const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
    if (projectRef) {
      localStorage.removeItem(`sb-${projectRef}-auth-token`)
    }
  } catch {

  }
}

clearLegacyPersistedAuth()

const configurationError = () => ({
  data: { session: null, user: null },
  error: new Error('Authentication is not configured. Add the Supabase environment variables to use account features.'),
})

const unavailableAuth = {
  getSession: async () => ({ data: { session: null }, error: null }),
  onAuthStateChange: () => ({
    data: { subscription: { unsubscribe() {} } },
  }),
  signUp: async () => configurationError(),
  signInWithPassword: async () => configurationError(),
  signOut: async () => ({ error: null }),
  updateUser: async () => configurationError(),
  resend: async () => configurationError(),
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        // Do not save access/refresh tokens to localStorage.
        persistSession: false,

        // Keep an active in-memory session refreshed while this page is open.
        autoRefreshToken: true,

        // Keep support for Supabase email-confirmation callbacks.
        detectSessionInUrl: true,
      },
    })
  : { auth: unavailableAuth }
