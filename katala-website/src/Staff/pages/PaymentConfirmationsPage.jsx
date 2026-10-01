import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { schemaApi } from '../../services/katalaApi'
import { PageHeading, RefreshTableButton, StatusBadge } from '../StaffShared'
import { useStaffSearch } from '../staffSearch'

export default function PaymentConfirmationsPage() {
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState(null)
  const [status, setStatus] = useState({ type: 'loading', message: '' })
  const { normalizedQuery } = useStaffSearch()

  const load = useCallback(async () => {
    setStatus({ type: 'loading', message: 'Loading payment confirmations...' })
    try {
      const data = await schemaApi.listStaffPaymentConfirmations()
      setItems(data.items || [])
      setSelected((current) => (data.items || []).find((item) => item.paymentReference === current?.paymentReference) || data.items?.[0] || null)
      setStatus({ type: 'idle', message: '' })
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to load payment confirmations.' })
    }
  }, [])

  useEffect(() => { load() }, [load])

  const shown = useMemo(() => items.filter((item) => item.status === 'Awaiting Verification').filter((item) => [item.customerName, item.paymentMethod, item.paymentReference, item.providerReference, item.requestReference]
    .join(' ').toLowerCase().includes(normalizedQuery)), [items, normalizedQuery])
  const current = shown.find((item) => item.paymentReference === selected?.paymentReference) || shown[0] || null

  async function review(nextStatus) {
    if (!current || status.type === 'loading') return
    setStatus({ type: 'loading', message: `Saving ${nextStatus.toLowerCase()} status...` })
    try {
      await schemaApi.reviewStaffPayment(current.paymentReference, nextStatus)
      await load()
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to update payment.' })
    }
  }

  return <>
    <PageHeading title="Payment Confirmation" copy="Review customer payment references and uploaded proof of payment." actions={<RefreshTableButton onClick={load} loading={status.type === 'loading'} />} />
    {status.type === 'error' && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{status.message}</div>}
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[420px_1fr]">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {shown.map((item) => <button key={item.paymentReference} type="button" onClick={() => setSelected(item)} className={`w-full border-b border-slate-100 p-5 text-left hover:bg-slate-50 ${current?.paymentReference === item.paymentReference ? 'bg-red-50/50' : ''}`}>
          <div className="mb-2 flex items-start justify-between gap-3"><strong className="text-sm text-slate-900">{item.customerName}</strong><StatusBadge status={item.status} /></div>
          <p className="text-xs font-bold text-[#b3000c]">{item.paymentReference}</p>
          <p className="mt-1 text-sm text-slate-500">{item.paymentMethod} / {item.providerReference}</p>
        </button>)}
        {!shown.length && <p className="p-8 text-sm text-slate-500">No payment confirmations match your search.</p>}
      </section>
      {current ? <aside className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Payment proof</p><h2 className="text-xl font-bold text-slate-900">{current.customerName}</h2></div><strong className="text-lg text-[#b3000c]">₱{Number(current.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong></div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-400">Payment reference</dt><dd className="font-bold">{current.paymentReference}</dd></div>
          <div><dt className="text-slate-400">Customer reference</dt><dd className="font-bold">{current.providerReference}</dd></div>
          <div><dt className="text-slate-400">Request</dt><dd className="font-bold">{current.requestReference}</dd></div>
          <div><dt className="text-slate-400">Method</dt><dd className="font-bold">{current.paymentMethod}</dd></div>
          <div><dt className="text-slate-400">Email</dt><dd className="font-bold">{current.customerEmail}</dd></div>
          <div><dt className="text-slate-400">Submitted</dt><dd className="font-bold">{new Date(current.submittedAt).toLocaleString()}</dd></div>
        </dl>
        {current.proofImage && <a href={current.proofImage} target="_blank" rel="noreferrer"><img className="mt-6 max-h-[480px] w-full rounded-lg border border-slate-200 object-contain" src={current.proofImage} alt={`Payment proof from ${current.customerName}`} /></a>}
        {current.status === 'Awaiting Verification' && <div className="mt-6 flex gap-3"><button className="btn primary" type="button" onClick={() => review('Paid')}><CheckCircle2 className="h-4 w-4" /> Confirm payment</button><button className="btn secondary" type="button" onClick={() => review('Rejected')}><XCircle className="h-4 w-4" /> Reject</button></div>}
      </aside> : <aside className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Select a payment confirmation.</aside>}
    </div>
  </>
}
