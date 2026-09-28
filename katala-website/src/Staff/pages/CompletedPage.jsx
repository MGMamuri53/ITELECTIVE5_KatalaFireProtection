import { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { PageHeading, RefreshTableButton, TableHeader } from '../StaffShared';
import { useStaffSearch } from '../staffSearch';
import { schemaApi } from '../../services/katalaApi';
import { filterStaffItems, isRecurringService, workflowItemsFromQueue } from '../staffWorkflow';

function CompletedPage() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState({ type: 'loading', message: 'Loading completed work...' });
  const { normalizedQuery } = useStaffSearch();

  useEffect(() => {
    load();
    const sync = () => load(false);
    window.addEventListener('katala-workflow-changed', sync);
    return () => window.removeEventListener('katala-workflow-changed', sync);
  }, []);

  async function load(showLoading = true) {
    if (showLoading) setStatus({ type: 'loading', message: 'Loading completed work...' });
    try {
      const data = await schemaApi.listStaffRequests();
      const rows = workflowItemsFromQueue(data.items || [])
        .filter((item) => item.status === 'Completed')
        .filter((item) => !isRecurringService(item) || item.maintenanceClosed);
      setItems(rows);
      setStatus({ type: 'idle', message: '' });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to load completed work.' });
    }
  }

  const shown = filterStaffItems(items, normalizedQuery);

  return (
    <>
      <PageHeading
        title="Completed Work"
        copy="One-time service jobs and requests completed by staff."
        actions={<RefreshTableButton onClick={() => load()} loading={status.type === 'loading'} />}
      />
      {status.type !== 'idle' && <Notice status={status} />}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <TableHeader columns={['Reference', 'Customer', 'Project', 'Type', 'Completed', 'Action']} />
        <div className="divide-y divide-slate-100">
          {shown.map((item) => (
            <div key={item.id} className="grid grid-cols-1 md:grid-cols-6 gap-3 md:gap-4 px-5 md:px-6 py-5 items-center hover:bg-slate-50/50 transition-colors">
              <span className="text-sm font-bold text-[#b3000c]">{item.id}</span>
              <span className="text-sm font-medium text-slate-900">{item.customer}</span>
              <span className="text-sm text-slate-600">{projectName(item)}</span>
              <span className="text-sm text-slate-600">{item.maintenanceClosed ? 'Maintenance' : item.kind}</span>
              <span className="text-sm text-slate-600">{formatDate(item.maintenanceEndedAt || item.updatedAt)}</span>
              <button type="button" className="inline-flex w-fit items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50" onClick={() => setSelected(item)}>
                <Eye className="w-4 h-4" /> Full details
              </button>
            </div>
          ))}
          {!shown.length && status.type === 'idle' && <div className="px-6 py-10 text-sm text-slate-500">{normalizedQuery ? 'No completed work matches your search.' : 'No one-time services have been completed yet.'}</div>}
        </div>
      </section>
      {selected && <CompletedDetails item={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function Notice({ status }) {
  const style = status.type === 'error' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-blue-50 text-blue-700 border-blue-100';
  return <div className={`mb-6 rounded-lg border px-4 py-3 text-sm ${style}`}>{status.message}</div>;
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' }) : 'Recently';
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : 'Recently';
}

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

function projectName(item) {
  return item.projectName || item.establishmentName || item.subject || 'Not provided';
}

function CompletedDetails({ item, onClose }) {
  const quotation = item.quotation || {};
  const charges = quotation.charges || [];
  const schedule = item.schedule || {};
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-900/40 p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="w-full max-w-3xl max-h-[calc(100vh-32px)] overflow-auto rounded-xl bg-white shadow-2xl border border-slate-200" role="dialog" aria-modal="true" aria-labelledby="completed-detail-title">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Completed work</p>
            <h2 id="completed-detail-title" className="text-xl font-bold text-slate-900">{item.id}</h2>
            <p className="text-sm text-slate-500">{item.customer} / {item.subject}</p>
          </div>
          <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50" onClick={onClose}>Close</button>
        </div>
        <div className="grid gap-5 p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
            <Detail label="Customer" value={item.customer} />
            <Detail label="Type" value={item.maintenanceClosed ? 'Maintenance' : item.kind} />
            <Detail label="Date" value={schedule.date || item.preferredDate || 'Not provided'} />
            <Detail label="Time" value={schedule.time || item.preferredTime || 'Not provided'} />
            <Detail label="Assigned staff" value={schedule.staff || item.staff || 'Not assigned'} />
            <Detail label="Completed" value={formatDateTime(item.completedAt || item.maintenanceEndedAt || item.updatedAt)} />
            <Detail label="Address" value={item.projectAddress || 'Not provided'} wide />
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <h3 className="mb-3 text-sm font-bold text-slate-900">Quotation</h3>
            {charges.length ? charges.map((charge) => (
              <div key={charge.id} className="flex justify-between gap-3 border-b border-slate-100 py-2 text-sm last:border-0">
                <span className="text-slate-600">{charge.description || charge.type}</span>
                <strong className="text-slate-900">{charge.quantity} x {peso.format(charge.unitPrice || 0)} = {peso.format(charge.subtotal || 0)}</strong>
              </div>
            )) : <p className="text-sm text-slate-500">No quotation breakdown saved.</p>}
            <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 text-sm font-bold">
              <span>Total</span>
              <strong>{peso.format(quotation.total || item.totalAmount || 0)}</strong>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Detail({ label, value, wide = false }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <p className="text-[10px] font-bold uppercase text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

export default CompletedPage;
