
import { Globe2, Package, Wrench, Users, TrendingUp } from 'lucide-react';

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
  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">System Overview</h1>
        <p className="text-slate-500">High-level operational metrics and recent activity.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricCard label="Managed Accounts" value="140" icon={Users} colorClass="text-slate-400" trend="4.2%" />
        <MetricCard label="Material SKUs" value="1,284" icon={Package} colorClass="text-[#b3000c]" />
        <MetricCard label="Active Services" value="18" icon={Wrench} colorClass="text-slate-400" trend="1.8%" />
        <MetricCard label="Website Updates" value="6" icon={Globe2} colorClass="text-amber-500" />
      </div>
    </>
  );
}

export default Dashboard;
