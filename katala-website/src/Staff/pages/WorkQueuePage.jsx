import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Eye, Plus, Save, Trash2 } from 'lucide-react';
import { PageHeading, RefreshTableButton, StatusBadge } from '../StaffShared';
import { useStaffSearch } from '../StaffLayout';
import { schemaApi } from '../../services/katalaApi';
import {
  chargeTypes,
  filterStaffItems,
  normalizeCharge,
  normalizeQuotation,
  overlayWorkflow,
  staffMembers,
  today,
  upsertWorkflow,
  workflowItemsFromQueue,
} from '../staffWorkflow';

const reviewStatuses = ['Under Review', 'Quotation Draft', 'Ready for Payment'];
const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

function WorkQueuePage() {
  const [queue, setQueue] = useState([]);
  const [activeRequest, setActiveRequest] = useState(null);
  const [status, setStatus] = useState({ type: 'loading', message: 'Loading customer requests...' });
  const { normalizedQuery } = useStaffSearch();

  useEffect(() => {
    loadQueue();
    const sync = () => loadQueue(false);
    window.addEventListener('katala-workflow-changed', sync);
    return () => window.removeEventListener('katala-workflow-changed', sync);
  }, []);

  async function loadQueue(showLoading = true) {
    if (showLoading) setStatus({ type: 'loading', message: 'Loading customer requests...' });
    try {
      const data = await schemaApi.listStaffRequests();
      const rows = workflowItemsFromQueue(data.items || [])
        .filter((item) => reviewStatuses.includes(item.status));
      setQueue(rows);
      setActiveRequest((current) => current ? rows.find((item) => item.id === current.id) || null : null);
      setStatus({ type: 'idle', message: '' });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to load customer requests.' });
    }
  }

  async function updateRequest(item, patch, options = {}) {
    if (!item) return;
    if (options.confirmMessage && !window.confirm(options.confirmMessage)) return;
    setStatus({ type: 'loading', message: 'Saving workflow update...' });
    try {
      const next = upsertWorkflow(item.id, patch);
      const backendPatch = backendStatusPatch(item, patch);
      if (backendPatch) {
        if (item.kind === 'Quotation') await schemaApi.updateStaffQuotation(item.id, backendPatch);
        else await schemaApi.updateStaffServiceRequest(item.id, backendPatch);
      }
      const merged = overlayWorkflow({ ...item, ...next });
      setQueue((current) => current
        .map((row) => row.id === item.id ? merged : row)
        .filter((row) => reviewStatuses.includes(row.status)));
      setActiveRequest(options.closeOnSuccess ? null : reviewStatuses.includes(merged.status) ? merged : null);
      setStatus({ type: 'success', message: options.successMessage || 'Workflow updated.' });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to update workflow.' });
    }
  }

  const shown = filterStaffItems(queue, normalizedQuery);

  return (
    <>
      <PageHeading
        title="Customer Requests"
        copy="Review request details, prepare quotation charges, and mark quotes ready for customer payment."
        actions={<RefreshTableButton onClick={() => loadQueue()} loading={status.type === 'loading'} />}
      />
      {status.type !== 'idle' && <Notice status={status} />}
      <RequestTable items={shown} query={normalizedQuery} onViewDetails={setActiveRequest} />
      {activeRequest && (
        <RequestModal
          item={activeRequest}
          onClose={() => setActiveRequest(null)}
          onUpdate={updateRequest}
        />
      )}
    </>
  );
}

function RequestTable({ items, query, onViewDetails }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="hidden md:grid grid-cols-[1fr_1.25fr_1.5fr_1fr_auto] gap-4 px-6 py-4 bg-slate-50/50 text-xs font-bold text-slate-500 uppercase">
        <span>Reference</span><span>Customer</span><span>Request</span><span>Status</span><span>Action</span>
      </div>
      <div className="divide-y divide-slate-100">
        {items.map((item) => (
          <div key={item.id} className="grid grid-cols-1 md:grid-cols-[1fr_1.25fr_1.5fr_1fr_auto] gap-3 md:gap-4 px-5 md:px-6 py-5 items-start md:items-center bg-white hover:bg-slate-50/70">
            <span className="text-sm font-bold text-[#b3000c]">{item.id}</span>
            <span className="text-sm font-medium text-slate-900">{item.customer}<br /><small className="text-slate-500 font-normal">{item.email || item.contactNumber || 'No contact on file'}</small></span>
            <span className="text-sm text-slate-600">{item.subject}<br /><small className="text-slate-500">{item.kind} / {item.priority} priority</small></span>
            <span><StatusBadge status={item.status} /></span>
            <button type="button" onClick={() => onViewDetails(item)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
              <Eye className="w-4 h-4" /> View Details
            </button>
          </div>
        ))}
        {!items.length && <div className="px-6 py-10 text-sm text-slate-500">{query ? 'No customer requests match your search.' : 'No requests are waiting for quotation review.'}</div>}
      </div>
    </section>
  );
}

function RequestModal({ item, onClose, onUpdate }) {
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-900/40 p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="w-full max-w-5xl max-h-[calc(100vh-32px)] overflow-auto rounded-xl bg-white shadow-2xl border border-slate-200" role="dialog" aria-modal="true" aria-labelledby="staff-request-title">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Request review</p>
            <h2 id="staff-request-title" className="text-xl font-bold text-slate-900">{item.id}</h2>
            <p className="text-sm text-slate-500">{item.customer} / {item.subject}</p>
          </div>
          <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50" onClick={onClose}>Close</button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-6 p-5">
          <RequestDetails item={item} />
          <QuotationPanel item={item} onUpdate={onUpdate} />
        </div>
      </section>
    </div>
  );
}

function RequestDetails({ item }) {
  const rows = [
    ['Customer', item.customer],
    ['Company', item.company || 'Not provided'],
    ['Email', item.email || 'Not provided'],
    ['Contact number', item.contactNumber || 'Not provided'],
    ['Complete service address', item.projectAddress || 'Not provided'],
    ['Requested service', item.subject || item.serviceName || item.kind],
    ['Service frequency', item.recurrenceFrequency || 'One-time'],
    ['Preferred date', formatDate(item.preferredDate)],
    ['Preferred time', formatTime(item.preferredTime)],
    ['Description', item.problemDescription || item.projectDescription || 'No description provided.'],
    ['Customer remarks', item.customerRemarks || 'No remarks provided.'],
    ['Request date', formatDateTime(item.submittedAt)],
  ];

  return (
    <aside className="rounded-xl border border-slate-200 bg-slate-50/50 p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <h3 className="text-lg font-bold text-slate-900">Details</h3>
        <StatusBadge status={item.status} />
      </div>
      <dl className="grid gap-3">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-1">
            <dt className="text-[10px] font-bold text-slate-400 uppercase">{label}</dt>
            <dd className="text-sm text-slate-700 break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

function QuotationPanel({ item, onUpdate }) {
  const [draft, setDraft] = useState(() => normalizeQuotation(item.quotation, item));
  const [scheduleDraft, setScheduleDraft] = useState(() => ({
    date: item.schedule?.date || item.preferredDate || '',
    time: item.schedule?.time || item.preferredTime || '',
    staff: item.schedule?.staff || '',
  }));
  const [formError, setFormError] = useState('');

  useEffect(() => {
    setDraft(normalizeQuotation(item.quotation, item));
    setScheduleDraft({
      date: item.schedule?.date || item.preferredDate || '',
      time: item.schedule?.time || item.preferredTime || '',
      staff: item.schedule?.staff || '',
    });
    setFormError('');
  }, [item]);

  const totals = useMemo(() => normalizeQuotation(draft, item), [draft, item]);

  function updateCharge(id, patch) {
    setDraft((current) => ({
      ...current,
      charges: current.charges.map((charge) => charge.id === id ? normalizeCharge({ ...charge, ...patch }) : charge),
    }));
  }

  function addCharge() {
    setDraft((current) => ({
      ...current,
      charges: [...current.charges, normalizeCharge({ type: 'Other custom charge', quantity: 1, unitPrice: 0 })],
    }));
  }

  function removeCharge(id) {
    setDraft((current) => ({
      ...current,
      charges: current.charges.length > 1 ? current.charges.filter((charge) => charge.id !== id) : current.charges,
    }));
  }

  function validate() {
    if (!draft.quotationDate) return 'Quotation date is required.';
    if (draft.quotationDate < today()) return 'Quotation date cannot be in the past.';
    if (draft.validUntil && draft.validUntil < today()) return 'Quotation validity date cannot be in the past.';
    if (!draft.charges.length) return 'Add at least one charge item.';
    if (draft.charges.some((charge) => !charge.description.trim())) return 'Each charge item needs a description.';
    if (draft.charges.some((charge) => !Number.isInteger(Number(charge.quantity)) || Number(charge.quantity) < 1)) return 'Quantities must be whole numbers greater than zero.';
    if (draft.charges.some((charge) => Number(charge.unitPrice) < 0)) return 'Prices must be non-negative numbers.';
    if (totals.total <= 0) return 'Final total must be greater than zero before customer payment.';
    if (!scheduleDraft.date || !scheduleDraft.time) return 'Add the proposed service date and time before customer payment.';
    return '';
  }

  function saveQuotation(nextStatus) {
    const error = nextStatus === 'Ready for Payment' ? validate() : '';
    if (error) {
      setFormError(error);
      return;
    }
    onUpdate(item, {
      status: nextStatus,
      quotation: totals,
      schedule: scheduleDraft,
      serviceType: item.serviceType || 'One-time',
    }, {
      confirmMessage: nextStatus === 'Ready for Payment' ? `Mark ${item.id} as Ready for Payment? The customer will see this quotation and proposed schedule in their profile.` : '',
      successMessage: nextStatus === 'Ready for Payment' ? 'Quotation and proposed schedule are ready for customer payment.' : 'Quotation draft saved.',
      closeOnSuccess: nextStatus === 'Ready for Payment',
    });
  }

  return (
    <div className="grid gap-4">
      <div>
        <h3 className="text-lg font-bold text-slate-900">Quotation charges</h3>
        <p className="text-sm text-slate-500">Edit charges here, save as draft, or mark ready for customer payment.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Quotation date"><input type="date" min={today()} value={draft.quotationDate} onChange={(e) => setDraft({ ...draft, quotationDate: e.target.value })} /></Field>
        <Field label="Valid until"><input type="date" value={draft.validUntil} min={today()} onChange={(e) => setDraft({ ...draft, validUntil: e.target.value })} /></Field>
      </div>

      <div className="grid gap-3">
        {draft.charges.map((charge) => (
          <div key={charge.id} className="rounded-lg border border-slate-200 p-3 grid gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
              <Field label="Type">
                <select value={charge.type} onChange={(e) => updateCharge(charge.id, { type: e.target.value })}>
                  {chargeTypes.map((type) => <option key={type}>{type}</option>)}
                </select>
              </Field>
              <button type="button" className="self-end h-10 w-10 grid place-items-center rounded-lg border border-slate-200 text-slate-500 hover:text-[#b3000c]" onClick={() => removeCharge(charge.id)} title="Remove charge item">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            {charge.type === 'Materials charge' && (
              <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_0.8fr] gap-3">
                <Field label="Material code"><input value={charge.materialCode || ''} onChange={(e) => updateCharge(charge.id, { materialCode: e.target.value })} placeholder="Material or product code" /></Field>
                <Field label="Stock on hand"><input value={charge.stockOnHand ?? 'Not tracked'} readOnly /></Field>
              </div>
            )}
            {charge.type === 'Service charge' && (
              <Field label="Service name"><input value={charge.serviceName || ''} onChange={(e) => updateCharge(charge.id, { serviceName: e.target.value })} placeholder="Service name" /></Field>
            )}
            <Field label="Description"><input value={charge.description} onChange={(e) => updateCharge(charge.id, { description: e.target.value })} /></Field>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Qty"><input type="number" min="1" step="1" value={charge.quantity} onChange={(e) => updateCharge(charge.id, { quantity: e.target.value })} /></Field>
              <Field label="Unit price"><input type="number" min="0" step="0.01" value={charge.unitPrice} onChange={(e) => updateCharge(charge.id, { unitPrice: e.target.value })} /></Field>
              <div className="grid gap-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Subtotal</span>
                <strong className="h-10 flex items-center text-sm text-slate-900">{peso.format(charge.subtotal)}</strong>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button type="button" className="inline-flex w-fit items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50" onClick={addCharge}>
        <Plus className="w-4 h-4" /> Add charge
      </button>

      <Field label="Discount"><input type="number" min="0" step="0.01" value={draft.discount} onChange={(e) => setDraft({ ...draft, discount: e.target.value })} /></Field>
      <Field label="Notes"><textarea rows="2" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></Field>
      <Field label="Terms"><textarea rows="2" value={draft.terms} onChange={(e) => setDraft({ ...draft, terms: e.target.value })} /></Field>

      <div className="rounded-lg border border-slate-200 p-4 grid gap-3">
        <div className="flex items-center gap-2 text-slate-900">
          <CalendarClock className="h-4 w-4 text-[#b3000c]" />
          <h4 className="text-sm font-bold">Proposed service schedule</h4>
        </div>
        <p className="text-sm text-slate-500">This schedule will be shown to the customer before they confirm and pay.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Schedule date"><input type="date" min={today()} value={scheduleDraft.date} onChange={(e) => setScheduleDraft({ ...scheduleDraft, date: e.target.value })} /></Field>
          <Field label="Schedule time"><input type="time" value={scheduleDraft.time} onChange={(e) => setScheduleDraft({ ...scheduleDraft, time: e.target.value })} /></Field>
          <Field label="Responsible staff">
            <select value={scheduleDraft.staff} onChange={(e) => setScheduleDraft({ ...scheduleDraft, staff: e.target.value })}>
              <option value="">Assign later</option>
              {staffMembers.map((name) => <option key={name}>{name}</option>)}
            </select>
          </Field>
        </div>
      </div>

      <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-2 text-sm">
        <PriceLine label="Subtotal" value={totals.subtotal} />
        <PriceLine label="Discount" value={-totals.discount} />
        <PriceLine label="Final total" value={totals.total} strong />
      </div>
      {formError && <div className="rounded-lg bg-red-50 border border-red-100 text-red-700 px-3 py-2 text-sm">{formError}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button type="button" className="inline-flex items-center justify-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg font-bold hover:bg-slate-700" onClick={() => saveQuotation('Quotation Draft')}>
          <Save className="w-4 h-4" /> Save draft
        </button>
        <button type="button" className="bg-[#b3000c] text-white px-4 py-2 rounded-lg font-bold hover:bg-[#8b000a]" onClick={() => saveQuotation('Ready for Payment')}>
          Ready for Payment
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="grid gap-1 text-sm font-bold text-slate-600 [&_input]:w-full [&_input]:bg-slate-50 [&_input]:border [&_input]:border-slate-200 [&_input]:rounded-lg [&_input]:px-3 [&_input]:py-2 [&_input]:text-sm [&_select]:w-full [&_select]:bg-slate-50 [&_select]:border [&_select]:border-slate-200 [&_select]:rounded-lg [&_select]:px-3 [&_select]:py-2 [&_select]:text-sm [&_textarea]:w-full [&_textarea]:bg-slate-50 [&_textarea]:border [&_textarea]:border-slate-200 [&_textarea]:rounded-lg [&_textarea]:px-3 [&_textarea]:py-2 [&_textarea]:text-sm">
      <span className="text-[10px] font-bold text-slate-400 uppercase">{label}</span>
      {children}
    </label>
  );
}

function PriceLine({ label, value, strong = false }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? 'pt-2 border-t border-slate-200 text-base font-bold text-slate-900' : 'text-slate-600'}`}>
      <span>{label}</span>
      <strong>{peso.format(value)}</strong>
    </div>
  );
}

function Notice({ status }) {
  const style = status.type === 'error'
    ? 'bg-red-50 text-red-700 border-red-100'
    : status.type === 'success'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
      : 'bg-blue-50 text-blue-700 border-blue-100';
  return <div className={`mb-6 rounded-lg border px-4 py-3 text-sm ${style}`}>{status.message}</div>;
}

function backendStatusPatch(item, patch) {
  if (!patch.status && !patch.schedule) return null;
  if (item.kind !== 'Quotation' && ['Quotation Draft', 'Ready for Payment', 'Customer Confirmed', 'Paid'].includes(patch.status)) {
    return null;
  }
  const status = item.kind === 'Quotation'
    ? backendQuotationStatus(patch.status || item.status)
    : (patch.status || item.status);
  const payload = { status, remarks: 'Updated from Staff workflow module' };
  if (item.kind === 'Quotation') {
    const quotation = patch.quotation || item.quotation;
    payload.additionalCost = quotation?.total ?? item.totalAmount ?? '';
    payload.validUntil = quotation?.validUntil || '';
  } else {
    payload.preferredDate = patch.schedule?.date || item.schedule?.date || item.preferredDate || '';
    payload.preferredTime = patch.schedule?.time || item.schedule?.time || item.preferredTime || '';
  }
  return payload;
}

function backendQuotationStatus(status) {
  if (status === 'Ready for Payment') return 'Accepted';
  if (status === 'Quotation Draft' || status === 'Under Review') return 'Submitted';
  return status;
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : 'Not available';
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : 'Not provided';
}

function formatTime(value) {
  return value || 'Not provided';
}

export default WorkQueuePage;
