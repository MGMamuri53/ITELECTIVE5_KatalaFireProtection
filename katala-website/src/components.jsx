import { useEffect, useState } from 'react'
import logo from './assets/icons/fire.png'
import { company } from './data/company'
import { authApi, getStoredSession } from './services/katalaApi'

export const navItems = [
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
          <img src={logo} alt="Katala Fire Protection Product Trading" />
        </a>
        <nav className={`nav-links ${open ? 'open' : ''}`} aria-label="Primary navigation">
          {navItems.map(([id, label]) => (
            <a key={id} className={active === id ? 'active' : ''} href={`#${id}`} onClick={() => setOpen(false)}>
              {label}
            </a>
          ))}
          {session?.token ? (
            <button className="nav-account-action mobile-account" type="button" onClick={signOut}>Sign out</button>
          ) : (
            <a className="mobile-account" href="#signin" onClick={() => setOpen(false)}>Sign in</a>
          )}
        </nav>
        <a className="nav-quote" href="#products">Request Quote</a>
        {session?.token ? (
          <button className="nav-account-action desktop-account" type="button" onClick={signOut} title={session.user?.email || 'Signed in'}>Sign out</button>
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

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="shell footer-grid">
        <div>
          <img className="footer-logo" src={logo} alt="Katala Fire Protection Product Trading" />
          <p>{company.tagline}</p>
          <p className="muted">Fire protection products, systems support, and maintenance services for commercial and institutional requirements.</p>
        </div>
        <div>
          <h4>Navigate</h4>
          <a href="#products">Products</a>
          <a href="#services">Services</a>
          <a href="#portfolio">Projects</a>
          <a href="#company">Company Profile</a>
        </div>
        <div>
          <h4>Contact</h4>
          <a href={`mailto:${company.email}`}>{company.email}</a>
          <a href={`tel:${company.phone.replace(/[^\d+]/g, '')}`}>{company.phone}</a>
          <span>{company.address}</span>
          <span>Facebook: {company.facebook}</span>
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