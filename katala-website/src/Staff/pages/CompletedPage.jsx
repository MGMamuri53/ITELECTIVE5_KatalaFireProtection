import { useEffect, useState } from 'react';
import { PageHeading, RefreshTableButton, TableHeader } from '../StaffShared';
import { useStaffSearch } from '../StaffLayout';
import { schemaApi } from '../../services/katalaApi';
import { filterStaffItems, isRecurringService, workflowItemsFromQueue } from '../staffWorkflow';

function CompletedPage() {
  const [items, setItems] = useState([]);
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
        <TableHeader columns={['Reference', 'Customer', 'Type', 'Completed', 'Result']} />
        <div className="divide-y divide-slate-100">
          {shown.map((item) => (
            <div key={item.id} className="grid grid-cols-1 md:grid-cols-5 gap-3 md:gap-4 px-5 md:px-6 py-5 items-center hover:bg-slate-50/50 transition-colors">
              <span className="text-sm font-bold text-[#b3000c]">{item.id}</span>
              <span className="text-sm font-medium text-slate-900">{item.customer}</span>
              <span className="text-sm text-slate-600">{item.maintenanceClosed ? 'Maintenance' : item.kind}</span>
              <span className="text-sm text-slate-600">{formatDate(item.maintenanceEndedAt || item.updatedAt)}</span>
              <span className="text-sm text-emerald-700 font-medium">{item.maintenanceClosed ? 'Maintenance plan ended' : `${item.subject} completed`}</span>
            </div>
          ))}
          {!shown.length && status.type === 'idle' && <div className="px-6 py-10 text-sm text-slate-500">{normalizedQuery ? 'No completed work matches your search.' : 'No one-time services have been completed yet.'}</div>}
        </div>
      </section>
    </>
  );
}

function Notice({ status }) {
  const style = status.type === 'error' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-blue-50 text-blue-700 border-blue-100';
  return <div className={`mb-6 rounded-lg border px-4 py-3 text-sm ${style}`}>{status.message}</div>;
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : 'Recently';
}

export default CompletedPage;
