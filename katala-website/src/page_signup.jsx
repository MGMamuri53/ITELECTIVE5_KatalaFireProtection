import { useMemo, useState } from 'react'
import building from './assets/pictures/download.jpg'
import fire from './assets/icons/fire.png'
import shield from './assets/icons/shield.png'
import { authApi } from './services/katalaApi'
import './signup.css'

const initialForm = {
  firstName: '',
  lastName: '',
  email: '',
  contactNumber: '',
  password: '',
  confirmPassword: '',
  accountType: 'customer',
  companyName: '',
  jobTitle: '',
  industry: '',
  companyAddress: '',
}

function sanitizeMobileInput(value) {
  let cleaned = String(value || '').replace(/[^\d+]/g, '')
  if (cleaned.startsWith('+')) cleaned = `+${cleaned.slice(1).replace(/\+/g, '')}`
  else cleaned = cleaned.replace(/\+/g, '')
  return cleaned.slice(0, 13)
}

function isValidPhilippineMobile(value) {
  const mobile = sanitizeMobileInput(value)
  return /^09\d{9}$/.test(mobile) || /^\+639\d{9}$/.test(mobile)
}

function normalizePhilippineMobile(value) {
  const mobile = sanitizeMobileInput(value)
  return /^09\d{9}$/.test(mobile) ? `+63${mobile.slice(1)}` : mobile
}

export default function Signup() {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState(initialForm)
  const [status, setStatus] = useState({ type: 'idle', message: '' })
  const [verificationSent, setVerificationSent] = useState(false)

  const passwordReady = useMemo(
    () => form.password.length >= 8 && /[A-Za-z]/.test(form.password) && /\d/.test(form.password),
    [form.password],
  )

  function update(e) {
    const { name } = e.target
    const value = name === 'contactNumber' ? sanitizeMobileInput(e.target.value) : e.target.value
    setForm((current) => ({ ...current, [name]: value }))
    if (status.type === 'error') setStatus({ type: 'idle', message: '' })
  }

  function validateStepOne() {
    if (!form.firstName.trim() || !form.lastName.trim()) return 'Enter your first and last name.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'Enter a valid email address.'
    if (!form.contactNumber.trim()) return 'Enter your mobile number.'
    if (!isValidPhilippineMobile(form.contactNumber)) return 'Enter a valid Philippine mobile number, such as 09171234567 or +639171234567.'
    if (!passwordReady) return 'Use at least 8 characters with at least one letter and one number.'
    if (form.password !== form.confirmPassword) return 'Passwords do not match.'
    return ''
  }

  async function submit(e) {
    e.preventDefault()
    if (status.type === 'loading') return

    if (step === 1) {
      const error = validateStepOne()
      if (error) return setStatus({ type: 'error', message: error })
      setStatus({ type: 'idle', message: '' })
      setStep(2)
      return
    }

    setStatus({ type: 'loading', message: 'Creating your account...' })
    try {
      const result = await authApi.signup({
        accountType: form.accountType,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim().toLowerCase(),
        contactNumber: normalizePhilippineMobile(form.contactNumber),
        password: form.password,
        companyName: form.companyName.trim(),
        jobTitle: form.jobTitle.trim(),
        industry: form.industry.trim(),
        companyAddress: form.companyAddress.trim(),
      })

      sessionStorage.setItem('katala-signin-email', form.email.trim().toLowerCase())

      if (result.requiresEmailConfirmation) {
        setVerificationSent(true)
        setStatus({
          type: 'success',
          message: result.requiresApproval
            ? `We sent a verification link to ${form.email.trim()}. After verification, wait for an administrator to approve staff access.`
            : `We sent a verification link to ${form.email.trim()}. Verify your email before signing in.`,
        })
      } else {
        if (result.requiresApproval) {
          setVerificationSent(true)
          setStatus({ type: 'success', message: 'Your staff account was submitted for administrator approval.' })
        } else {
          setStatus({ type: 'success', message: 'Your account is ready.' })
          location.hash = 'home'
        }
      }
    } catch (error) {
      const raw = String(error?.message || '')
      const message = /already registered|already exists|user already/i.test(raw)
        ? 'An account may already exist for this email address. Try signing in instead.'
        : raw || 'Unable to create your account.'
      setStatus({ type: 'error', message })
    }
  }

  async function resendVerification() {
    if (status.type === 'loading') return
    setStatus({ type: 'loading', message: 'Sending another verification email...' })
    try {
      await authApi.resendVerification(form.email.trim().toLowerCase())
      setStatus({ type: 'success', message: `A new verification email was sent to ${form.email.trim()}.` })
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to resend the verification email.' })
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-visual" style={{ backgroundImage: `url(${building})` }}>
        <div className="visual-copy">
          <div className="auth-brand"><img src={fire} alt="" />Katala Client Portal</div>
          <p>Fire protection support, quotations, and service requests in one place.</p>
          <div className="portal-note">
            <img src={shield} alt="" />
            <div>
              <strong>Customer account access</strong>
              <span>Use one verified account to submit quotation requests, request services, and keep your project details consistent.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="auth-form-side">
        <div className="signup-box">
          <a className="auth-home" href="#home">← Back to website</a>

          {verificationSent ? (
            <>
              <div className="auth-step-label">EMAIL VERIFICATION</div>
              <h1>Check your email</h1>
              <p className="auth-intro">
                {form.accountType === 'staff'
                  ? 'Your staff account request has been received. Verify your email, then wait for an administrator to approve staff portal access.'
                  : 'Your account has been created. Open the verification email from Katala and confirm your address before using the client portal.'}
              </p>
              <div className="signin-divider" />
              <div className="privacy">
                <img src={shield} alt="" />
                <span>Verification protects your account and prevents someone else from registering with your email address.</span>
              </div>
              {status.type !== 'idle' && <div className={`auth-status ${status.type}`} role="status">{status.message}</div>}
              <button className="continue" type="button" onClick={() => { location.hash = 'signin' }}>Go to sign in <span aria-hidden="true">→</span></button>
              <button className="back-button verification-resend" type="button" onClick={resendVerification} disabled={status.type === 'loading'}>Resend verification email</button>
            </>
          ) : (
            <>
              <div className="auth-step-label">STEP {step} OF 2</div>
              <h1>{step === 1 ? 'Create your account' : 'Tell us about your organization'}</h1>
              <p className="auth-intro">
                {step === 1
                  ? 'Set up secure access for quotation and service requests.'
                  : 'These details help Katala understand who the request is for. Optional fields can be completed later when applicable.'}
              </p>
              <div className={`progress step-${step}`} aria-label={`Registration step ${step} of 2`}><span /><span /></div>

              <form onSubmit={submit}>
                {step === 1 ? (
                  <>
                    <div className="form-row">
                      <Field label="First name" name="firstName" value={form.firstName} onChange={update} autoComplete="given-name" required />
                      <Field label="Last name" name="lastName" value={form.lastName} onChange={update} autoComplete="family-name" required />
                    </div>
                    <Field label="Email address" name="email" type="email" value={form.email} onChange={update} autoComplete="email" placeholder="name@company.com" required />
                    <label className="field">
                      <span>Account type</span>
                      <select name="accountType" value={form.accountType} onChange={update}>
                        <option value="customer">Customer</option>
                        <option value="staff">Staff</option>
                      </select>
                    </label>
                    <p className="password-hint">Administrator accounts cannot be created from public signup. Admins can promote accounts after sign up.</p>
                    <Field
                      label="Mobile number"
                      name="contactNumber"
                      type="tel"
                      value={form.contactNumber}
                      onChange={update}
                      autoComplete="tel"
                      inputMode="tel"
                      maxLength={13}
                      pattern="(?:09[0-9]{9}|\+639[0-9]{9})"
                      title="Enter a valid Philippine mobile number: 09171234567 or +639171234567"
                      placeholder="09171234567 or +639171234567"
                      required
                    />
                    <p className="password-hint">Use 11 digits starting with 09, or the +63 format.</p>
                    <div className="form-row">
                      <PasswordField label="Password" name="password" value={form.password} onChange={update} autoComplete="new-password" required />
                      <PasswordField label="Confirm password" name="confirmPassword" value={form.confirmPassword} onChange={update} autoComplete="new-password" required />
                    </div>
                    <p className={`password-hint ${passwordReady ? 'ready' : ''}`}>Minimum 8 characters, including at least one letter and one number.</p>
                  </>
                ) : (
                  <>
                    <Field label="Company / organization" name="companyName" value={form.companyName} onChange={update} autoComplete="organization" placeholder="Company or organization name" />
                    <div className="form-row">
                      <Field label="Job title" name="jobTitle" value={form.jobTitle} onChange={update} autoComplete="organization-title" placeholder="e.g. Facility Engineer" />
                      <Field label="Industry" name="industry" value={form.industry} onChange={update} placeholder="e.g. Commercial" />
                    </div>
                    <Field label="Company address" name="companyAddress" value={form.companyAddress} onChange={update} autoComplete="street-address" placeholder="Business or project office address" />
                  </>
                )}

                <div className="privacy">
                  <img src={shield} alt="" />
                  <span>Your password is handled by Supabase Auth and is never stored in the Katala profile table.</span>
                </div>

                {status.type !== 'idle' && <div className={`auth-status ${status.type}`} role="status">{status.message}</div>}

                <div className="auth-actions">
                  {step === 2 && <button className="back-button" type="button" onClick={() => { setStep(1); setStatus({ type: 'idle', message: '' }) }}>Back</button>}
                  <button className="continue" type="submit" disabled={status.type === 'loading'}>
                    {status.type === 'loading' ? 'Creating account...' : step === 1 ? 'Continue' : 'Create account'}
                    {status.type !== 'loading' && <span aria-hidden="true">→</span>}
                  </button>
                </div>
              </form>
            </>
          )}

          <p className="signin-link">Already have an account? <a href="#signin">Sign in</a></p>
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
