import { useState } from 'react'
import building from './assets/pictures/download.jpg'
import fire from './assets/icons/fire.png'
import shield from './assets/icons/shield.png'
import './signup.css'

export default function Signup(){
  const [step,setStep]=useState(1)
  const submit=e=>{e.preventDefault(); if(step===1)setStep(2); else location.hash='signin'}
  return <main className="auth-page">
    <section className="auth-visual" style={{backgroundImage:`url(${building})`}}><div className="visual-copy"><div className="auth-brand"><img src={fire} alt=""/>Katala FireSafe</div><p>Engineering Life Safety.</p><div className="portal-note"><img src={shield} alt=""/><div><strong>Professional Portal</strong><span>Secure access to technical documentation, compliance reports,<br/>and quotation management designed for facility engineers.</span></div></div></div></section>
    <section className="auth-form-side"><div className="signup-box"><a className="auth-home" href="#home">Katala FireSafe</a><h1>{step===1?'Create Your Professional Account':'Complete Your Company Profile'}</h1><p className="auth-intro">{step===1?'Access Katala FireSafe to manage your quotations and service requests.':'Tell us about your organization to finish setting up your account.'}</p><div className={'progress step-'+step}><span/><span/></div>
      <form noValidate onSubmit={submit}>{step===1?<>
        <div className="form-row"><Field label="First Name" placeholder="Jane"/><Field label="Last Name" placeholder="Doe"/></div>
        <Field label="Work Email" type="email" placeholder="✉  jane.doe@company.com"/>
        <Field label="Contact Number" type="tel" placeholder="      +1 (555) 000-0000"/>
        <div className="form-row"><Field label="Password" type="password" placeholder="••••••••"/><Field label="Confirm Password" type="password" placeholder="••••••••"/></div>
      </>:<><Field label="Company Name" placeholder="Company or organization"/><div className="form-row"><Field label="Job Title" placeholder="Facility Engineer"/><Field label="Industry" placeholder="Commercial"/></div><Field label="Company Address" placeholder="Business address"/></>}
        <div className="privacy"><img src={shield} alt=""/><span>Your data is handled according to our Privacy Policy and<br/>ISO security standards.</span></div><hr/><button className="continue" type="submit">{step===1?'Continue to Step 2':'Create Account'} &nbsp;&rarr;</button>
      </form><p className="signin-link">Already have an account? <a href="#signin">Sign in</a></p></div></section>
  </main>
}

function Field({label,...props}){return <label className="field"><span>{label}</span><input {...props}/></label>}
