import { useState } from 'react'
import building from './assets/pictures/download.jpg'
import fire from './assets/icons/fire.png'
import shield from './assets/icons/shield.png'
import { authApi } from './services/katalaApi'
import './signup.css'

function initialEmail() {
  return sessionStorage.getItem('katala-signin-email') || ''
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
      const defaultPage = data.user?.role === 'admin'
        ? 'admin'
        : data.user?.role === 'staff'
          ? 'staff-work-queue'
          : 'profile'
      const returnPage = sessionStorage.getItem('katala-return-after-auth') || defaultPage
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
      } else if (error instanceof TypeError) {
        message = 'Unable to connect to Supabase Auth. Please check your internet connection and try again.'
      }
      setStatus({ type: 'error', message })
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-visual" style={{ backgroundImage: `url(${building})` }}>
        <div className="visual-copy">
          <div className="auth-brand"><img src={fire} alt="" />Katala Client Portal</div>
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
