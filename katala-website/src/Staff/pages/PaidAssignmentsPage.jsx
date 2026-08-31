import { useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2 } from 'lucide-react';
import { PageHeading, RefreshTableButton, StatusBadge } from '../StaffShared';
import { useStaffSearch } from '../StaffLayout';
import { schemaApi } from '../../services/katalaApi';
import { completeRecurringVisit, filterStaffItems, isRecurringService, recurrenceOptions, today, upsertWorkflow, workflowItemsFromQueue } from '../staffWorkflow';
import { useStaffMembers } from '../useStaffMembers';

function PaidAssignmentsPage() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState({ type: 'loading', message: 'Loading paid services...' });
  const { normalizedQuery } = useStaffSearch();
  const staffMembers = useStaffMembers();

  useEffect(() => {
    load();
    const sync = () => load(false);
    window.addEventListener('katala-workflow-changed', sync);
    return () => window.removeEventListener('katala-workflow-changed', sync);
  }, []);

  async function load(showLoading = true) {
    if (showLoading) setStatus({ type: 'loading', message: 'Loading paid services...' });
    try {
      const data = await schemaApi.listStaffRequests();
      const rows = workflowItemsFromQueue(data.items || [])
        .filter((item) => item.status === 'Paid')
        .filter((item) => !item.schedule?.date || !item.schedule?.time || !item.schedule?.staff);
      setItems(rows);
      setSelected((current) => current ? rows.find((item) => item.id === current.id) || rows[0] : rows[0] || null);
      setStatus({ type: 'idle', message: '' });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to load paid services.' });
    }
  }

  async function update(item, patch) {
    if (patch.schedule?.date && patch.schedule.date < today()) {
      setStatus({ type: 'error', message: 'Schedule date cannot be in the past.' });
      return;
    }
    const complete = patch.status === 'Completed';
    if (complete && !window.confirm(`Mark ${item.id} as completed? ${isRecurringService(item) ? 'It will remain in Maintenance.' : 'It will move to Completed Work.'}`)) return;

    const workflowPatch = complete && isRecurringService(item) ? completeRecurringVisit(item, patch) : patch;
    const visits = workflowPatch.visits || item.visits;

    upsertWorkflow(item.id, { ...workflowPatch, visits });
    if (item.referenceNumber && item.referenceNumber !== item.id) upsertWorkflow(item.referenceNumber, workflowPatch);
    if (item.kind === 'Quotation') {
      await schemaApi.updateStaffQuotation(item.id, {
        status: workflowPatch.status || patch.status || item.status,
        schedule: workflowPatch.schedule || patch.schedule || item.schedule || {},
        remarks: 'Updated from Paid service assignment',
        notifyCustomer: false,
      });
    } else {
      await schemaApi.updateStaffServiceRequest(item.id, {
        status: workflowPatch.status || patch.status || item.status,
        preferredDate: workflowPatch.schedule?.date || patch.schedule?.date || item.schedule?.date || '',
        preferredTime: workflowPatch.schedule?.time || patch.schedule?.time || item.schedule?.time || '',
        recurrenceFrequency: workflowPatch.recurrenceFrequency || patch.recurrenceFrequency || item.recurrenceFrequency || 'One-time',
        remarks: 'Updated from Paid service assignment',
        notifyCustomer: false,
      });
    }
    load(false);
  }

  const shown = filterStaffItems(items, normalizedQuery);

  return (
    <>
      <PageHeading
        title="Paid Service Assignment"
        copy="Assign paid requests to a service date, time, and responsible staff member."
        actions={<RefreshTableButton onClick={() => load()} loading={status.type === 'loading'} />}
      />
      {status.type !== 'idle' && <Notice status={status} />}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_430px] gap-6">
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="hidden md:grid grid-cols-[1fr_1.2fr_1.35fr_1fr_1fr] gap-4 px-6 py-4 bg-slate-50/50 text-xs font-bold text-slate-500 uppercase">
            <span>Reference</span><span>Customer</span><span>Service</span><span>Assigned staff</span><span>Status</span>
          </div>
          <div className="divide-y divide-slate-100">
            {shown.map((item) => (
              <button key={item.id} type="button" onClick={() => setSelected(item)} className={`w-full grid grid-cols-1 md:grid-cols-[1fr_1.2fr_1.35fr_1fr_1fr] gap-3 md:gap-4 px-5 md:px-6 py-5 text-left hover:bg-slate-50 ${selected?.id === item.id ? 'bg-red-50/50' : 'bg-white'}`}>
                <span className="text-sm font-bold text-[#b3000c]">{item.id}<br /><small className="text-slate-500 font-normal">{isRecurringService(item) ? 'Recurring' : 'One-time'}</small></span>
                <span className="text-sm font-medium text-slate-900">{item.customer}<br /><small className="text-slate-500 font-normal">{item.email || item.contactNumber || 'No contact on file'}</small></span>
                <span className="text-sm text-slate-600">{item.subject}</span>
                <span className="text-sm font-semibold text-slate-700">{item.schedule?.staff || 'Select in details'}</span>
                <span><StatusBadge status={item.status} /></span>
              </button>
            ))}
            {!shown.length && status.type === 'idle' && <div className="px-6 py-10 text-sm text-slate-500">{normalizedQuery ? 'No paid assignments match your search.' : 'No paid services are waiting for assignment.'}</div>}
          </div>
        </section>
        {selected ? <AssignmentPanel item={selected} staffMembers={staffMembers} onUpdate={update} /> : <aside className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-sm text-slate-500">Select a paid service to assign staff.</aside>}
      </div>
    </>
  );
}

function AssignmentPanel({ item, staffMembers, onUpdate }) {
  const maintenance = isMaintenanceAssignment(item);
  const [draft, setDraft] = useState({
    date: item.schedule?.date || item.preferredDate || '',
    time: item.schedule?.time || item.preferredTime || '',
    staff: item.schedule?.staff || '',
    recurrenceFrequency: maintenance ? recurringFrequency(item.recurrenceFrequency) : 'One-time',
  });

  useEffect(() => {
    setDraft({
      date: item.schedule?.date || item.preferredDate || '',
      time: item.schedule?.time || item.preferredTime || '',
      staff: item.schedule?.staff || '',
      recurrenceFrequency: maintenance ? recurringFrequency(item.recurrenceFrequency) : 'One-time',
    });
  }, [item, maintenance]);

  const schedule = { date: draft.date, time: draft.time, staff: draft.staff };
  const serviceType = maintenance ? 'Recurring' : 'One-time';
  const disabled = !draft.date || !draft.time || !draft.staff;

  return (
    <aside className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Request details</p>
          <h2 className="text-lg font-bold text-slate-900">{item.id}</h2>
        </div>
        <StatusBadge status={item.status} />
      </div>
      <dl className="grid gap-3 mb-5">
        <Detail label="Customer" value={item.customer} />
        <Detail label="Contact" value={[item.email, item.contactNumber].filter(Boolean).join(' / ') || 'Not provided'} />
        <Detail label="Address" value={item.projectAddress || 'Not provided'} />
        <Detail label="Service" value={item.subject} />
        {maintenance && <Detail label="Service frequency" value={recurringFrequency(item.recurrenceFrequency)} />}
        <Detail label="Description" value={item.problemDescription || item.projectDescription || 'No description provided.'} />
        <Detail label="Remarks" value={item.customerRemarks || 'No remarks provided.'} />
        <Detail label="Payment total" value={formatPeso(item.quotation?.total || item.totalAmount)} />
      </dl>

      <p className="text-xs text-slate-500 mb-3">Edit the schedule and responsible staff here, then press Assign.</p>
      <div className="grid gap-3">
        <Field label="Schedule date"><input type="date" min={today()} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></Field>
        <Field label="Schedule time"><input type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} /></Field>
        <Field label="Responsible staff">
          <select value={draft.staff} onChange={(e) => setDraft({ ...draft, staff: e.target.value })}>
            <option value="">Select staff member</option>
            {staffMembers.map((name) => <option key={name}>{name}</option>)}
          </select>
        </Field>
        {maintenance && <Field label="Service frequency">
          <select value={draft.recurrenceFrequency} onChange={(e) => setDraft({ ...draft, recurrenceFrequency: e.target.value })}>
            {recurrenceOptions.filter((option) => option !== 'One-time').map((option) => <option key={option}>{option}</option>)}
          </select>
        </Field>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
        <button type="button" className="inline-flex items-center justify-center gap-2 bg-[#b3000c] text-white px-4 py-2 rounded-lg font-bold hover:bg-[#8b000a] disabled:opacity-50" disabled={disabled} onClick={() => onUpdate(item, { status: 'Scheduled', schedule, recurrenceFrequency: draft.recurrenceFrequency, serviceType })}>
          <CalendarClock className="w-4 h-4" /> Assign
        </button>
        <button type="button" className="inline-flex items-center justify-center gap-2 border border-slate-200 text-slate-700 px-4 py-2 rounded-lg font-bold hover:bg-slate-50 disabled:opacity-50" disabled={disabled} onClick={() => onUpdate(item, { status: 'Completed', schedule, recurrenceFrequency: draft.recurrenceFrequency, serviceType })}>
          <CheckCircle2 className="w-4 h-4" /> Complete
        </button>
      </div>
    </aside>
  );
}

function Detail({ label, value }) {
  return (
    <div className="grid gap-1">
      <dt className="text-[10px] font-bold text-slate-400 uppercase">{label}</dt>
      <dd className="text-sm text-slate-700 break-words">{value}</dd>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="grid gap-1 text-sm font-bold text-slate-600 [&_input]:w-full [&_input]:bg-slate-50 [&_input]:border [&_input]:border-slate-200 [&_input]:rounded-lg [&_input]:px-3 [&_input]:py-2 [&_input]:text-sm [&_select]:w-full [&_select]:bg-slate-50 [&_select]:border [&_select]:border-slate-200 [&_select]:rounded-lg [&_select]:px-3 [&_select]:py-2 [&_select]:text-sm">
      <span className="text-[10px] font-bold text-slate-400 uppercase">{label}</span>
      {children}
    </label>
  );
}

function Notice({ status }) {
  const style = status.type === 'error' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-blue-50 text-blue-700 border-blue-100';
  return <div className={`mb-6 rounded-lg border px-4 py-3 text-sm ${style}`}>{status.message}</div>;
}

function isMaintenanceAssignment(item) {
  if (item.kind === 'Quotation') return false;
  return isRecurringService(item) || /maintenance|preventive/i.test([item.subject, item.serviceName, item.problemDescription].filter(Boolean).join(' '));
}

function recurringFrequency(value) {
  return value && value !== 'One-time' ? value : 'Monthly';
}

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

function formatPeso(value) {
  return peso.format(Number(value || 0));
}

export default PaidAssignmentsPage;
