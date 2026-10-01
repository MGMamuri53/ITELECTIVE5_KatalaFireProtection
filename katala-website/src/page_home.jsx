import { useEffect, useState } from 'react'
import { Nav, Footer } from './components'
import { company, serviceLines } from './data/company'
import { getStoredSession } from './services/katalaApi'
import hero from './assets/pictures/building-auth-enhanced.png'
import project from './assets/pictures/project-industrial-enhanced.png'
import shield from './assets/icons/shield.png'
import extinguisher from './assets/icons/fire-extinguisher.png'
import setting from './assets/icons/setting.png'

const portalFeatures = ['Submit quotation requests', 'Request fire protection services', 'Keep project and request details organized', 'Access your customer account']

export default function Home() {
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
    <div className="landing-page">
      <Nav />
      <main>
        <section className="landing-hero">
          <div className="shell landing-hero-grid">
            <div className="landing-hero-copy">
              <span className="eyebrow">KATALA FIRE PROTECTION PRODUCT TRADING</span>
              <h1>Fire Protection Solutions You Can Rely On</h1>
              <p>Explore dependable fire protection products and service support, then use the Katala Client Portal to submit quotations and service requests in one organized place.</p>
              <div className="hero-actions landing-actions">
                {!session?.token ? (
                  <>
                    <a className="btn primary" href="#signup">Create an Account <span aria-hidden="true">→</span></a>
                    <a className="btn secondary" href="#signin">Sign In to Client Portal</a>
                  </>
                ) : (
                  <a className="btn primary" href="#products">Request a Quotation <span aria-hidden="true">→</span></a>
                )}
              </div>
              <div className="landing-assurance"><span>Products</span><span>Service support</span><span>Customer portal</span></div>
            </div>
            <div className="landing-hero-media">
              <img src={hero} alt="Katala fire protection system installation" />
              <div className="hero-media-panel"><strong>Protection starts with the right solution.</strong><span>Product supply, project support, and preventive maintenance.</span></div>
            </div>
          </div>
        </section>

        <section className="landing-intro" id="about">
          <div className="shell landing-intro-grid">
            <div><span className="eyebrow">ABOUT KATALA</span><h2>Practical fire protection support for real facilities.</h2></div>
            <div><p>Katala Fire Protection Product Trading supports commercial and institutional fire-safety requirements through fire protection products, system services, and project-based assistance.</p><a className="text-link" href="#company">Learn more about Katala →</a></div>
          </div>
        </section>

        <section className="section landing-solutions" id="solutions">
          <div className="shell">
            <div className="section-heading landing-heading"><span className="eyebrow">PRODUCTS &amp; SOLUTIONS</span><h2>Fire protection for every stage of your requirement.</h2><p>From equipment selection to installation and maintenance support, Katala helps customers identify an appropriate next step.</p></div>
            <div className="landing-solution-grid">
              {serviceLines.slice(0, 6).map((item, index) => (
                <article className="landing-solution-card" key={item.title}>
                  <span className="solution-index">{String(index + 1).padStart(2, '0')}</span><h3>{item.title}</h3><p>{item.copy}</p>
                  <a href={index === 0 ? '#products' : '#services'}>Explore {index === 0 ? 'products' : 'services'} →</a>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section landing-why">
          <div className="shell landing-why-grid">
            <div className="landing-project-image"><img src={project} alt="Katala fire protection project work" /></div>
            <div className="landing-why-copy">
              <span className="eyebrow">WHY KATALA</span><h2>Clear support from inquiry to project request.</h2>
              <p>Katala brings product information, service support, and customer requests together so your fire protection requirement can be reviewed with the right context.</p>
              <div className="why-list">
                <div><img src={extinguisher} alt="" /><span><strong>Focused solutions</strong>Products and services centered on fire protection needs.</span></div>
                <div><img src={setting} alt="" /><span><strong>Service support</strong>Assistance for installation, systems, and preventive maintenance.</span></div>
                <div><img src={shield} alt="" /><span><strong>Organized requests</strong>A dedicated customer portal for quotations and service details.</span></div>
              </div>
            </div>
          </div>
        </section>

        <section className="section portal-section" id="portal">
          <div className="shell portal-card">
            <div className="portal-card-copy"><span className="eyebrow">KATALA CLIENT PORTAL</span><h2>Your requests, kept in one place.</h2><p>{!session?.token ? 'Create a customer account to send Katala the information needed to review your quotation or service requirement.' : 'Manage your quotations, service requests, and profile details all in one organized place.'}</p><div className="hero-actions">{!session?.token ? <><a className="btn primary" href="#signup">Create an Account</a><a className="btn portal-secondary" href="#signin">Sign In</a></> : <><a className="btn primary" href="#profile">Go to Profile</a><a className="btn portal-secondary" href="#products">View Catalog</a></>}</div></div>
            <ul className="portal-feature-list">{portalFeatures.map((feature) => <li key={feature}><span aria-hidden="true">✓</span>{feature}</li>)}</ul>
          </div>
        </section>

        <section className="landing-contact">
          <div className="shell landing-contact-inner"><div><span className="eyebrow">TALK TO KATALA</span><h2>Need help with a fire protection requirement?</h2></div><div className="landing-contact-actions"><a className="landing-contact-actions" href={`mailto:${company.email}`}>{company.email}</a><a className="landing-contact-actions" href={`tel:${company.phone.replace(/[^\d+]/g, '')}`}>{company.phone}</a></div></div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
