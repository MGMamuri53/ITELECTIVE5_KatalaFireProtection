import {Nav,Footer} from './components'
import sprinkler from './assets/icons/robotic-arm.png'
import alarm from './assets/icons/signal.png'
import suppression from './assets/icons/water-system.png'
import './services_overrides.css'

const services=[
  [sprinkler,'Sprinkler System Installation','End-to-end design and installation of automatic fire sprinkler networks compliant with NFPA 13 and local BFP regulations.','Site Inspection Required',''],
  [alarm,'Fire Alarm & Detection','Deployment of addressable and conventional fire alarm panels, integrating smoke, heat, and multi-sensor detectors.','Site Assessment Prior',''],
  [suppression,'Suppression Systems','Installation of clean agent, FM-200, and kitchen hood fire suppression systems for critical environments and data centers.','Standard Compliance Ready','ready']
]

export default function Services(){return <><Nav active="services"/><main className="shell services"><h1 className="section-title" style={{fontSize:29}}>Professional Fire Protection<br/>Services</h1><p className="section-copy">Comprehensive life-safety solutions engineered for maximum reliability and BFP compliance. From precision installation to rigorous preventive maintenance.</p><div className="tabs"><span className="active">Installation</span><span>Inspection</span><span>Testing</span><span>Repair</span><span>Preventive Maintenance</span></div><div className="cards service-cards">{services.map(([icon,title,copy,badge,state])=><article className="service-card" key={title}><div className="service-title"><img src={icon} alt=""/><h3>{title}</h3></div><p>{copy}</p><div className={'service-badge '+state}>{state==='ready'?'✓':'▣'}&nbsp; {badge}</div><button>View Details &nbsp;&rarr;</button></article>)}</div><div className="cta"><div><h3>Ensure Total Compliance</h3><p>Schedule a consultation with our certified safety engineers to evaluate your facility's fire protection infrastructure.</p></div><button className="btn-red">Book Engineering Consult</button></div></main><Footer/></>}
