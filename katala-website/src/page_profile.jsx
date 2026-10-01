import { useEffect, useState } from 'react'
import { ArrowLeft, Building2, CheckCircle2, Download, Loader2, QrCode, Smartphone } from 'lucide-react'
import { Footer, Nav, PageIntro } from './components'
import { company } from './data/company'
import { bankPaymentConfig, ewalletPaymentConfig, qrPhPaymentConfig } from './paymentConfig'
import { getStoredSession, schemaApi } from './services/katalaApi'
import { buildReceipt, getWorkflow, normalizeQuotation, subscribeWorkflowChanges } from './Staff/staffWorkflow'

export default function Profile() {
  const session = getStoredSession()
  const user = session?.user
  const signedIn = Boolean(session?.token)
  const [inbox, setInbox] = useState({ quotations: [], serviceRequests: [], notifications: [] })
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
        notifications: current.notifications || [],
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
          notifications: data.notifications || [],
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
        notifications: data.notifications || [],
      })
      if (showStatus) setStatus({ type: 'success', message: 'Customer inbox refreshed.' })
    } catch (error) {
      if (showStatus) setStatus({ type: 'error', message: error.message || 'Unable to refresh customer inbox.' })
      throw error
    }
  }

  function updateQuotationInInbox(quotation) {
    updateItemInInbox(quotation)
  }

  function updateItemInInbox(nextItem) {
    setInbox((current) => ({
      ...current,
      quotations: current.quotations.map((quote) =>
        quote.referenceNumber === nextItem.referenceNumber ? withWorkflow({ ...quote, ...nextItem }) : quote
      ),
      serviceRequests: current.serviceRequests.map((request) =>
        request.referenceNumber === nextItem.referenceNumber ? withWorkflow({ ...request, ...nextItem }) : request
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

  async function confirmQuotation(item) {
    setStatus({ type: 'loading', message: 'Confirming quotation...' })
    try {
      const isServiceItem = item.kind === 'Service'
      const data = isServiceItem
        ? await schemaApi.confirmServiceRequest(item.referenceNumber)
        : await schemaApi.confirmQuotation(item.referenceNumber)
      const confirmed = withWorkflow((isServiceItem ? data.serviceRequest : data.quotation) || { ...item, status: 'Customer Confirmed' })
      updateItemInInbox(confirmed)
      setPaymentConfirm(confirmed)
      setStatus({ type: 'idle', message: '' })
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to confirm quotation.' })
    }
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
      {paymentConfirm && <PaymentDialog item={paymentConfirm} onClose={() => setPaymentConfirm(null)} />}
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
  const scheduleNotice = scheduleUpdateNotice(item)
  return (
    <article className="inbox-card">
      <div>
        <strong>{item.referenceNumber}</strong>
        <span>{title}</span>
      </div>
      <p>Status: <b>{item.status}</b></p>
      {item.recurrenceFrequency && item.recurrenceFrequency !== 'One-time' && <p>Frequency: <b>{item.recurrenceFrequency}</b></p>}
      {scheduleNotice ? (
        <p className="profile-schedule-alert"><b>!</b> {scheduleNotice}</p>
      ) : (
        <>
          {hasSchedule(item) && <p>{scheduleLabel(item)}: <b>{formatSchedule(item.schedule?.date || item.preferredDate, item.schedule?.time || item.preferredTime)}</b></p>}
          {assignedStaff(item) && <p>Assigned staff: <b>{assignedStaff(item)}</b></p>}
        </>
      )}
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
      {!isService && item.status === 'Submitted' && (
        <button className="btn secondary profile-action" type="button" onClick={() => onEdit(item)}>Edit quote</button>
      )}
      {item.status === 'Ready for Payment' && (
        <button className="btn primary profile-action" type="button" onClick={() => onConfirm(item)}>{isService ? 'Confirm service quote' : 'Confirm quotation'}</button>
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

const paymentMethods = [
  {
    id: 'qrph',
    name: 'QR PH',
    description: 'Scan with a compatible banking or e-wallet app.',
    icon: QrCode,
    active: true,
  },
  {
    id: 'ewallet',
    name: 'E-wallet',
    description: 'GCash, Maya, and other wallet channels.',
    icon: Smartphone,
    active: true,
  },
  {
    id: 'bank',
    name: 'Bank transfer',
    description: 'Direct deposit or online bank transfer.',
    icon: Building2,
    active: true,
  },
]

function PaymentDialog({ item, onClose }) {
  const [selectedMethod, setSelectedMethod] = useState('qrph')
  const [view, setView] = useState('methods')
  const [qrLoadStatus, setQrLoadStatus] = useState(qrPhPaymentConfig.qrImageSrc ? 'loading' : 'missing')
  const [paymentNotice, setPaymentNotice] = useState('')
  const [providerReference, setProviderReference] = useState('')
  const [proofImage, setProofImage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [paymentSubmitted, setPaymentSubmitted] = useState(false)
  const quotation = item.quotation || normalizeQuotation({}, item)
  const total = Number(quotation.total || item.totalAmount || 0)
  const selected = paymentMethods.find((method) => method.id === selectedMethod) || paymentMethods[0]
  const SelectedIcon = selected.icon
  const itemCount = quotation.charges?.length || item.items?.length || 1
  const hasQrImage = Boolean(qrPhPaymentConfig.qrImageSrc)
  const qrReady = hasQrImage && qrLoadStatus === 'loaded'

  function selectMethod(methodId) {
    setSelectedMethod(methodId)
    setPaymentNotice('')
  }

  function continueToQr() {
    setView('qr')
    setPaymentNotice('')
  }

  function downloadQr() {
    if (!qrReady) return
    const link = document.createElement('a')
    link.href = qrPhPaymentConfig.qrImageSrc
    link.download = `katala-qrph-${item.referenceNumber}.jpg`
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  async function chooseProof(event) {
    const file = event.target.files?.[0]
    if (!file) return setProofImage('')
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 650_000) {
      setProofImage('')
      setPaymentNotice('Upload a PNG, JPG, or WebP image no larger than 650 KB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setProofImage(String(reader.result || ''))
    reader.readAsDataURL(file)
  }

  async function confirmPaid() {
    if (submitting || paymentSubmitted) return
    if (!providerReference.trim()) {
      setPaymentNotice('Enter the transaction reference from your payment receipt.')
      return
    }
    if (!proofImage) {
      setPaymentNotice('Choose a payment screenshot or receipt image before submitting.')
      return
    }
    setSubmitting(true)
    setPaymentSubmitted(false)
    setPaymentNotice('')
    try {
      const data = await schemaApi.submitManualPayment({
        requestReference: item.referenceNumber,
        paymentMethod: selectedMethod === 'qrph' ? 'QR PH' : selectedMethod === 'ewallet' ? 'GCash / E-wallet' : 'Bank transfer',
        providerReference: providerReference.trim(),
        proofImage,
      })
      setPaymentNotice(data.message || 'Payment proof submitted for staff verification.')
      setPaymentSubmitted(true)
    } catch (error) {
      setPaymentNotice(error.message || 'Unable to submit payment proof.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop receipt-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="product-modal profile-payment-modal checkout-payment-modal" role="dialog" aria-modal="true" aria-labelledby="profile-payment-title">
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close">x</button>
        <div className="checkout-payment-shell">
          <div className="checkout-payment-header">
            <button className="checkout-back-button" type="button" onClick={view === 'qr' ? () => setView('methods') : onClose}>
              <ArrowLeft size={17} aria-hidden="true" />
              {view === 'qr' ? 'Payment methods' : 'Back'}
            </button>
            <div>
              <strong>{company.shortName}</strong>
              <span>Secure customer checkout</span>
            </div>
          </div>

          {view === 'methods' ? (
            <>
              <div className="checkout-payment-title">
                <span className="eyebrow">PAYMENT</span>
                <h2 id="profile-payment-title">Choose payment method</h2>
                <p>Pick how you want to pay quotation {item.referenceNumber}.</p>
              </div>

              <div className="checkout-payment-grid">
                <div className="payment-method-list" role="radiogroup" aria-label="Payment methods">
                  {paymentMethods.map((method) => {
                    const Icon = method.icon
                    const checked = selectedMethod === method.id
                    return (
                      <button
                        key={method.id}
                        type="button"
                        className={`payment-method-card ${checked ? 'selected' : ''}`}
                        role="radio"
                        aria-checked={checked}
                        onClick={() => selectMethod(method.id)}
                      >
                        <span className="payment-method-icon"><Icon size={22} aria-hidden="true" /></span>
                        <span>
                          <strong>{method.name}</strong>
                          <small>{method.description}</small>
                        </span>
                        <span className="payment-method-check" aria-hidden="true">{checked ? <CheckCircle2 size={20} /> : ''}</span>
                      </button>
                    )
                  })}

                  <div className={`payment-method-detail ${selected.active ? 'ready' : 'unavailable'}`}>
                    <div className="payment-method-detail-heading">
                      <SelectedIcon size={20} aria-hidden="true" />
                      <strong>{selected.name}</strong>
                    </div>
                    <p>Continue to view the payment details, then submit the transaction reference and screenshot from your completed payment.</p>
                  </div>
                </div>

                <OrderSummary item={item} quotation={quotation} itemCount={itemCount} total={total} />
              </div>

              <div className="checkout-action-bar">
                <div>
                  <span>Amount due</span>
                  <strong>{formatPeso(total)}</strong>
                </div>
                <button className="btn primary" type="button" onClick={continueToQr}>
                  Continue with {selected.name}
                </button>
              </div>
            </>
          ) : (
            <div className="qr-payment-view">
              <div className="checkout-payment-title">
                <span className="eyebrow">{selected.name}</span>
                <h2 id="profile-payment-title">Pay with {selected.name}</h2>
                <p>Use the exact amount and reference below when completing payment.</p>
              </div>

              <div className="checkout-payment-grid qr-layout">
                <div className="qr-instructions-panel">
                  <div className="qr-amount-card">
                    <span>Amount to pay</span>
                    <strong>{formatPeso(total)}</strong>
                    <small>Order reference: {item.referenceNumber}</small>
                  </div>

                  {selectedMethod === 'qrph' && <div className="qr-display-area">
                    {hasQrImage ? (
                      <>
                        {qrLoadStatus === 'loading' && <div className="qr-placeholder"><Loader2 className="qr-spinner" size={28} aria-hidden="true" /> Loading QR image...</div>}
                        <img
                          src={qrPhPaymentConfig.qrImageSrc}
                          alt="Katala QR PH payment code"
                          className={qrLoadStatus === 'loaded' ? '' : 'qr-image-hidden'}
                          onLoad={() => setQrLoadStatus('loaded')}
                          onError={() => setQrLoadStatus('error')}
                        />
                        {qrLoadStatus === 'error' && <div className="qr-placeholder error">QR image could not be loaded. Please check the configured image path.</div>}
                      </>
                    ) : (
                      <div className="qr-placeholder">
                        <QrCode size={46} aria-hidden="true" />
                        <strong>QR code will be provided.</strong>
                        <span>No scannable payment QR is configured yet.</span>
                      </div>
                    )}
                  </div>}

                  {selectedMethod === 'ewallet' && <div className="qr-recipient-box"><span>GCash / E-wallet details</span><strong>{ewalletPaymentConfig.accountName || company.legalName}</strong><small>{ewalletPaymentConfig.accountNumber || 'Contact Katala for the account number.'}</small></div>}
                  {selectedMethod === 'bank' && <div className="qr-recipient-box"><span>{bankPaymentConfig.bankName || 'Bank transfer details'}</span><strong>{bankPaymentConfig.accountName || company.legalName}</strong><small>{bankPaymentConfig.accountNumber || 'Contact Katala for the bank account number.'}</small></div>}

                  <div className="payment-proof-form">
                    <label><span>Payment reference number</span><input required maxLength="120" value={providerReference} onChange={(event) => setProviderReference(event.target.value)} placeholder="Enter the reference from your receipt" /></label>
                    <label><span>Payment screenshot / receipt image</span><input required type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseProof} /></label>
                  </div>
                  {proofImage && <img className="payment-proof-preview" src={proofImage} alt="Selected payment proof" />}

                  <div className={`qr-action-row ${selectedMethod !== 'qrph' ? 'single' : ''}`}>
                    {selectedMethod === 'qrph' && <button className="btn secondary" type="button" disabled={!qrReady} onClick={downloadQr}>
                      <Download size={17} aria-hidden="true" />
                      Download QR
                    </button>}
                    <button className="btn primary" type="button" disabled={submitting || paymentSubmitted} onClick={confirmPaid}>
                      {submitting ? 'Submitting...' : 'Submit payment confirmation'}
                    </button>
                  </div>
                  {!paymentSubmitted && (!providerReference.trim() || !proofImage) && <p className="payment-proof-hint">Enter the payment reference and choose a receipt image to enable submission.</p>}

                  {selectedMethod === 'qrph' && !hasQrImage && <div className="form-status loading">QR PH is prepared, but no QR image is configured.</div>}
                  {selectedMethod === 'qrph' && qrLoadStatus === 'error' && <div className="form-status error">The configured QR image is missing or invalid.</div>}
                  {paymentNotice && <div className={`form-status ${paymentSubmitted ? 'success' : 'error'}`}>{paymentNotice}</div>}
                </div>

                <aside className="qr-side-panel">
                  <OrderSummary item={item} quotation={quotation} itemCount={itemCount} total={total} compact />
                  {selectedMethod === 'qrph' && <div className="qr-recipient-box">
                    <span>Recipient</span>
                    <strong>{qrPhPaymentConfig.recipientName || company.legalName}</strong>
                    <small>{qrPhPaymentConfig.recipientAccount || company.email}</small>
                  </div>}
                  <ol className="qr-instruction-list">
                    <li>Open the selected payment app or bank.</li>
                    <li>Use the payment details displayed on this page.</li>
                    <li>Verify the recipient and enter the exact amount shown here if required.</li>
                    <li>Include the order reference if your app allows notes.</li>
                    <li>Save the payment reference and a screenshot of the receipt.</li>
                    <li>Submit both above and wait for Katala staff verification.</li>
                  </ol>
                  <p className="qr-payment-note">{qrPhPaymentConfig.note}</p>
                </aside>
              </div>

              <button className="checkout-back-link" type="button" onClick={() => setView('methods')}>
                <ArrowLeft size={16} aria-hidden="true" />
                Back to payment methods
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function OrderSummary({ item, quotation, itemCount, total, compact = false }) {
  const charges = quotation.charges || []
  const subtotal = Number(quotation.subtotal || charges.reduce((sum, charge) => sum + Number(charge.subtotal || 0), 0) || total)
  const discount = Number(quotation.discount || 0)
  const shipping = Number(quotation.shipping || item.shipping || 0)
  return (
    <aside className={`order-summary-card ${compact ? 'compact' : ''}`}>
      <div>
        <span className="eyebrow">ORDER SUMMARY</span>
        <h3>{item.referenceNumber}</h3>
        <p>{quotationTitle(item)}</p>
      </div>
      <div className="order-summary-lines">
        <div><span>Items</span><strong>{itemCount} {itemCount === 1 ? 'item' : 'items'}</strong></div>
        {!compact && charges.slice(0, 4).map((charge) => (
          <div key={charge.id || charge.description}>
            <span>{charge.description || charge.type || 'Quoted item'}</span>
            <strong>{formatPeso(charge.subtotal)}</strong>
          </div>
        ))}
        {!compact && charges.length > 4 && <div><span>Additional quoted items</span><strong>{charges.length - 4}</strong></div>}
        <div><span>Subtotal</span><strong>{formatPeso(subtotal)}</strong></div>
        <div><span>Shipping</span><strong>{shipping > 0 ? formatPeso(shipping) : 'Included / none'}</strong></div>
        <div><span>Discount</span><strong>{discount > 0 ? `-${formatPeso(discount)}` : 'None'}</strong></div>
      </div>
      <div className="order-summary-total">
        <span>Total</span>
        <strong>{formatPeso(total)}</strong>
      </div>
    </aside>
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
                  <strong>{receiptChargeLabel(charge)}</strong>
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
    status: mergedStatus(workflow.status, item.status, workflow.updatedAt, item.updatedAt),
    schedule: workflow.schedule || { date: item.preferredDate || '', time: item.preferredTime || '', staff: item.staff || '' },
    quotation: normalizeQuotation(workflow.quotation, { ...base, ...item, totalAmount: item.totalAmount }),
    payment: item.payment || workflow.payment,
    receipt: workflow.receipt,
  }
}

function receiptChargeLabel(charge) {
  if (String(charge.type || '').toLowerCase().includes('material') && charge.materialCode) {
    return charge.materialCode
  }
  return charge.description || charge.serviceName || charge.type || 'Quoted item'
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

function hasAssignedSchedule(item) {
  return Boolean(assignedStaff(item) && (item.schedule?.date || item.schedule?.time))
}

function scheduleLabel(item) {
  return hasAssignedSchedule(item) ? 'Schedule' : 'Preferred schedule'
}

function assignedStaff(item) {
  return item.schedule?.staff || item.staff || ''
}

function scheduleUpdateNotice(item) {
  if (!item.scheduleChangedAt && !item.scheduleChangeNotice) return ''
  const schedule = formatSchedule(item.schedule?.date || item.preferredDate, item.schedule?.time || item.preferredTime)
  const staff = assignedStaff(item)
  return item.scheduleChangeNotice || `Schedule updated: ${[schedule, staff].filter(Boolean).join(' / ')}`
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

function mergedStatus(localStatus, backendStatus, localUpdatedAt = '', backendUpdatedAt = '') {
  const local = displayStatus(localStatus)
  const backend = displayStatus(backendStatus)
  if (local === 'Completed' && ['Ready for Payment', 'Customer Confirmed', 'Paid'].includes(backend)) return backend
  if (isNewerOrSame(backendUpdatedAt, localUpdatedAt)) return backend
  return statusRank(local) > statusRank(backend) ? local : backend
}

function isNewerOrSame(primaryDate, secondaryDate) {
  const primary = Date.parse(primaryDate || '')
  const secondary = Date.parse(secondaryDate || '')
  if (!Number.isFinite(primary) || !Number.isFinite(secondary)) return false
  return primary >= secondary
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
