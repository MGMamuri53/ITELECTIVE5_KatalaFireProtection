import { useEffect, useRef, useState } from 'react'
import KatalaBrand from './KatalaBrand'
import { company } from './data/company'
import { authApi, getStoredSession } from './services/katalaApi'

const navItems = [
  ['products', 'Products'],
  ['services', 'Services'],
  ['portfolio', 'Projects'],
  ['company', 'Company'],
]

export function Nav({ active = '' }) {
  const [open, setOpen] = useState(false)
  const [session, setSession] = useState(() => getStoredSession())

  useEffect(() => {
    const sync = () => setSession(getStoredSession())
    window.addEventListener('katala-auth-changed', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('katala-auth-changed', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  async function signOut() {
    await authApi.signout().catch(() => {})
    setOpen(false)
    location.hash = 'home'
  }

  return (
    <header className="site-nav">
      <div className="shell nav-inner">
        <a className="brand" href="#home" onClick={() => setOpen(false)} aria-label="Katala home">
          <KatalaBrand compact />
        </a>
        <nav className={`nav-links ${open ? 'open' : ''}`} aria-label="Primary navigation">
          {navItems.map(([id, label]) => (
            <a key={id} className={active === id ? 'active' : ''} href={`#${id}`} onClick={() => setOpen(false)}>
              {label}
            </a>
          ))}
          {session?.token ? (
            <AccountMenu className="mobile-account" session={session} onSignOut={signOut} onNavigate={() => setOpen(false)} />
          ) : (
            <>
              <a className="mobile-account" href="#signin" onClick={() => setOpen(false)}>Sign in</a>
              <a className="mobile-account mobile-create" href="#signup" onClick={() => setOpen(false)}>Create Account</a>
            </>
          )}
        </nav>
        <a className="nav-quote" href={session?.token ? '#products' : '#signup'}>{session?.token ? 'Request Quote' : 'Create Account'}</a>
        {session?.token ? (
          <AccountMenu className="desktop-account" session={session} onSignOut={signOut} />
        ) : (
          <a className="nav-signin desktop-account" href="#signin">Sign in</a>
        )}
        <button className="menu-toggle" type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Toggle menu">
          <span /><span /><span />
        </button>
      </div>
    </header>
  )
}

function AccountMenu({ className = '', session, onSignOut, onNavigate }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const accountName = session.user?.name || session.user?.email || 'Account'
  const role = session.user?.role || 'customer'

  useEffect(() => {
    function closeFromOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) setOpen(false)
    }

    document.addEventListener('mousedown', closeFromOutside)
    return () => document.removeEventListener('mousedown', closeFromOutside)
  }, [])

  function navigate() {
    setOpen(false)
    onNavigate?.()
  }

  async function signOut() {
    setOpen(false)
    await onSignOut()
  }

  return (
    <div className={`account-menu ${className}`} ref={menuRef}>
      <button
        className="nav-account-trigger"
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={session.user?.email || 'Signed in'}
      >
        <span className="account-avatar" aria-hidden="true">{accountName.charAt(0).toUpperCase()}</span>
        <span className="account-trigger-label">{accountName}</span>
        <span className="account-caret" aria-hidden="true">▾</span>
      </button>
      <div className={`account-dropdown ${open ? 'open' : ''}`} role="menu">
        <a href="#profile" role="menuitem" onClick={navigate}>Profile</a>
        {role === 'admin' && <a href="#admin" role="menuitem" onClick={navigate}>Admin page</a>}
        {(role === 'staff' || role === 'admin') && <a href="#staff-work-queue" role="menuitem" onClick={navigate}>Staff portal</a>}
        <button type="button" role="menuitem" onClick={signOut}>Sign out</button>
      </div>
    </div>
  )
}

export function Footer() {
  const [session, setSession] = useState(() => getStoredSession())

  useEffect(() => {
    const sync = () => setSession(getStoredSession())
    window.addEventListener('katala-auth-changed', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('katala-auth-changed', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  return (
    <footer className="site-footer">
      <div className="shell footer-grid">
        <div>
          <KatalaBrand light />
          <p className="footer-tagline">{company.tagline}</p>
          <p className="muted">Fire protection products, system support, and maintenance services for facility requirements.</p>
        </div>
        <div>
          <h4>Quick Links</h4>
          <a href="#home">Home</a>
          <a href="#company">About</a>
          <a href="#products">Products / Services</a>
          <a href={session?.token ? '#profile' : '#signin'}>{session?.token ? 'Profile' : 'Client Portal'}</a>
        </div>
        <div>
          <h4>Contact Information</h4>
          <span>Greenbreeze Village 1, Langkaan</span>
          <span>Dasmariñas City, Cavite</span>
          <a href={`mailto:${company.email}`}>{company.email}</a>
          <a href={`tel:${company.phone.replace(/[^\d+]/g, '')}`}>Tel: {company.phone}</a>
          <a href="tel:09606819547">Mobile: 09606819547</a>
        </div>
      </div>
      <div className="shell footer-bottom">© {new Date().getFullYear()} {company.legalName}</div>
    </footer>
  )
}

export function PageIntro({ eyebrow, title, children }) {
  return (
    <section className="page-intro">
      <div className="shell narrow">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        <p>{children}</p>
      </div>
    </section>
  )
}

export function InfoNote({ title = 'Helpful note', children }) {
  return <div className="info-note"><strong>{title}</strong><span>{children}</span></div>
}
