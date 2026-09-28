import { useState } from 'react'
import building from './assets/pictures/download.jpg'
import shield from './assets/icons/shield.png'
import KatalaBrand from './KatalaBrand'
import { authApi } from './services/katalaApi'
import './signup.css'

function initialEmail() {
  return sessionStorage.getItem('katala-signin-email') || ''
}

const staffRoutes = new Set(['staff', 'staff-work-queue', 'staff-messages', 'staff-paid-assignments', 'staff-service-calendar', 'staff-maintenance', 'staff-completed', 'staff-settings'])

function defaultPageForRole(role) {
  if (role === 'admin') return 'admin'
  if (role === 'staff') return 'staff-work-queue'
  return 'profile'
}

function canAccessReturnPage(page, role) {
  if (page === 'admin') return role === 'admin'
  if (staffRoutes.has(page)) return role === 'staff' || role === 'admin'
  if (page === 'profile') return true // any authenticated role can view their profile
  return true
}

export default function Signin() {
  const [form, setForm] = useState(() => ({ email: initialEmail(), password: '', portal: 'customer' }))
  const [status, setStatus] = useState({ type: 'idle', message: '' })

  function update(e) {
    setForm((current) => ({ ...current, [e.target.name]: e.target.value }))
    if (status.type === 'error') setStatus({ type: 'idle', message: '' })
  }

  async function submit(e) {
    e.preventDefault()
    if (status.type === 'loading') return

    const email = form.email.trim().toLowerCase()
    if (!email || !form.password) {
      setStatus({ type: 'error', message: 'Enter your email address and password.' })
      return
    }

    setStatus({ type: 'loading', message: 'Signing you in...' })

    sessionStorage.setItem('katala-login-in-progress', '1')

    try {
      const data = await authApi.signin({ email, password: form.password, portal: form.portal })
      sessionStorage.removeItem('katala-signin-email')
      const role = data.user?.role || 'customer'
      const defaultPage = defaultPageForRole(role)
      const savedReturnPage = role === 'admin'
        ? defaultPage
        : sessionStorage.getItem('katala-return-after-auth') || defaultPage
      const returnPage = canAccessReturnPage(savedReturnPage, role) ? savedReturnPage : defaultPage
      sessionStorage.removeItem('katala-return-after-auth')
      sessionStorage.removeItem('katala-login-in-progress')
      location.hash = returnPage
    } catch (error) {
      sessionStorage.removeItem('katala-login-in-progress')
      const raw = String(error?.message || '')
      let message = raw || 'Unable to sign in.'
      if (/email not confirmed|not confirmed/i.test(raw)) {
        message = 'Verify your email first. Open the verification message sent to your email address, then sign in again.'
      } else if (/invalid login credentials|invalid credentials/i.test(raw)) {
        message = 'Incorrect email address or password.'
      } else if (/supabase rejected|database credentials|28P01/i.test(raw)) {
        message = 'The portal database is not accepting the configured server credentials yet. Please ask the administrator to update SUPABASE_DB_URL, then try again.'
      } else if (error instanceof TypeError) {
        message = 'Unable to connect to the local API. Please check that the API server and database are running.'
      }
      setStatus({ type: 'error', message })
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-visual" style={{ backgroundImage: `url(${building})` }}>
        <div className="visual-copy">
          <div className="auth-brand"><KatalaBrand light compact /></div>
          <p>Access your quotation and service request tools.</p>
          <div className="portal-note">
            <img src={shield} alt="" />
            <div>
              <strong>Verified customer access</strong>
              <span>Sign in with your verified email so quotation and service requests are linked to the correct customer account.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="auth-form-side">
        <div className="signup-box signin-box">
          <a className="auth-home" href="#home">Back to website</a>
          <div className="auth-step-label">CLIENT PORTAL</div>
          <h1>Welcome back</h1>
          <p className="auth-intro">Sign in with your verified email address to continue.</p>
          <div className="signin-divider" />

          <form onSubmit={submit}>
            <label className="field">
              <span>Sign in as</span>
              <select name="portal" value={form.portal} onChange={update}>
                <option value="customer">Customer</option>
                <option value="staff">Staff</option>
                <option value="admin">Administrator</option>
              </select>
            </label>
            <Field label="Email address" name="email" type="email" value={form.email} onChange={update} autoComplete="email" placeholder="name@company.com" required />
            <PasswordField label="Password" name="password" value={form.password} onChange={update} autoComplete="current-password" required />

            <div className="auth-status-slot">
              {status.type !== 'idle' && <div className={`auth-status ${status.type}`} role="status">{status.message}</div>}
            </div>

            <button className="continue" type="submit" disabled={status.type === 'loading'}>
              {status.type === 'loading' ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
          <p className="signin-link">Need an account? <a href="#signup">Create one</a></p>
        </div>
      </section>
    </main>
  )
}

function Field({ label, ...props }) {
  return <label className="field"><span>{label}</span><input {...props} /></label>
}

function PasswordField({ label, ...props }) {
  const [visible, setVisible] = useState(false)

  return (
    <label className="field">
      <span>{label}</span>
      <div className="password-input-wrap">
        <input {...props} type={visible ? 'text' : 'password'} />
        <button
          className="password-toggle"
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          title={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </label>
  )
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.4 12s3.5-6 9.6-6 9.6 6 9.6 6-3.5 6-9.6 6-9.6-6-9.6-6Z" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 3l18 18" />
      <path d="M10.6 6.2A9.6 9.6 0 0 1 12 6c6.1 0 9.6 6 9.6 6a15.7 15.7 0 0 1-3 3.6" />
      <path d="M6.4 7.1C3.8 9 2.4 12 2.4 12s3.5 6 9.6 6a9.8 9.8 0 0 0 3.1-.5" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  )
}
