
import Layout from './Layout';
import { Plus, ClipboardList, Clock, CheckCircle2 } from 'lucide-react';

function QuotationRequests({ onNavigate }) {
  const requests = [
    { id: 'REQ-8824', client: 'Apex Industrial Park', type: 'System Installation', date: 'Oct 24, 2023', status: 'Pending' },
    { id: 'REQ-8823', client: 'Summit Healthcare Facility', type: 'Equipment Supply', date: 'Oct 23, 2023', status: 'Under Review' },
    { id: 'REQ-8821', client: 'Nexus Tech Campus', type: 'Annual Inspection', date: 'Oct 21, 2023', status: 'Quoted' },
  ];

  const getStatusStyle = (status) => {
    switch (status) {
      case 'Pending': return 'bg-amber-50 text-amber-700 border-amber-100';
      case 'Under Review': return 'bg-blue-50 text-blue-700 border-blue-100';
      case 'Quoted': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      default: return 'bg-slate-50 text-slate-700 border-slate-100';
    }
  };

  return (
    <Layout activeTab="Requests" title="Quotation Requests" onNavigate={onNavigate}>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Quotation Requests</h1>
          <p className="text-slate-500">Manage and process incoming requests for fire protection systems.</p>
        </div>
        <button className="bg-[#b3000c] text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-[#8b000a] transition-colors">
          <Plus className="w-4 h-4" /> New Request
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        {[
          { label: 'Total Requests', val: '142', icon: ClipboardList },
          { label: 'Pending', val: '28', icon: Clock },
          { label: 'Under Review', val: '15', icon: CheckCircle2 },
          { label: 'Quoted Today', val: '7', icon: CheckCircle2 }
        ].map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
            <div className="flex justify-between items-end">
              <h3 className="text-2xl font-bold text-slate-900">{stat.val}</h3>
              <stat.icon className="w-5 h-5 text-slate-200" />
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50/50">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Reference No.</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Customer Name</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Request Type</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Date Submitted</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Status</th>
              <th className="px-6 py-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {requests.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/50 transition-colors cursor-pointer">
                <td className="px-6 py-4 text-sm font-bold text-[#b3000c]">{r.id}</td>
                <td className="px-6 py-4 text-sm font-medium text-slate-900">{r.client}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{r.type}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{r.date}</td>
                <td className="px-6 py-4">
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${getStatusStyle(r.status)}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right"><button className="text-xs font-bold text-[#b3000c] hover:underline">VIEW DETAILS</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}

export default QuotationRequests;