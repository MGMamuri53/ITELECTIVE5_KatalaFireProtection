import { useEffect, useState } from 'react';
import { ChatPanel, PageHeading, StatusBadge, TableHeader } from '../StaffShared';
import { schemaApi } from '../../services/katalaApi';

function WorkQueuePage() {
  const [queue, setQueue] = useState([]);
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState({ type: 'loading', message: 'Loading customer requests...' });

  useEffect(() => {
    loadQueue();
  }, []);

  async function loadQueue() {
    setStatus({ type: 'loading', message: 'Loading customer requests...' });
    try {
      const data = await schemaApi.listStaffRequests();
      const rows = data.items || [];
      setQueue(rows);
      setSelected((current) => current ? rows.find((item) => item.id === current.id) || rows[0] : rows[0]);
      setStatus({ type: 'idle', message: '' });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to load customer requests.' });
    }
  }

  async function updateRequest(patch) {
    if (!selected) return;
    setStatus({ type: 'loading', message: 'Saving request update...' });
    try {
      if (selected.kind === 'Quotation') {
        await schemaApi.updateStaffQuotation(selected.id, patch);
      } else {
        await schemaApi.updateStaffServiceRequest(selected.id, patch);
      }
      await loadQueue();
      setStatus({ type: 'success', message: 'Request updated.' });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to update request.' });
    }
  }

  return (
    <>
      <PageHeading title="Customer Requests" copy="Staff handles quotation review, service scheduling, and customer follow-up." />
      {status.type !== 'idle' && (
        <div className={`mb-6 rounded-lg border px-4 py-3 text-sm ${status.type === 'error' ? 'bg-red-50 text-red-700 border-red-100' : status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>
          {status.message}
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6">
        <RequestTable items={queue} selected={selected} onSelect={setSelected} />
        <div className="space-y-6">
          {selected && <ActionPanel selected={selected} onUpdate={updateRequest} />}
          {selected && <ChatPanel selected={selected} />}
        </div>
      </div>
    </>
  );
}

function RequestTable({ items, selected, onSelect }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <TableHeader columns={['Reference', 'Customer', 'Request', 'Status']} />
      <div className="divide-y divide-slate-100">
        {items.map((item) => (
          <button key={item.id} onClick={() => onSelect(item)} className={`w-full grid grid-cols-4 gap-4 px-6 py-5 text-left hover:bg-slate-50 transition-colors ${selected?.id === item.id ? 'bg-red-50/50' : 'bg-white'}`}>
            <span className="text-sm font-bold text-[#b3000c]">{item.id}</span>
            <span className="text-sm font-medium text-slate-900">{item.customer}</span>
            <span className="text-sm text-slate-600">{item.subject}</span>
            <span><StatusBadge status={item.status} /></span>
          </button>
        ))}
        {!items.length && <div className="px-6 py-10 text-sm text-slate-500">No customer requests found.</div>}
      </div>
    </section>
  );
}

function ActionPanel({ selected, onUpdate }) {
  const isQuote = selected.kind === 'Quotation';
  const [draft, setDraft] = useState(() => actionDraft(selected));
  const statusOptions = isQuote
    ? ['Submitted', 'Under Review', 'Accepted', 'Ready for Payment', 'Rejected', 'Cancelled']
    : ['Submitted', 'Under Review', 'Awaiting Customer Confirmation', 'Scheduled', 'Completed', 'Rejected', 'Cancelled'];

  useEffect(() => {
    setDraft(actionDraft(selected));
  }, [selected]);

  function updateDraft(patch) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  return (
    <aside className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Staff actions</p>
      <h2 className="text-lg font-bold text-slate-900 mb-1">{selected.id}</h2>
      <p className="text-sm text-slate-500 mb-4">{selected.kind} / {selected.priority} priority</p>

      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Status</label>
      <select className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm mb-4" value={draft.status} onChange={(event) => updateDraft({ status: event.target.value })}>
        {statusOptions.map((option) => <option key={option}>{option}</option>)}
      </select>

      {isQuote ? (
        <>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Additional quoted cost</label>
          <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm mb-4" type="number" min="0" step="0.01" value={draft.additionalCost} onChange={(event) => updateDraft({ additionalCost: event.target.value })} placeholder="0.00" />
          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Valid until</label>
          <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm" type="date" value={draft.validUntil} onChange={(event) => updateDraft({ validUntil: event.target.value })} />
        </>
      ) : (
        <>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Confirmed date</label>
          <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm mb-4" type="date" value={draft.preferredDate} onChange={(event) => updateDraft({ preferredDate: event.target.value })} />
          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Confirmed time</label>
          <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm" type="time" value={draft.preferredTime} onChange={(event) => updateDraft({ preferredTime: event.target.value })} />
        </>
      )}
      <button type="button" className="mt-4 w-full bg-[#b3000c] text-white px-4 py-2 rounded-lg font-bold hover:bg-[#8b000a] transition-colors" onClick={() => onUpdate(draft)}>
        Save request update
      </button>
    </aside>
  );
}

function actionDraft(selected) {
  return {
    status: selected.status || 'Submitted',
    additionalCost: '',
    validUntil: '',
    preferredDate: selected.preferredDate || '',
    preferredTime: selected.preferredTime || '',
    remarks: '',
  };
}

export default WorkQueuePage;
