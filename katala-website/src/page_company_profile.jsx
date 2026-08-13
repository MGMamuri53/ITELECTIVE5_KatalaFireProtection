import { Nav, Footer, PageIntro, InfoNote } from './components'
import { company, registrationNotes } from './data/company'

export default function Company() {
  return (
    <>
      <Nav active="company" />
      <main>
        <PageIntro eyebrow="COMPANY PROFILE" title="A family-owned fire protection business serving facility needs">
          Katala began as a family-owned business in 2022 in Dasmariñas, Cavite, guided by the purpose “Your Protection Is Our Concern.”
        </PageIntro>

        <section className="section">
          <div className="shell company-story-grid">
            <div>
              <span className="eyebrow">OUR STORY</span>
              <h2>Local fire protection support with a practical service approach</h2>
            </div>
            <div className="prose">
              <p>Katala Fire Protection Product Trading supports customers through fire protection product supply, system-related services, project work, and preventive maintenance.</p>
              <p>The business focuses on responsive customer support, product quality, repeat business, and long-term client relationships while continuing to expand its project experience.</p>
            </div>
          </div>
        </section>

        <section className="section surface">
          <div className="shell mission-grid">
            <article className="statement-card">
              <span className="eyebrow">VISION</span>
              <h2>Grow into a trusted fire protection brand for homes, facilities, and industry.</h2>
              <p>Katala aims to expand its reach while building recognition for dependable fire protection products and services.</p>
            </article>
            <article className="statement-card">
              <span className="eyebrow">MISSION</span>
              <h2>Provide safety, security, and service through quality fire protection solutions.</h2>
              <p>The company supports customers through product supply, project coordination, and fire protection service work.</p>
            </article>
          </div>
        </section>

        <section className="section">
          <div className="shell">
            <div className="section-heading">
              <span className="eyebrow">BUSINESS REGISTRATION</span>
              <h2>Registration information</h2>
              <p>Key business registration documents can be reviewed as part of supplier accreditation or procurement requirements.</p>
            </div>
            <div className="registration-grid">
              {registrationNotes.map((item) => <article key={item.title}><h3>{item.title}</h3><p>{item.detail}</p></article>)}
            </div>
            <InfoNote title="For procurement and accreditation">
              Request the latest business permit, registration documents, and any project-specific technical certificates directly from Katala before final supplier approval.
            </InfoNote>
          </div>
        </section>

        <section className="section contact-section">
          <div className="shell contact-panel">
            <div><span className="eyebrow">CONTACT</span><h2>Talk directly with Katala</h2><p>{company.address}</p></div>
            <div className="contact-actions"><a className="btn primary" href={`mailto:${company.email}`}>{company.email}</a><a className="btn secondary" href={`tel:${company.phone.replace(/[^\d+]/g, '')}`}>{company.phone}</a></div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}