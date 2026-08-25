import { useEffect, useState } from 'react'
import { Footer, Nav, PageIntro } from './components'
import { getStoredSession, schemaApi } from './services/katalaApi'

export default function Profile() {
  const session = getStoredSession()
  const user = session?.user
  const signedIn = Boolean(session?.token)
  const [inbox, setInbox] = useState({ quotations: [], serviceRequests: [] })
  const [status, setStatus] = useState({ type: 'loading', message: 'Loading inbox...' })

  useEffect(() => {
    if (!signedIn) return
    let cancelled = false
    setStatus({ type: 'loading', message: 'Loading inbox...' })
    schemaApi.getCustomerInbox()
      .then((data) => {
        if (cancelled) return
        setInbox({
          quotations: data.quotations || [],
          serviceRequests: data.serviceRequests || [],
        })
        setStatus({ type: 'idle', message: '' })
      })
      .catch((error) => {
        if (!cancelled) setStatus({ type: 'error', message: error.message || 'Unable to load inbox.' })
      })
    return () => { cancelled = true }
  }, [signedIn])

  if (!signedIn) {
    sessionStorage.setItem('katala-return-after-auth', 'profile')
    location.hash = 'signin'
    return null
  }

  return (
    <>
      <Nav active="profile" />
      <main>
        <PageIntro eyebrow="ACCOUNT" title="Profile">
          View the account details currently linked to your Katala customer access.
        </PageIntro>

        <section className="section">
          <div className="shell narrow">
            <div className="profile-panel">
              <div>
                <span>Name</span>
                <strong>{user?.name || 'Customer'}</strong>
              </div>
              <div>
                <span>Email</span>
                <strong>{user?.email || 'Not available'}</strong>
              </div>
              <div>
                <span>Company</span>
                <strong>{user?.companyName || 'Not provided'}</strong>
              </div>
              <div>
                <span>Contact number</span>
                <strong>{user?.contactNumber || 'Not provided'}</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="section surface">
          <div className="shell">
            <div className="section-heading">
              <span className="eyebrow">CUSTOMER INBOX</span>
              <h2>Quotation and service updates</h2>
              <p>Staff-reviewed quotation details, payment readiness, and confirmed service schedules appear here.</p>
            </div>

            {status.type !== 'idle' && <div className={`form-status ${status.type}`}>{status.message}</div>}

            <div className="inbox-grid">
              <InboxColumn title="Quotations">
                {inbox.quotations.map((quote) => (
                  <article className="inbox-card" key={quote.referenceNumber}>
                    <div>
                      <strong>{quote.referenceNumber}</strong>
                      <span>{quote.projectName || quote.establishmentName || 'Product quotation'}</span>
                    </div>
                    <p>Status: <b>{quote.status}</b></p>
                    <p>Total: <b>{formatPeso(quote.totalAmount)}</b></p>
                    <p>{quote.canPay ? 'Payment or QR checkout is ready.' : 'Waiting for staff review or pricing.'}</p>
                    {quote.payment?.status && <p>Payment: <b>{quote.payment.status}</b></p>}
                  </article>
                ))}
                {!inbox.quotations.length && <p className="muted">No quotation updates yet.</p>}
              </InboxColumn>

              <InboxColumn title="Service Requests">
                {inbox.serviceRequests.map((request) => (
                  <article className="inbox-card" key={request.referenceNumber}>
                    <div>
                      <strong>{request.referenceNumber}</strong>
                      <span>{request.serviceName}</span>
                    </div>
                    <p>Status: <b>{request.status}</b></p>
                    <p>Schedule: <b>{formatSchedule(request.preferredDate, request.preferredTime)}</b></p>
                    <p>{request.projectAddress || request.problemDescription || 'Staff will contact you for details.'}</p>
                  </article>
                ))}
                {!inbox.serviceRequests.length && <p className="muted">No service updates yet.</p>}
              </InboxColumn>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}

function InboxColumn({ title, children }) {
  return (
    <div className="inbox-column">
      <h3>{title}</h3>
      <div className="inbox-list">{children}</div>
    </div>
  )
}

const peso = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
})

function formatPeso(value) {
  return peso.format(Number(value || 0))
}

function formatSchedule(date, time) {
  if (!date && !time) return 'Not confirmed yet'
  return [date ? new Date(date).toLocaleDateString() : '', time || ''].filter(Boolean).join(' ')
}
