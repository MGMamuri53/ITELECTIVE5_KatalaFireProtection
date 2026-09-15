import { useEffect, useMemo, useRef, useState } from 'react'
import { Nav, Footer, PageIntro, InfoNote } from './components'
import { serviceLines } from './data/company'
import { getStoredSession, isSignedIn, schemaApi } from './services/katalaApi'
import { recurrenceOptions } from './Staff/staffWorkflow'

const filters = ['All', 'Systems', 'Products', 'Maintenance']
const typeMap = {
  'Fire Extinguishers': 'Products',
  'Fire Detection & Alarm Systems': 'Systems',
  'Automatic Fire Sprinkler Systems': 'Systems',
  'Fire Pump & Jockey Pump': 'Systems',
  'Preventive Maintenance': 'Maintenance',
  'Kitchen Suppression & CCTV': 'Systems',
}

function localToday() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function localTimeNow() {
  const now = new Date()
  const hour = String(now.getHours()).padStart(2, '0')
  const minute = String(now.getMinutes()).padStart(2, '0')
  return `${hour}:${minute}`
}

function isMaintenanceService(service) {
  return serviceType(service) === 'Maintenance' || /maintenance|preventive/i.test(service.title)
}

function serviceType(service) {
  const value = service.category || typeMap[service.title] || 'Systems'
  if (/maintenance|preventive/i.test(value)) return 'Maintenance'
  if (/product|material/i.test(value)) return 'Products'
  return value
}

function serviceKey(service) {
  return String(service.title || '').trim().toLowerCase()
}

function dbServiceCards(services) {
  return services
    .filter((service) => service.active)
    .map((service) => ({
      title: service.name,
      category: service.category || 'Systems',
      copy: service.description || 'Customer-facing service details will be confirmed by Katala staff after review.',
      proof: service.duration ? `Estimated duration: ${service.duration}` : 'Scope and schedule are confirmed after staff review.',
      imageUrl: service.imageUrl || '',
      minPrice: service.minPrice,
      maxPrice: service.maxPrice,
    }))
}

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })

function priceRangeLabel(item) {
  const prices = [item.minPrice, item.maxPrice]
    .filter((value) => value !== null && value !== undefined && Number(value) > 0)
    .map(Number)
  if (!prices.length) return 'After site review'
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  return min === max ? peso.format(min) : `${peso.format(min)} - ${peso.format(max)}`
}

function validatePreferredSchedule(preferredDate, preferredTime) {
  const today = localToday()

  if (preferredTime && !preferredDate) {
    return 'Select a preferred date before choosing a preferred time.'
  }

  if (preferredDate && preferredDate < today) {
    return 'Preferred date cannot be in the past.'
  }

  if (preferredDate === today && preferredTime && preferredTime <= localTimeNow()) {
    return 'Preferred time must be later than the current time for today.'
  }

  return ''
}

const emptyServiceForm = {
  projectName: '',
  establishmentName: '',
  contactPerson: '',
  contactNumber: '',
  problemDescription: '',
  projectAddress: '',
  preferredDate: '',
  preferredTime: '',
  recurrenceFrequency: 'One-time',
  priorityLevel: 'Normal',
  customerRemarks: '',
}

export default function Services() {
  const [filter, setFilter] = useState('All')
  const [selectedService, setSelectedService] = useState(null)
  const [dbServices, setDbServices] = useState([])
  const [catalogStatus, setCatalogStatus] = useState('')
  const [signedIn, setSignedIn] = useState(() => isSignedIn())
  const serviceItems = useMemo(() => {
    const dbCards = dbServiceCards(dbServices)
    const dbKeys = new Set(dbCards.map(serviceKey))
    return [
      ...dbCards,
      ...serviceLines.filter((item) => !dbKeys.has(serviceKey(item))),
    ]
  }, [dbServices])
  const shown = serviceItems.filter((item) => filter === 'All' || serviceType(item) === filter)

  useEffect(() => {
    const sync = () => setSignedIn(isSignedIn())
    window.addEventListener('katala-auth-changed', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('katala-auth-changed', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  useEffect(() => {
    if (!signedIn) return
    const pendingTitle = sessionStorage.getItem('katala-pending-service')
    if (!pendingTitle) return
    const pending = serviceItems.find((item) => item.title === pendingTitle)
    if (pending) {
      sessionStorage.removeItem('katala-pending-service')
      setSelectedService(pending)
    }
  }, [serviceItems, signedIn])

  useEffect(() => {
    let cancelled = false
    schemaApi.listCatalogServices()
      .then((data) => {
        if (cancelled) return
        setDbServices(data.services || [])
        setCatalogStatus('')
      })
      .catch(() => {
        if (!cancelled) setCatalogStatus('Service catalog is temporarily showing the default list.')
      })
    return () => { cancelled = true }
  }, [])

  function askAboutService(item) {
    if (!isSignedIn()) {
      sessionStorage.setItem('katala-return-after-auth', 'services')
      sessionStorage.setItem('katala-pending-service', item.title)
      location.hash = 'signin'
      return
    }
    setSelectedService(item)
  }

  return (
    <>
      <Nav active="services" />
      <main>
        <PageIntro eyebrow="SERVICES" title="Fire protection support for your facility">
          Choose the service that best matches your requirement. Signed-in customers can send project details directly to Katala for review and follow-up.
        </PageIntro>
        <section className="section">
          <div className="shell">
            <div className="filter-row" role="group" aria-label="Filter services">
              {filters.map((item) => (
                <button type="button" className={filter === item ? 'active' : ''} onClick={() => setFilter(item)} key={item}>
                  {item}
                </button>
              ))}
            </div>

            <div className="service-grid">
              {shown.map((item) => (
                <article className="service-card" key={item.title}>
                  <div className="service-card-top">
                    <span>Service category</span>
                    <strong>{serviceType(item)}</strong>
                  </div>
                  {item.imageUrl && <img className="service-card-image" src={item.imageUrl} alt="" />}
                  <h2>{item.title}</h2>
                  <p>{item.copy}</p>
                  <div className="service-estimate">
                    <span>Estimated pricing</span>
                    <strong>{priceRangeLabel(item)}</strong>
                  </div>
                  <div className="proof-box">
                    <span>How we can help</span>
                    {item.proof}
                  </div>
                  {signedIn && (
                    <button className="btn secondary full service-inquiry-btn" type="button" onClick={() => askAboutService(item)}>
                      Request service consultation
                    </button>
                  )}
                </article>
              ))}
            </div>

            <InfoNote title="Not sure which service to choose?">
              Select the closest category and describe the site condition or requirement. Katala can review the details and advise what information is needed next.
            </InfoNote>
            {catalogStatus && <div className="form-status loading">{catalogStatus}</div>}
          </div>
        </section>
      </main>
      <Footer />

      {selectedService && (
        <ServiceRequestModal service={selectedService} onClose={() => setSelectedService(null)} />
      )}
    </>
  )
}

function ServiceRequestModal({ service, onClose }) {
  const session = getStoredSession()
  const [form, setForm] = useState(() => ({
    ...emptyServiceForm,
    establishmentName: session?.user?.companyName || '',
    contactPerson: session?.user?.name || '',
    contactNumber: session?.user?.contactNumber || '',
    recurrenceFrequency: isMaintenanceService(service) ? 'Monthly' : 'One-time',
  }))
  const [status, setStatus] = useState({ type: 'idle', message: '', referenceNumber: '' })
  const closeRef = useRef(null)

  useEffect(() => {
    const old = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const listener = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', listener)
    return () => {
      document.body.style.overflow = old
      window.removeEventListener('keydown', listener)
    }
  }, [onClose])

  function update(e) {
    const { name, value } = e.target
    setForm((current) => {
      const next = { ...current, [name]: value }

      // If the customer switches the date to today, remove an already-selected
      // time that has become invalid. The submit validation still runs as a
      // second layer in case values are edited manually.
      if (name === 'preferredDate' && value === localToday() && next.preferredTime && next.preferredTime <= localTimeNow()) {
        next.preferredTime = ''
      }

      return next
    })
  }

  async function submit(e) {
    e.preventDefault()
    if (status.type === 'loading') return

    const scheduleError = validatePreferredSchedule(form.preferredDate, form.preferredTime)
    if (scheduleError) {
      setStatus({ type: 'error', message: scheduleError, referenceNumber: '' })
      return
    }
    if (!form.contactPerson.trim()) {
      setStatus({ type: 'error', message: 'Contact person is required.', referenceNumber: '' })
      return
    }
    if (!form.projectAddress.trim()) {
      setStatus({ type: 'error', message: 'Service address is required.', referenceNumber: '' })
      return
    }

    setStatus({ type: 'loading', message: 'Sending service request…', referenceNumber: '' })

    try {
      const data = await schemaApi.createServiceRequest({
        serviceName: service.title,
        ...form,
      })
      setStatus({
        type: 'success',
        message: data.message || 'Service request submitted.',
        referenceNumber: data.referenceNumber || '',
      })
    } catch (error) {
      if (/sign in/i.test(error.message || '')) {
        sessionStorage.setItem('katala-return-after-auth', 'services')
      }
      const message = error instanceof TypeError
        ? 'The service request system is temporarily unreachable. Please try again or contact Katala directly.'
        : (error.message || 'Unable to send service request.')
      setStatus({ type: 'error', message, referenceNumber: '' })
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="product-modal service-request-modal" role="dialog" aria-modal="true" aria-labelledby="service-request-title">
        <button ref={closeRef} className="modal-close" type="button" onClick={onClose} aria-label="Close">×</button>
        <div className="service-request-panel">
          <span className="eyebrow">SERVICE REQUEST</span>
          <h2 id="service-request-title">{service.title}</h2>
          <p className="muted">Share the project location, contact details, and service requirement so Katala can review your request before confirming the next step.</p>

          {status.type !== 'success' ? (
            <form className="order-form service-request-form" onSubmit={submit}>
              <div className="form-grid">
                <label>Project name<input maxLength="160" name="projectName" value={form.projectName} onChange={update} /></label>
                <label>Establishment / organization<input maxLength="160" name="establishmentName" value={form.establishmentName} onChange={update} /></label>
                <label>Contact person<input required maxLength="160" name="contactPerson" value={form.contactPerson} onChange={update} /></label>
                <label className="wide">Service requirement / problem description<textarea required minLength="5" maxLength="2500" rows="4" name="problemDescription" value={form.problemDescription} onChange={update} placeholder="Describe the equipment, issue, requested work, or site concern." /></label>
                <label className="wide">Project address<textarea required maxLength="1000" rows="2" name="projectAddress" value={form.projectAddress} onChange={update} /></label>
                <label>
                  Preferred date
                  <input
                    type="date"
                    name="preferredDate"
                    min={localToday()}
                    value={form.preferredDate}
                    onChange={update}
                  />
                </label>
                <label>
                  Preferred time
                  <input
                    type="time"
                    name="preferredTime"
                    min={form.preferredDate === localToday() ? localTimeNow() : undefined}
                    value={form.preferredTime}
                    onChange={update}
                    disabled={!form.preferredDate}
                  />
                </label>
                {isMaintenanceService(service) && <label>
                  Service frequency
                  <select name="recurrenceFrequency" value={form.recurrenceFrequency} onChange={update}>
                    {recurrenceOptions.filter((option) => option !== 'One-time').map((option) => <option key={option}>{option}</option>)}
                  </select>
                </label>}
                <label>
                  Priority
                  <select name="priorityLevel" value={form.priorityLevel} onChange={update}>
                    <option>Low</option>
                    <option>Normal</option>
                    <option>High</option>
                    <option>Urgent</option>
                  </select>
                </label>
                <label className="wide">Additional notes<textarea maxLength="2000" rows="3" name="customerRemarks" value={form.customerRemarks} onChange={update} /></label>
              </div>

              {status.type !== 'idle' && <div className={`form-status ${status.type}`}>{status.message}</div>}
              <div className="form-actions">
                <button className="btn primary" disabled={status.type === 'loading'}>{status.type === 'loading' ? 'Sending…' : 'Submit service request'}</button>
                <button className="btn secondary" type="button" onClick={onClose}>Cancel</button>
              </div>
            </form>
          ) : (
            <div className="order-success-block">
              <h3>Service request submitted</h3>
              <p>{status.message}</p>
              <p><strong>Reference: {status.referenceNumber}</strong></p>
              <p className="muted">Keep this reference for follow-up with Katala.</p>
              <button className="btn primary" type="button" onClick={onClose}>Done</button>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
