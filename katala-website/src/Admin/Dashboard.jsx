
import { useEffect, useState } from 'react';
import { ClipboardList, CreditCard, Package, Wrench, Users, TrendingUp } from 'lucide-react';
import { schemaApi } from '../services/katalaApi';

const MetricCard = ({ label, value, icon: Icon, colorClass, trend }) => (
  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
    <div className="flex justify-between items-start mb-4">
      <div className="p-2 bg-slate-50 rounded-lg">
        <Icon className={`w-5 h-5 ${colorClass}`} />
      </div>
      {trend && (
        <span className="text-xs font-medium text-emerald-600 flex items-center">
          <TrendingUp className="w-3 h-3 mr-1" /> {trend}
        </span>
      )}
    </div>
    <p className="text-slate-500 text-sm font-medium mb-1 uppercase tracking-wider">{label}</p>
    <h3 className="text-3xl font-bold text-slate-900">{value}</h3>
  </div>
);

function Dashboard() {
  const [data, setData] = useState({ metrics: {}, recentActivity: [] });
  const [status, setStatus] = useState({ type: 'loading', message: 'Loading dashboard...' });

  useEffect(() => {
    schemaApi.getAdminDashboard()
      .then((result) => {
        setData({ metrics: result.metrics || {}, recentActivity: result.recentActivity || [] });
        setStatus({ type: 'idle', message: '' });
      })
      .catch((error) => setStatus({ type: 'error', message: error.message || 'Unable to load dashboard.' }));
  }, []);

  const metrics = data.metrics || {};

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">System Overview</h1>
        <p className="text-slate-500">High-level operational metrics and recent activity.</p>
      </div>
      {status.type !== 'idle' && (
        <div className={`mb-6 rounded-lg border px-4 py-3 text-sm ${status.type === 'error' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>
          {status.message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricCard label="Managed Accounts" value={metrics.managedAccounts ?? 0} icon={Users} colorClass="text-slate-400" />
        <MetricCard label="Material SKUs" value={metrics.materialSkus ?? 0} icon={Package} colorClass="text-[#b3000c]" />
        <MetricCard label="Active Services" value={metrics.activeServices ?? 0} icon={Wrench} colorClass="text-slate-400" />
        <MetricCard label="Paid Payments" value={metrics.paidPayments ?? 0} icon={CreditCard} colorClass="text-emerald-600" />
      </div>
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-[#b3000c]" />
          <h2 className="text-lg font-bold text-slate-900">Recent Activity</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {data.recentActivity.map((item) => (
            <div key={`${item.type}-${item.referenceNumber}`} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-3 px-6 py-4 text-sm">
              <strong className="text-[#b3000c]">{item.referenceNumber}</strong>
              <span className="text-slate-700">{item.title}</span>
              <span className="text-slate-500">{item.type}</span>
              <span className="font-bold text-slate-700">{item.status}</span>
            </div>
          ))}
          {!data.recentActivity.length && status.type === 'idle' && <div className="px-6 py-10 text-sm text-slate-500">No recent requests yet.</div>}
        </div>
      </section>
    </>
  );
}

export default Dashboard;
