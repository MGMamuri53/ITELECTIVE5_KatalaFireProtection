import { useEffect, useState } from 'react'
import { Footer, Nav, PageIntro } from './components'
import { getStoredSession, schemaApi } from './services/katalaApi'
import { buildReceipt, getWorkflow, normalizeQuotation, subscribeWorkflowChanges, upsertWorkflow } from './Staff/staffWorkflow'

export default function Profile() {
  const session = getStoredSession()
  const user = session?.user
  const signedIn = Boolean(session?.token)
  const [inbox, setInbox] = useState({ quotations: [], serviceRequests: [] })
  const [status, setStatus] = useState({ type: 'loading', message: 'Loading inbox...' })
  const [receipt, setReceipt] = useState(null)
  const [quotePreview, setQuotePreview] = useState(null)
  const [quoteEdit, setQuoteEdit] = useState(null)
  const [paymentConfirm, setPaymentConfirm] = useState(null)
  const [quotationFilter, setQuotationFilter] = useState('All')
  const [serviceFilter, setServiceFilter] = useState('All')

  useEffect(() => {
    if (!signedIn) return
    let cancelled = false
    const sync = () => {
      setInbox((current) => ({
        quotations: current.quotations.map(withWorkflow),
        serviceRequests: current.serviceRequests.map(withWorkflow),
      }))
    }
    const unsubscribeWorkflow = subscribeWorkflowChanges(sync)
    setStatus({ type: 'loading', message: 'Loading inbox...' })
    schemaApi.getCustomerInbox()
      .then((data) => {
        if (cancelled) return
        setInbox({
          quotations: (data.quotations || []).map(withWorkflow),
          serviceRequests: (data.serviceRequests || []).map(withWorkflow),
        })
        setStatus({ type: 'idle', message: '' })
      })
      .catch((error) => {
        if (!cancelled) setStatus({ type: 'error', message: error.message || 'Unable to load inbox.' })
      })
    return () => {
      cancelled = true
      unsubscribeWorkflow()
    }
  }, [signedIn])

  async function refreshInbox(showStatus = false) {
    if (showStatus) setStatus({ type: 'loading', message: 'Refreshing customer inbox...' })
    try {
      const data = await schemaApi.getCustomerInbox()
      setInbox({
        quotations: (data.quotations || []).map(withWorkflow),
        serviceRequests: (data.serviceRequests || []).map(withWorkflow),
      })
      if (showStatus) setStatus({ type: 'success', message: 'Customer inbox refreshed.' })
    } catch (error) {
      if (showStatus) setStatus({ type: 'error', message: error.message || 'Unable to refresh customer inbox.' })
      throw error
    }
  }

  function updateLocalReference(referenceNumber, patch) {
    const next = upsertWorkflow(referenceNumber, patch)
    setInbox((current) => ({
      quotations: current.quotations.map((item) => item.referenceNumber === referenceNumber ? withWorkflow({ ...item, ...next }) : item),
      serviceRequests: current.serviceRequests.map((item) => item.referenceNumber === referenceNumber ? withWorkflow({ ...item, ...next }) : item),
    }))
  }

  function updateQuotationInInbox(quotation) {
    setInbox((current) => ({
      ...current,
      quotations: current.quotations.map((item) =>
        item.referenceNumber === quotation.referenceNumber ? withWorkflow({ ...item, ...quotation }) : item
      ),
    }))
  }

  async function cancelQuotation(item) {
    if (!canCancelQuotation(item)) return
    if (!window.confirm(`Cancel quotation request ${item.referenceNumber}?`)) return
    setStatus({ type: 'loading', message: 'Cancelling quotation...' })
    try {
      await schemaApi.cancelQuotation(item.referenceNumber)
      await refreshInbox()
      setStatus({ type: 'success', message: 'Quotation request cancelled.' })
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to cancel quotation.' })
    }
  }

  function confirmQuotation(item) {
    updateLocalReference(item.referenceNumber, { status: 'Customer Confirmed' })
    setPaymentConfirm(withWorkflow({ ...item, status: 'Customer Confirmed' }))
  }

  function payQuotation(item) {
    const paidAt = new Date().toISOString()
    const payment = {
      paidAt,
      receiptNumber: `RCT-${paidAt.slice(0, 10).replaceAll('-', '')}-${item.referenceNumber.replace(/[^A-Z0-9]/gi, '').slice(-6)}`,
    }
    const receiptData = buildReceipt({ ...item, id: item.referenceNumber, customer: user?.name || item.customerName || 'Customer' }, payment)
    updateLocalReference(item.referenceNumber, {
      status: 'Paid',
      payment: { status: 'Paid', ...payment, amount: item.quotation.total },
      receipt: receiptData,
    })
    setReceipt(receiptData)
    setPaymentConfirm(null)
  }

  if (!signedIn) {
    sessionStorage.setItem('katala-return-after-auth', 'profile')
    location.hash = 'signin'
    return null
  }

  const filteredQuotations = filterCustomerItems(inbox.quotations, quotationFilter)
  const filteredServiceRequests = filterCustomerItems(inbox.serviceRequests, serviceFilter)

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
              <InboxColumn title="Quotations" action={<button className="btn secondary compact-btn" type="button" onClick={() => refreshInbox(true).catch(() => {})}>Refresh</button>}>
                <QuotationFilterPills active={quotationFilter} onChange={setQuotationFilter} />
                <div className="profile-quotation-list">
                  {filteredQuotations.map((quote) => (
                    <InboxCard
                      key={quote.referenceNumber}
                      item={quote}
                      title={quote.projectName || quote.establishmentName || 'Product quotation'}
                      onView={setQuotePreview}
                      onEdit={setQuoteEdit}
                      onConfirm={confirmQuotation}
                      onPay={setPaymentConfirm}
                      onReceipt={setReceipt}
                      onCancel={cancelQuotation}
                    />
                  ))}
                  {!filteredQuotations.length && <p className="muted">No quotations in this category.</p>}
                </div>
              </InboxColumn>

              <InboxColumn title="Service Requests" action={<button className="btn secondary compact-btn" type="button" onClick={() => refreshInbox(true).catch(() => {})}>Refresh</button>}>
                <ProfileFilterPills filters={profileFilters} active={serviceFilter} onChange={setServiceFilter} label="Filter service requests" />
                <div className="profile-quotation-list">
                  {filteredServiceRequests.map((request) => (
                    <InboxCard key={request.referenceNumber} item={request} title={request.serviceName} isService onView={setQuotePreview} onEdit={setQuoteEdit} onConfirm={confirmQuotation} onPay={setPaymentConfirm} onReceipt={setReceipt} />
                  ))}
                  {!filteredServiceRequests.length && <p className="muted">No service requests in this category.</p>}
                </div>
              </InboxColumn>
            </div>
          </div>
        </section>
      </main>
      {quotePreview && <QuotationDialog item={quotePreview} onClose={() => setQuotePreview(null)} />}
      {quoteEdit && <EditQuotationDialog item={quoteEdit} onSaved={updateQuotationInInbox} onClose={() => setQuoteEdit(null)} />}
      {paymentConfirm && <PaymentDialog item={paymentConfirm} onPay={payQuotation} onClose={() => setPaymentConfirm(null)} />}
      {receipt && <ReceiptDialog receipt={receipt} onClose={() => setReceipt(null)} />}
      <Footer />
    </>
  )
}

function InboxColumn({ title, children, action = null }) {
  return (
    <div className="inbox-column">
      <div className="profile-column-heading">
        <h3>{title}</h3>
        {action}
      </div>
      <div className="inbox-list">{children}</div>
    </div>
  )
}

function QuotationFilterPills({ active, onChange }) {
  return <ProfileFilterPills filters={profileFilters} active={active} onChange={onChange} label="Filter quotations" />
}

const profileFilters = ['All', 'Under Review', 'Ongoing', 'Cancelled', 'Complete']

function ProfileFilterPills({ filters, active, onChange, label }) {
  return (
    <div className="profile-filter-pills" role="group" aria-label={label}>
      {filters.map((filter) => (
        <button key={filter} type="button" className={active === filter ? 'active' : ''} onClick={() => onChange(filter)}>
          {filter}
        </button>
      ))}
    </div>
  )
}

function InboxCard({ item, title, isService = false, onView, onEdit, onConfirm, onPay, onReceipt, onCancel = null }) {
  return (
    <article className="inbox-card">
      <div>
        <strong>{item.referenceNumber}</strong>
        <span>{title}</span>
      </div>
      <p>Status: <b>{item.status}</b></p>
      {item.recurrenceFrequency && item.recurrenceFrequency !== 'One-time' && <p>Frequency: <b>{item.recurrenceFrequency}</b></p>}
      {hasFinalSchedule(item) && (
        <p className="profile-schedule-alert"><b>!</b> Schedule finalized: {formatSchedule(item.schedule?.date, item.schedule?.time)} / {assignedStaff(item)}</p>
      )}
      {hasSchedule(item) && <p>{scheduleLabel(item)}: <b>{formatSchedule(item.schedule?.date || item.preferredDate, item.schedule?.time || item.preferredTime)}</b></p>}
      {assignedStaff(item) && <p>Assigned staff: <b>{assignedStaff(item)}</b></p>}
      <p>Total: <b>{formatPeso(item.quotation?.total || item.totalAmount)}</b></p>
      <p>{statusMessage(item)}</p>
      {item.payment?.status && <p>Payment: <b>{item.payment.status}</b></p>}
      <CustomerActions item={item} isService={isService} onView={onView} onEdit={onEdit} onConfirm={onConfirm} onPay={onPay} onReceipt={onReceipt} onCancel={onCancel} />
    </article>
  )
}

function QuotationBreakdown({ item }) {
  const quotation = item.quotation || normalizeQuotation({}, item)
  return (
    <div className="profile-quote-box">
      <p><b>Project:</b> {quotationTitle(item)}</p>
      {item.establishmentName && <p><b>Establishment:</b> {item.establishmentName}</p>}
      <p><b>Quotation date:</b> {quotation.quotationDate || 'Not assigned'}</p>
      {quotation.charges?.map((charge) => (
        <p key={charge.id}>{charge.description || charge.type}: <b>{charge.quantity} x {formatPeso(charge.unitPrice)} = {formatPeso(charge.subtotal)}</b></p>
      ))}
      <p>Subtotal: <b>{formatPeso(quotation.subtotal)}</b></p>
      {Number(quotation.discount || 0) > 0 && <p>Discount: <b>{formatPeso(quotation.discount)}</b></p>}
      <p>Total: <b>{formatPeso(quotation.total || item.totalAmount)}</b></p>
      {quotation.notes && <p>Notes: {quotation.notes}</p>}
      {quotation.terms && <p>Terms: {quotation.terms}</p>}
    </div>
  )
}

function CustomerActions({ item, isService = false, onView, onEdit, onConfirm, onPay, onReceipt, onCancel = null }) {
  const receipt = item.receipt || (item.payment?.receiptNumber ? buildReceipt(item, item.payment) : null)
  const paid = isPaid(item)
  return (
    <div className="profile-action-row">
      <button className="btn secondary profile-action" type="button" onClick={() => onView(item)}>View details</button>
      {!isService && item.status === 'Under Review' && (
        <button className="btn secondary profile-action" type="button" onClick={() => onEdit(item)}>Edit quote</button>
      )}
      {item.status === 'Ready for Payment' && (
        <button className="btn primary profile-action" type="button" onClick={() => onConfirm(item)}>Confirm quotation</button>
      )}
      {item.status === 'Customer Confirmed' && (
        <button className="btn primary profile-action" type="button" onClick={() => onPay(item)}>Proceed to payment</button>
      )}
      {paid && receipt && (
        <button className="btn secondary profile-action" type="button" onClick={() => onReceipt(item.receipt || receipt)}>View receipt</button>
      )}
      {!isService && canCancelQuotation(item) && onCancel && (
        <button className="btn danger profile-action" type="button" onClick={() => onCancel(item)}>Cancel quotation</button>
      )}
    </div>
  )
}

function EditQuotationDialog({ item, onSaved, onClose }) {
  const [form, setForm] = useState({
    projectName: item.projectName || '',
    establishmentName: item.establishmentName || '',
    projectAddress: item.projectAddress || '',
    projectDescription: item.projectDescription || '',
    customerRemarks: item.customerRemarks || '',
  })
  const [status, setStatus] = useState({ type: 'idle', message: '' })

  function update(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
    if (status.type === 'error') setStatus({ type: 'idle', message: '' })
  }

  async function save(event) {
    event.preventDefault()
    if (status.type === 'loading') return
    setStatus({ type: 'loading', message: 'Saving quotation changes...' })
    try {
      const data = await schemaApi.updateQuotation(item.referenceNumber, form)
      onSaved(data.quotation)
      setStatus({ type: 'success', message: 'Quotation updated.' })
      onClose()
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to update quotation.' })
    }
  }

  return (
    <div className="modal-backdrop receipt-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="product-modal profile-detail-modal" role="dialog" aria-modal="true" aria-labelledby="profile-edit-title">
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close">x</button>
        <div className="receipt-panel">
          <div className="receipt-heading">
            <div>
              <span className="eyebrow">EDIT QUOTATION</span>
              <h2 id="profile-edit-title">{item.referenceNumber}</h2>
              <p className="muted">You can update this while Katala staff is still reviewing it.</p>
            </div>
          </div>
          <form className="order-form profile-edit-form" onSubmit={save}>
            <div className="form-grid">
              <label>Project name<input maxLength="160" name="projectName" value={form.projectName} onChange={update} /></label>
              <label>Establishment<input maxLength="160" name="establishmentName" value={form.establishmentName} onChange={update} /></label>
              <label className="wide">Project address<textarea maxLength="1000" rows="2" name="projectAddress" value={form.projectAddress} onChange={update} /></label>
              <label className="wide">Project description<textarea maxLength="2000" rows="3" name="projectDescription" value={form.projectDescription} onChange={update} /></label>
              <label className="wide">Customer remarks<textarea maxLength="2000" rows="3" name="customerRemarks" value={form.customerRemarks} onChange={update} /></label>
            </div>
            {status.type !== 'idle' && <div className={`form-status ${status.type}`}>{status.message}</div>}
            <div className="form-actions">
              <button className="btn primary" disabled={status.type === 'loading'}>{status.type === 'loading' ? 'Saving...' : 'Save changes'}</button>
              <button className="btn secondary" type="button" onClick={onClose}>Cancel</button>
            </div>
          </form>
        </div>
      </section>
    </div>
  )
}

function isPaid(item) {
  return item.payment?.status === 'Paid' || item.status === 'Paid' || Boolean(item.receipt)
}

function isCompleted(item) {
  return item.status === 'Completed'
}

function isCancelled(item) {
  return item.status === 'Cancelled'
}

function isUnderReview(item) {
  return ['Submitted', 'Under Review', 'Quotation Draft'].includes(item.status)
}

function isOngoing(item) {
  return !isUnderReview(item) && !isCancelled(item) && !isCompleted(item)
}

function filterCustomerItems(items, filter) {
  if (filter === 'Under Review') return items.filter(isUnderReview)
  if (filter === 'Ongoing') return items.filter(isOngoing)
  if (filter === 'Cancelled') return items.filter(isCancelled)
  if (filter === 'Complete') return items.filter(isCompleted)
  return items
}

function canCancelQuotation(item) {
  return ['Submitted', 'Under Review'].includes(item.status)
}

function statusMessage(item) {
  if (isCompleted(item)) return 'This item is completed.'
  if (hasAssignedSchedule(item)) return 'Your service schedule has been assigned.'
  if (isPaid(item)) return 'Payment completed. Staff will schedule or complete the service.'
  if (item.status === 'Ready for Payment') return 'Please review and confirm this quotation before payment.'
  if (item.status === 'Customer Confirmed') return 'Quotation confirmed. Payment is ready.'
  return 'Waiting for staff review or pricing.'
}

function QuotationDialog({ item, onClose }) {
  return (
    <div className="modal-backdrop receipt-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="product-modal profile-detail-modal" role="dialog" aria-modal="true" aria-labelledby="profile-quote-title">
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close">x</button>
        <div className="receipt-panel">
          <div className="receipt-heading">
            <div>
              <span className="eyebrow">QUOTATION DETAILS</span>
              <h2 id="profile-quote-title">{item.referenceNumber}</h2>
              <p className="muted">{item.subject || item.serviceName || item.projectName || 'Katala service'}</p>
            </div>
            <strong>{formatPeso(item.quotation?.total || item.totalAmount)}</strong>
          </div>
          <QuotationBreakdown item={item} />
          <div className="receipt-meta">
            <div><span>Status</span><strong>{item.status}</strong></div>
            <div><span>Frequency</span><strong>{item.recurrenceFrequency || 'One-time'}</strong></div>
            <div><span>Address</span><strong>{item.projectAddress || 'Not provided'}</strong></div>
            <div><span>{scheduleLabel(item)}</span><strong>{formatSchedule(item.schedule?.date || item.preferredDate, item.schedule?.time || item.preferredTime)}</strong></div>
            <div><span>Assigned staff</span><strong>{assignedStaff(item) || 'Not assigned yet'}</strong></div>
            <div><span>Payment</span><strong>{item.payment?.status || 'Not paid'}</strong></div>
          </div>
          <div className="form-actions">
            <button className="btn secondary" type="button" onClick={onClose}>Close</button>
          </div>
        </div>
      </section>
    </div>
  )
}

function PaymentDialog({ item, onPay, onClose }) {
  const title = quotationTitle(item)
  return (
    <div className="modal-backdrop receipt-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="product-modal profile-payment-modal" role="dialog" aria-modal="true" aria-labelledby="profile-payment-title">
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close">x</button>
        <div className="receipt-panel">
          <div className="receipt-heading">
            <div>
              <span className="eyebrow">PAYMENT CONFIRMATION</span>
              <h2 id="profile-payment-title">{title}</h2>
              <p className="muted">Quotation {item.referenceNumber}</p>
            </div>
            <strong>{formatPeso(item.quotation?.total)}</strong>
          </div>
          <QuotationBreakdown item={item} />
          <div className="receipt-meta">
            <div><span>Project name</span><strong>{title}</strong></div>
            <div><span>Establishment</span><strong>{item.establishmentName || 'Not provided'}</strong></div>
            <div><span>{scheduleLabel(item)}</span><strong>{formatSchedule(item.schedule?.date || item.preferredDate, item.schedule?.time || item.preferredTime)}</strong></div>
            <div><span>Assigned staff</span><strong>{assignedStaff(item) || 'To be assigned'}</strong></div>
          </div>
          <div className="form-status loading">This is a mock payment confirmation. No real payment gateway will be charged.</div>
          <div className="form-actions">
            <button className="btn primary" type="button" onClick={() => onPay(item)}>Confirm payment</button>
            <button className="btn secondary" type="button" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </section>
    </div>
  )
}

function ReceiptDialog({ receipt, onClose }) {
  return (
    <div className="modal-backdrop receipt-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="product-modal receipt-modal" role="dialog" aria-modal="true" aria-labelledby="profile-receipt-title">
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close">x</button>
        <div className="receipt-panel">
          <div className="receipt-heading">
            <div>
              <span className="eyebrow">PAYMENT RECEIPT</span>
              <h2 id="profile-receipt-title">{receipt.receiptNumber}</h2>
              <p className="muted">Quotation {receipt.quotationReference}</p>
            </div>
            <strong>{formatPeso(receipt.paidAmount)}</strong>
          </div>
          <div className="receipt-meta">
            <div><span>Customer</span><strong>{receipt.customerName}</strong></div>
            <div><span>Paid date</span><strong>{receipt.paidAt ? new Date(receipt.paidAt).toLocaleString() : 'Pending'}</strong></div>
            <div><span>Request</span><strong>{receipt.requestReference}</strong></div>
            <div><span>Service</span><strong>{receipt.serviceDetails}</strong></div>
          </div>
          <div className="receipt-lines">
            {receipt.charges?.map((charge) => (
              <div key={charge.id}>
                <div>
                  <strong>{charge.description || charge.type}</strong>
                  <span>{charge.type} / Qty {charge.quantity} at {formatPeso(charge.unitPrice)}</span>
                </div>
                <span>{formatPeso(charge.subtotal)}</span>
              </div>
            ))}
          </div>
          <div className="receipt-total"><span>Paid amount</span><strong>{formatPeso(receipt.paidAmount)}</strong></div>
          <div className="form-actions">
            <button className="btn primary" type="button" onClick={() => window.print()}>Print receipt</button>
            <button className="btn secondary" type="button" onClick={onClose}>Close</button>
          </div>
        </div>
      </section>
    </div>
  )
}

function withWorkflow(item) {
  const referenceNumber = item.referenceNumber
  const workflow = getWorkflow(referenceNumber) || {}
  const base = {
    ...item,
    id: referenceNumber,
    subject: item.serviceName || item.projectName || item.establishmentName || 'Katala service',
    customer: item.customerName,
  }
  return {
    ...base,
    ...workflow,
    referenceNumber,
    projectName: item.projectName || workflow.projectName || '',
    establishmentName: item.establishmentName || workflow.establishmentName || '',
    subject: item.serviceName || item.projectName || item.establishmentName || workflow.subject || 'Katala service',
    status: mergedStatus(workflow.status, item.status),
    quotation: normalizeQuotation(workflow.quotation, { ...base, totalAmount: item.totalAmount }),
    payment: workflow.payment || item.payment,
    receipt: workflow.receipt,
  }
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

function hasSchedule(item) {
  return Boolean(item.schedule?.date || item.schedule?.time || item.preferredDate || item.preferredTime)
}

function hasFinalSchedule(item) {
  return !isCompleted(item) && Boolean(item.schedule?.date && item.schedule?.time && assignedStaff(item))
}

function hasAssignedSchedule(item) {
  return Boolean(assignedStaff(item) && (item.schedule?.date || item.schedule?.time))
}

function scheduleLabel(item) {
  return hasAssignedSchedule(item) ? 'Schedule' : 'Preferred schedule'
}

function assignedStaff(item) {
  return item.schedule?.staff || item.staff || ''
}

function quotationTitle(item) {
  return item.projectName || item.establishmentName || item.subject || 'Product quotation'
}

function displayStatus(status) {
  const value = String(status || '').trim()
  const normalized = value.toLowerCase()
  if (normalized === 'accepted') return 'Ready for Payment'
  if (normalized === 'ready for payment' || normalized === 'for payment') return 'Ready for Payment'
  if (normalized === 'submitted') return 'Under Review'
  return value || 'Under Review'
}

function mergedStatus(localStatus, backendStatus) {
  const local = displayStatus(localStatus)
  const backend = displayStatus(backendStatus)
  return statusRank(local) > statusRank(backend) ? local : backend
}

function statusRank(status) {
  return {
    Submitted: 1,
    'Under Review': 2,
    'Quotation Draft': 3,
    'Ready for Payment': 4,
    'Customer Confirmed': 5,
    Paid: 6,
    Scheduled: 7,
    'In Progress': 8,
    Completed: 9,
    Cancelled: 10,
  }[status] || 0
}
