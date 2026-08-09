import {Nav,Footer,Card} from './components'
import hero from './assets/pictures/download (1).jpg'
import verified from './assets/icons/verified.png'
import setting from './assets/icons/setting.png'
import security from './assets/icons/security.png'
import chat from './assets/icons/live-chat.png'
import extinguisher from './assets/icons/fire-extinguisher.png'
import bell from './assets/icons/bell.png'
import drop from './assets/icons/drop.png'

export default function Home(){
  const stats=[[verified,'SEC Registered'],[setting,'PCAB Licensed'],[security,'BFP Standard'],[chat,'24/7 Support']]
  return <><Nav/><main>
    <section className="hero-home"><div className="shell hero-grid"><div><span className="eyebrow">ENGINEERED LIFE SAFETY</span><h1>Total Protection,<br/>Uncompromising<br/>Reliability</h1><p>Delivering professional fire safety services and precision-engineered suppression systems for industrial, commercial, and high-risk environments.</p><div className="actions"><a href="mailto:info@katala.com?subject=Request%20a%20Quote" className="btn-red">Request Quote &rarr;</a><a href="#services" className="btn-outline">Explore Services</a></div></div><img className="hero-photo" src={hero} alt="Industrial fire suppression system"/></div></section>
    <div className="shell stats">{stats.map(([icon,label])=><div key={label}><img className="stat-icon" src={icon} alt=""/>{label}</div>)}</div>
    <section className="section wash equipment-section"><div className="shell"><div className="equipment-rule"><span/></div><h2 className="section-title">Precision Equipment</h2><p className="section-copy">Industrial-grade fire safety products engineered for maximum reliability in critical situations.</p><div className="cards equipment-cards"><Card icon={<img src={extinguisher} alt=""/>} title="Extinguishers" link="View Specifications">Comprehensive range of ABC Dry Chemical, CO2, and specialized extinguishing units for all fire classes.</Card><Card icon={<img src={bell} alt=""/>} title="Alarm Systems" link="View Specifications">Addressable and conventional fire detection panels, sensors, and notification appliances.</Card><Card icon={<img src={drop} alt=""/>} title="Suppression Systems" link="View Specifications">Engineered clean agent, water mist, and foam suppression systems for critical infrastructure.</Card></div></div></section>
  </main><Footer/></>
}
