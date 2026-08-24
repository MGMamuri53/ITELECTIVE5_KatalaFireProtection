import { useMemo, useState } from 'react'
import { Nav, Footer, PageIntro, InfoNote } from './components'
import { documentedProjects, listedProjects } from './data/company'
import siayan from './assets/pictures/8baaccb3-b8f6-4890-8e85-034c34b7eca6.jpg'
import puregold from './assets/pictures/94423466-9af4-4ef6-a238-a24c98a65c1e.jpg'
import builders from './assets/pictures/download (1).jpg'
import batstate from './assets/pictures/f112a358-799d-4b1f-be1f-d40d1e4e8c2c.jpg'

const images = { 'siayan-alarm.jpg': siayan, 'puregold-maintenance.jpg': puregold, '721-pump.jpg': builders, 'batstate-pump.jpg': batstate }

export default function Portfolio() {
  const categories = ['All', ...new Set(documentedProjects.map((p) => p.category))]
  const [category, setCategory] = useState('All')
  const shown = useMemo(() => documentedProjects.filter((p) => category === 'All' || p.category === category), [category])

  return (
    <>
      <Nav active="portfolio" />
      <main>
        <PageIntro eyebrow="PROJECT EXPERIENCE" title="Selected fire protection projects">
          Explore examples of Katala’s work across fire alarm systems, preventive maintenance, and fire pump installation or testing support.
        </PageIntro>
        <section className="section">
          <div className="shell">
            <div className="filter-row">
              {categories.map((item) => <button key={item} type="button" className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}
            </div>
            <div className="project-grid-authentic">
              {shown.map((project) => (
                <article className="project-card-authentic" key={project.id}>
                  <img src={images[project.image]} alt={`${project.scope} - ${project.client}`} />
                  <div className="project-body">
                    <span className="project-category">{project.category}</span>
                    <h2>{project.client}</h2>
                    <p className="project-scope">{project.scope}</p>
                    <p className="muted">{project.location}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section surface">
          <div className="shell">
            <div className="section-heading">
              <span className="eyebrow">MORE PROJECTS</span>
              <h2>Additional project experience</h2>
              <p>Examples include wet standpipe, sprinkler, fire alarm, and related fire protection system work across multiple locations.</p>
            </div>
            <div className="project-list-table" role="table" aria-label="Additional Katala projects">
              <div className="project-list-head" role="row"><span>Client / Project</span><span>Location</span><span>Scope</span></div>
              {listedProjects.map(([name, location, scope]) => (
                <div className="project-list-row" role="row" key={`${name}-${location}`}><strong>{name}</strong><span>{location}</span><span>{scope}</span></div>
              ))}
            </div>
            <InfoNote title="Planning a similar project?">
              Send Katala your project location, intended scope, and preferred schedule through the Services page so the team can review your requirement.
            </InfoNote>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}