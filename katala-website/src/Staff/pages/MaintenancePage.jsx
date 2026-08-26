import { useEffect, useState } from 'react';
import { CheckCircle2, CalendarClock } from 'lucide-react';
import { PageHeading, RefreshTableButton, SummaryCard } from '../StaffShared';
import { useStaffSearch } from '../StaffLayout';
import { schemaApi } from '../../services/katalaApi';
import { completeRecurringVisit, filterStaffItems, isRecurringService, recurrenceOptions, staffMembers, today, upsertWorkflow, workflowItemsFromQueue } from '../staffWorkflow';

function MaintenancePage() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState({ type: 'loading', message: 'Loading maintenance records...' });
  const { normalizedQuery } = useStaffSearch();

  useEffect(() => {
    load();
    const sync = () => load(false);
    window.addEventListener('katala-workflow-changed', sync);
    return () => window.removeEventListener('katala-workflow-changed', sync);
  }, []);

  async function load(showLoading = true) {
    if (showLoading) setStatus({ type: 'loading', message: 'Loading maintenance records...' });
    try {
      const data = await schemaApi.listStaffRequests();
      const rows = workflowItemsFromQueue(data.items || [])
        .filter((item) => ['Scheduled', 'In Progress', 'Completed'].includes(item.status) || (item.status === 'Paid' && hasFullSchedule(item)))
        .filter((item) => !item.maintenanceClosed)
        .filter(isRecurringService);
      setItems(rows);
      setStatus({ type: 'idle', message: '' });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to load maintenance records.' });
    }
  }

  async function update(item, patch) {
    if (patch.schedule?.date && patch.schedule.date < today()) {
      setStatus({ type: 'error', message: 'Maintenance date cannot be in the past.' });
      return;
    }
    if (patch.maintenanceClosed && !window.confirm(`End maintenance plan ${item.id}? This will move the recurring record to Completed Work.`)) return;
    if (!patch.maintenanceClosed && patch.status === 'Completed' && !window.confirm(`Complete this maintenance visit for ${item.id}? The recurring maintenance record will remain active.`)) return;
    const workflowPatch = completeRecurringVisit(item, patch);
    const visits = workflowPatch.visits || item.visits;
    upsertWorkflow(item.id, {
      ...workflowPatch,
      status: patch.maintenanceClosed ? 'Completed' : (workflowPatch.status || patch.status),
      serviceType: 'Recurring',
      visits,
      maintenanceEndedAt: patch.maintenanceClosed ? new Date().toISOString() : item.maintenanceEndedAt,
    });
    if (item.kind !== 'Quotation') {
      await schemaApi.updateStaffServiceRequest(item.id, {
        status: workflowPatch.status || patch.status || item.status,
        preferredDate: workflowPatch.schedule?.date || patch.schedule?.date || item.schedule?.date || '',
        preferredTime: workflowPatch.schedule?.time || patch.schedule?.time || item.schedule?.time || '',
        recurrenceFrequency: workflowPatch.recurrenceFrequency || patch.recurrenceFrequency || item.recurrenceFrequency || 'Monthly',
        remarks: 'Updated from Staff maintenance',
      });
    }
    load(false);
  }

  const shown = filterStaffItems(items, normalizedQuery);
  const scheduled = shown.filter((item) => item.status === 'Scheduled').length;
  const completedVisits = shown.reduce((sum, item) => sum + (item.visits?.length || (item.status === 'Completed' ? 1 : 0)), 0);

  return (
    <>
      <PageHeading
        title="Regular Maintenance Checkups"
        copy="Recurring services appear here after staff sets the company schedule."
        actions={<RefreshTableButton onClick={() => load()} loading={status.type === 'loading'} />}
      />
      {status.type !== 'idle' && <Notice status={status} />}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <SummaryCard label="Scheduled" value={scheduled} />
        <SummaryCard label="Completed visits" value={completedVisits} />
      </div>
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="hidden md:grid grid-cols-[1fr_1.05fr_1.15fr_minmax(250px,1.25fr)_1fr_1fr_minmax(250px,auto)] gap-4 px-6 py-4 bg-slate-50/50 text-xs font-bold text-slate-500 uppercase">
          <span>Plan ID</span><span>Customer</span><span>Scope</span><span>Schedule</span><span>Staff</span><span>Frequency</span><span>Action</span>
        </div>
        <div className="divide-y divide-slate-100">
          {shown.map((item) => <MaintenanceRow key={item.id} item={item} onUpdate={update} />)}
          {!shown.length && status.type === 'idle' && <div className="px-6 py-10 text-sm text-slate-500">{normalizedQuery ? 'No maintenance records match your search.' : 'No scheduled recurring maintenance requests yet.'}</div>}
        </div>
      </section>
    </>
  );
}

function MaintenanceRow({ item, onUpdate }) {
  const [draft, setDraft] = useState({
    date: item.schedule?.date || item.preferredDate || '',
    time: item.schedule?.time || item.preferredTime || '',
    staff: item.schedule?.staff || '',
    recurrenceFrequency: item.recurrenceFrequency === 'One-time' ? 'Monthly' : (item.recurrenceFrequency || 'Monthly'),
  });

  useEffect(() => {
    setDraft({
      date: item.schedule?.date || item.preferredDate || '',
      time: item.schedule?.time || item.preferredTime || '',
      staff: item.schedule?.staff || '',
      recurrenceFrequency: item.recurrenceFrequency === 'One-time' ? 'Monthly' : (item.recurrenceFrequency || 'Monthly'),
    });
  }, [item]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_1.05fr_1.15fr_minmax(250px,1.25fr)_1fr_1fr_minmax(250px,auto)] gap-3 md:gap-4 px-5 md:px-6 py-5 items-start md:items-center hover:bg-slate-50/50">
      <span className="text-sm font-bold text-[#b3000c]">{item.id}<br /><small className="text-slate-500 font-normal">{item.visits?.length || 0} visit(s)</small></span>
      <span className="text-sm font-medium text-slate-900">{item.customer}</span>
      <span className="text-sm text-slate-600">{item.subject}<br /><small className="text-slate-500">{draft.recurrenceFrequency}</small></span>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 min-w-0">
        <input className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm" type="date" min={today()} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
        <input className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm" type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
      </div>
      <select className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm" value={draft.staff} onChange={(e) => setDraft({ ...draft, staff: e.target.value })}>
        <option value="">Unassigned</option>
        {staffMembers.map((name) => <option key={name}>{name}</option>)}
      </select>
      <select className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm" value={draft.recurrenceFrequency} onChange={(e) => setDraft({ ...draft, recurrenceFrequency: e.target.value })}>
        {recurrenceOptions.filter((option) => option !== 'One-time').map((option) => <option key={option}>{option}</option>)}
      </select>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="inline-flex items-center gap-2 rounded-lg bg-[#b3000c] text-white px-3 py-2 text-sm font-bold disabled:opacity-50" disabled={!draft.date || !draft.time} onClick={() => onUpdate(item, { status: 'Scheduled', schedule: draft, recurrenceFrequency: draft.recurrenceFrequency })}>
          <CalendarClock className="w-4 h-4" /> Update schedule
        </button>
        <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50" disabled={!draft.date || !draft.time} onClick={() => onUpdate(item, { status: 'Completed', schedule: draft, recurrenceFrequency: draft.recurrenceFrequency })}>
          <CheckCircle2 className="w-4 h-4" /> Visit done
        </button>
        <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-[#b3000c]" onClick={() => onUpdate(item, { status: 'Completed', schedule: draft, recurrenceFrequency: draft.recurrenceFrequency, maintenanceClosed: true })}>
          <CheckCircle2 className="w-4 h-4" /> End plan
        </button>
      </div>
    </div>
  );
}

function Notice({ status }) {
  const style = status.type === 'error' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-blue-50 text-blue-700 border-blue-100';
  return <div className={`mb-6 rounded-lg border px-4 py-3 text-sm ${style}`}>{status.message}</div>;
}

function hasFullSchedule(item) {
  return Boolean(item.schedule?.date && item.schedule?.time && item.schedule?.staff);
}

export default MaintenancePage;
