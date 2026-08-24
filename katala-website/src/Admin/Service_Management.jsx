import Layout from './Layout';
import { Plus, Clock, MoreHorizontal } from 'lucide-react';

const services = [
  { code: 'SVC-FAI', name: 'Fire Alarm Installation', category: 'Installation', duration: '3-7 days', status: 'Active' },
  { code: 'SVC-PM', name: 'Preventive Maintenance', category: 'Maintenance', duration: '1 day', status: 'Active' },
  { code: 'SVC-FPI', name: 'Fire Pump Inspection', category: 'Inspection', duration: '4 hours', status: 'Active' },
  { code: 'SVC-SPR', name: 'Sprinkler System Repair', category: 'Repair', duration: '1-3 days', status: 'Draft' },
];

function ServiceManagement({ onNavigate }) {
  return (
    <Layout activeTab="Services" title="Service Management" onNavigate={onNavigate}>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Services</h1>
          <p className="text-slate-500">Add, update, publish, or hide services that customers can request.</p>
        </div>
        <button className="bg-[#b3000c] text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-[#8b000a] transition-colors">
          <Plus className="w-4 h-4" /> Add service
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Quick add service</h2>
          <div className="space-y-4">
            <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm" placeholder="Service name" />
            <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm" placeholder="Category" />
            <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm" placeholder="Estimated duration" />
            <textarea className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm min-h-28" placeholder="Customer-facing description" />
          </div>
          <button className="mt-4 bg-[#b3000c] text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-[#8b000a] transition-colors">
            <Plus className="w-4 h-4" /> Save service
          </button>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="grid grid-cols-5 gap-4 px-6 py-4 bg-slate-50/50 text-xs font-bold text-slate-500 uppercase">
            <span>Code</span>
            <span>Service</span>
            <span>Category</span>
            <span>Duration</span>
            <span>Status</span>
          </div>
          <div className="divide-y divide-slate-100">
            {services.map((service) => (
              <div key={service.code} className="grid grid-cols-5 gap-4 px-6 py-5 items-center hover:bg-slate-50/50 transition-colors">
                <span className="text-sm font-bold text-[#b3000c]">{service.code}</span>
                <span className="text-sm font-medium text-slate-900">{service.name}</span>
                <span className="text-sm text-slate-600">{service.category}</span>
                <span className="text-sm text-slate-600 flex items-center gap-2"><Clock className="w-4 h-4 text-slate-300" /> {service.duration}</span>
                <span className="flex justify-between items-center">
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${service.status === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-600 border-slate-100'}`}>{service.status}</span>
                  <MoreHorizontal className="w-5 h-5 text-slate-400" />
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Layout>
  );
}

export default ServiceManagement;
