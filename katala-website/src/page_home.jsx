import { Nav, Footer, InfoNote } from './components'
import { company, serviceLines } from './data/company'
import hero from './assets/icons/fire.png'
import project from './assets/icons/signal.png'

export default function Home() {
  return (
    <>
      <Nav />
      <main>
        <section className="home-hero">
          <div className="shell hero-grid">
            <div className="hero-copy">
              <span className="eyebrow">FIRE PROTECTION PRODUCT TRADING</span>
              <h1>Practical fire protection for real facilities.</h1>
              <p>{company.tagline} Katala supports product supply, fire alarm work, sprinkler systems, pump installations, and preventive maintenance for facility requirements.</p>
              <div className="hero-actions">
                <a className="btn primary" href="#products">Browse Products</a>
                <a className="btn secondary" href="#services">Explore Services</a>
              </div>
              <div className="hero-contact">
                <span>{company.phone}</span>
                <span>{company.email}</span>
              </div>
            </div>
            <div className="hero-media">
              <img src={hero} alt="Katala fire protection equipment" />
              <div className="media-caption">Fire protection products and project support</div>
            </div>
          </div>
        </section>

        <section className="trust-strip">
          <div className="shell trust-grid">
            <div><strong>2022</strong><span>Family-owned business roots</span></div>
            <div><strong>Cavite</strong><span>Based in Dasmariñas</span></div>
            <div><strong>Products</strong><span>Fire protection equipment and accessories</span></div>
            <div><strong>Services</strong><span>Systems, installation, and maintenance support</span></div>
          </div>
        </section>

        <section className="section">
          <div className="shell">
            <div className="section-heading split-heading">
              <div>
                <span className="eyebrow">WHAT KATALA OFFERS</span>
                <h2>Fire protection products and service support</h2>
              </div>
              <p>Choose the service area that matches your facility requirement, then send Katala the project details for review.</p>
            </div>
            <div className="service-grid compact">
              {serviceLines.map((item, index) => (
                <article className="service-tile" key={item.title}>
                  <span className="service-number">{String(index + 1).padStart(2, '0')}</span>
                  <h3>{item.title}</h3>
                  <p>{item.copy}</p>
                  <small>{item.proof}</small>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section surface">
          <div className="shell evidence-grid">
            <img src={project} alt="Fire alarm system project" />
            <div>
              <span className="eyebrow">PROJECT EXPERIENCE</span>
              <h2>See examples of Katala’s completed project work.</h2>
              <p>Browse selected fire alarm, preventive maintenance, and fire pump projects completed for commercial and institutional clients.</p>
              <a className="text-link" href="#portfolio">View projects →</a>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="shell">
            <InfoNote title="Need a quotation or service review?">
              Create a customer account, add the products you need to a quotation cart, or submit a service request with your project details.
            </InfoNote>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}