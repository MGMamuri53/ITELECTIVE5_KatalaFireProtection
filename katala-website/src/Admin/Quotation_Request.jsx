import { useEffect, useState } from 'react';
import { CheckCircle2, ClipboardList, Clock, RefreshCw } from 'lucide-react';
import { schemaApi } from '../services/katalaApi';
import { useAdminSearch } from './Layout';
import { filterBySearch } from '../shared/search';

function QuotationRequests() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState({ type: 'loading', message: 'Loading requests...' });
  const { normalizedQuery } = useAdminSearch();

  useEffect(() => {
    loadRequests();
  }, []);

  async function loadRequests() {
    setStatus({ type: 'loading', message: 'Loading requests...' });
    try {
      const data = await schemaApi.listStaffRequests();
      const quotations = (data.items || []).filter((item) => item.kind === 'Quotation');
      setItems(quotations);
      setSelected((current) => current ? quotations.find((item) => item.id === current.id) || quotations[0] : quotations[0]);
      setStatus({ type: 'idle', message: '' });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to load requests.' });
    }
  }

  const pending = items.filter((item) => item.status === 'Submitted').length;
  const review = items.filter((item) => /review/i.test(item.status || '')).length;
  const quoted = items.filter((item) => /accepted|approved|payment|quoted/i.test(item.status || '')).length;
  const shown = filterBySearch(items, normalizedQuery, ['id', 'customer', 'email', 'subject', 'status', 'submittedAt', 'projectAddress', 'customerRemarks']);

  return (
    <>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Quotation Requests</h1>
          <p className="text-slate-500">Review customer quotation requests submitted through the website. Pricing and workflow updates are handled by Staff.</p>
        </div>
        <button type="button" onClick={loadRequests} className="bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-slate-50 transition-colors">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {status.type !== 'idle' && (
        <div className={`mb-6 rounded-lg border px-4 py-3 text-sm ${status.type === 'error' ? 'bg-red-50 text-red-700 border-red-100' : status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>
          {status.message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {[
          { label: 'Total Requests', val: items.length, icon: ClipboardList },
          { label: 'Pending', val: pending, icon: Clock },
          { label: 'Under Review', val: review, icon: CheckCircle2 },
          { label: 'Payment Ready', val: quoted, icon: CheckCircle2 },
        ].map((stat) => (
          <div key={stat.label} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
            <div className="flex justify-between items-end">
              <h3 className="text-2xl font-bold text-slate-900">{stat.val}</h3>
              <stat.icon className="w-5 h-5 text-slate-200" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Reference No.</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Customer Name</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Project</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Date Submitted</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((item) => (
                <tr key={item.id} onClick={() => setSelected(item)} className={`hover:bg-slate-50/50 transition-colors cursor-pointer ${selected?.id === item.id ? 'bg-red-50/50' : ''}`}>
                  <td className="px-6 py-4 text-sm font-bold text-[#b3000c]">{item.id}</td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">{item.customer}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{item.subject}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{item.submittedAt ? new Date(item.submittedAt).toLocaleDateString() : 'Not set'}</td>
                  <td className="px-6 py-4"><StatusPill status={item.status} /></td>
                </tr>
              ))}
              {!shown.length && status.type !== 'loading' && (
                <tr>
                  <td className="px-6 py-10 text-center text-sm text-slate-500" colSpan="5">{normalizedQuery ? 'No quotation requests match your search.' : 'No quotation requests found.'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {selected && (
          <aside className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Selected request</p>
            <h2 className="text-lg font-bold text-slate-900">{selected.id}</h2>
            <p className="text-sm text-slate-500 mb-5">{selected.customer} / {selected.email}</p>

            <div className="space-y-4 text-sm">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase mb-1">Status</p>
                <StatusPill status={selected.status} />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase mb-1">Project address</p>
                <p className="text-slate-700 whitespace-pre-wrap">{selected.projectAddress || 'No address provided.'}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase mb-1">Description</p>
                <p className="text-slate-700 whitespace-pre-wrap">{selected.description || selected.projectDescription || 'No description provided.'}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase mb-1">Customer remarks</p>
                <p className="text-slate-700 whitespace-pre-wrap">{selected.customerRemarks || 'No customer remarks.'}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase mb-1">Submitted</p>
                <p className="text-slate-700">{selected.submittedAt ? new Date(selected.submittedAt).toLocaleString() : 'Not set'}</p>
              </div>
            </div>
          </aside>
        )}
      </div>
    </>
  );
}

function StatusPill({ status }) {
  const style = /submitted|pending/i.test(status)
    ? 'bg-amber-50 text-amber-700 border-amber-100'
    : /review/i.test(status)
      ? 'bg-blue-50 text-blue-700 border-blue-100'
      : 'bg-emerald-50 text-emerald-700 border-emerald-100';
  return <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${style}`}>{status}</span>;
}

export default QuotationRequests;
