import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeading, RefreshTableButton } from '../StaffShared';
import { schemaApi } from '../../services/katalaApi';
import { isRecurringService, staffMembers, upsertWorkflow, workflowItemsFromQueue } from '../staffWorkflow';

function ServiceCalendarPage() {
  const [items, setItems] = useState([]);
  const [monthDate, setMonthDate] = useState(() => startOfMonth(new Date()));
  const [focusedId, setFocusedId] = useState('');
  const [status, setStatus] = useState({ type: 'loading', message: 'Loading service calendar...' });

  useEffect(() => {
    load();
    const sync = () => load(false);
    window.addEventListener('katala-workflow-changed', sync);
    return () => window.removeEventListener('katala-workflow-changed', sync);
  }, []);

  async function load(showLoading = true) {
    if (showLoading) setStatus({ type: 'loading', message: 'Loading service calendar...' });
    try {
      const data = await schemaApi.listStaffRequests();
      const rows = workflowItemsFromQueue(data.items || [])
        .filter((item) => ['Scheduled', 'In Progress'].includes(item.status) || (item.status === 'Paid' && hasFullSchedule(item)))
        .sort((a, b) => scheduleSortValue(a) - scheduleSortValue(b));
      setItems(rows);
      setStatus({ type: 'idle', message: '' });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to load service calendar.' });
    }
  }

  async function update(item, patch) {
    const recurring = isRecurringService(item);
    if (patch.status === 'Completed' && !window.confirm(recurring
      ? `Complete this maintenance visit for ${item.id}? The recurring maintenance record will remain active.`
      : `Mark ${item.id} as completed? It will move to Completed Work.`)) return;
    const visits = patch.status === 'Completed' && recurring
      ? [...(item.visits || []), { completedAt: new Date().toISOString(), schedule: patch.schedule || item.schedule, staff: patch.schedule?.staff || item.schedule?.staff || '' }]
      : item.visits;
    upsertWorkflow(item.id, { ...patch, visits });
    if (item.kind !== 'Quotation') {
      await schemaApi.updateStaffServiceRequest(item.id, {
        status: patch.status || item.status,
        preferredDate: patch.schedule?.date || item.schedule?.date || '',
        preferredTime: patch.schedule?.time || item.schedule?.time || '',
        remarks: 'Updated from Staff service calendar',
      }).catch(() => {});
    }
    load(false);
  }

  return (
    <>
      <PageHeading
        title="Service Calendar"
        copy="Scheduled one-time services and recurring maintenance visits appear here after staff sets the company schedule."
        actions={<RefreshTableButton onClick={() => load()} loading={status.type === 'loading'} />}
      />
      {status.type !== 'idle' && <Notice status={status} />}
      <ScheduleMonthCalendar items={items} monthDate={monthDate} setMonthDate={setMonthDate} onJump={setFocusedId} />
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="hidden md:grid grid-cols-[minmax(230px,1.15fr)_1.1fr_1.35fr_1fr_auto] gap-4 px-6 py-4 bg-slate-50/50 text-xs font-bold text-slate-500 uppercase">
          <span>Date</span><span>Customer</span><span>Service</span><span>Assigned Staff</span><span>Action</span>
        </div>
        <div className="divide-y divide-slate-100">
          {items.map((item) => (
            <CalendarRow key={item.id} item={item} onUpdate={update} focused={focusedId === item.id} />
          ))}
          {!items.length && status.type === 'idle' && <div className="px-6 py-10 text-sm text-slate-500">No scheduled services or maintenance visits yet.</div>}
        </div>
      </section>
    </>
  );
}

function ScheduleMonthCalendar({ items, monthDate, setMonthDate, onJump }) {
  const days = useMemo(() => calendarDays(monthDate), [monthDate]);
  const itemsByDate = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      const date = item.schedule?.date || item.preferredDate;
      if (!date) continue;
      const list = map.get(date) || [];
      list.push(item);
      map.set(date, list);
    }
    return map;
  }, [items]);

  return (
    <section className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-5 md:px-6 py-4 border-b border-slate-200 bg-slate-50/50">
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Schedule overview</p>
          <h3 className="text-lg font-bold text-slate-900">{monthDate.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</h3>
        </div>
        <div className="flex gap-2">
          <button type="button" className="h-9 w-9 grid place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-white" onClick={() => setMonthDate(addMonths(monthDate, -1))} title="Previous month">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button type="button" className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-700 hover:bg-white" onClick={() => setMonthDate(startOfMonth(new Date()))}>Today</button>
          <button type="button" className="h-9 w-9 grid place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-white" onClick={() => setMonthDate(addMonths(monthDate, 1))} title="Next month">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 border-b border-slate-100 bg-white text-[10px] font-bold uppercase text-slate-400">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <div key={day} className="px-2 py-2 text-center">{day}</div>)}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-7">
        {days.map((day) => {
          const dateKey = dateInputValue(day.date);
          const dayItems = itemsByDate.get(dateKey) || [];
          return (
            <div key={dateKey} className={`min-h-28 border-b border-r border-slate-100 p-2 ${day.inMonth ? 'bg-white' : 'bg-slate-50/60 text-slate-400'}`}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">{day.date.getDate()}</span>
                {dayItems.length > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-[#b3000c]">{dayItems.length}</span>}
              </div>
              <div className="grid gap-1">
                {dayItems.slice(0, 3).map((item) => (
                  <button key={item.id} type="button" className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-left hover:border-[#b3000c] hover:bg-red-50" onClick={() => jumpToRow(item.id, onJump)}>
                    <p className="truncate text-[11px] font-bold text-slate-800">{item.schedule?.time || item.preferredTime || '--:--'} {item.subject}</p>
                    <p className="truncate text-[10px] text-slate-500">{isRecurringService(item) ? `Maintenance / ${item.recurrenceFrequency || 'Recurring'}` : 'Service'} / {item.schedule?.staff || 'Unassigned'}</p>
                  </button>
                ))}
                {dayItems.length > 3 && <p className="text-[10px] font-bold text-slate-500">+{dayItems.length - 3} more</p>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CalendarRow({ item, onUpdate, focused = false }) {
  const recurring = isRecurringService(item);
  const [draft, setDraft] = useState({
    date: item.schedule?.date || item.preferredDate || '',
    time: item.schedule?.time || item.preferredTime || '',
    staff: item.schedule?.staff || '',
  });

  return (
    <div id={rowId(item.id)} className={`scroll-mt-24 grid grid-cols-1 md:grid-cols-[minmax(230px,1.15fr)_1.1fr_1.35fr_1fr_auto] gap-3 md:gap-4 px-5 md:px-6 py-5 items-start md:items-center hover:bg-slate-50/50 ${focused ? 'bg-red-50 ring-1 ring-[#b3000c]/20' : ''}`}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 min-w-0">
        <input className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
        <input className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm" type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
      </div>
      <span className="text-sm font-medium text-slate-900">{item.customer}<br /><small className="text-slate-500">{item.id}</small></span>
      <span className="text-sm text-slate-600">{item.subject}<br /><small className="text-slate-500">{recurring ? `Maintenance / ${item.recurrenceFrequency || 'Recurring'}` : 'One-time service'}</small></span>
      <select className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm" value={draft.staff} onChange={(e) => setDraft({ ...draft, staff: e.target.value })}>
        <option value="">Unassigned</option>
        {staffMembers.map((name) => <option key={name}>{name}</option>)}
      </select>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="inline-flex items-center gap-2 rounded-lg bg-[#b3000c] text-white px-3 py-2 text-sm font-bold disabled:opacity-50" disabled={!draft.date || !draft.time} onClick={() => onUpdate(item, { status: 'Scheduled', schedule: draft, serviceType: recurring ? 'Recurring' : 'One-time' })}>
          <CalendarClock className="w-4 h-4" /> Update schedule
        </button>
        <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-50" disabled={!draft.date || !draft.time} onClick={() => onUpdate(item, { status: 'Completed', schedule: draft, serviceType: recurring ? 'Recurring' : 'One-time' })}>
          <CheckCircle2 className="w-4 h-4" /> {recurring ? 'Visit done' : 'Complete'}
        </button>
      </div>
    </div>
  );
}

function Notice({ status }) {
  const style = status.type === 'error' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-blue-50 text-blue-700 border-blue-100';
  return <div className={`mb-6 rounded-lg border px-4 py-3 text-sm ${style}`}>{status.message}</div>;
}

function scheduleSortValue(item) {
  const date = item.schedule?.date || item.preferredDate || '';
  const time = item.schedule?.time || item.preferredTime || '00:00';
  return new Date(`${date}T${time}`).getTime() || Number.MAX_SAFE_INTEGER;
}

function hasFullSchedule(item) {
  return Boolean(item.schedule?.date && item.schedule?.time && item.schedule?.staff);
}

function calendarDays(monthDate) {
  const first = startOfMonth(monthDate);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date,
      inMonth: date.getMonth() === first.getMonth(),
    };
  });
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, offset) {
  return startOfMonth(new Date(date.getFullYear(), date.getMonth() + offset, 1));
}

function dateInputValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function rowId(id) {
  return `schedule-row-${String(id).replace(/[^a-z0-9_-]/gi, '-')}`;
}

function jumpToRow(id, onJump) {
  onJump(id);
  document.getElementById(rowId(id))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export default ServiceCalendarPage;
