import Layout from './Layout';
import { Plus, Filter, Download, MoreHorizontal, PackagePlus } from 'lucide-react';

function ProductManagement({ onNavigate }) {
  const products = [
    { sku: 'FE-ABC-10L', name: '10lb ABC Dry Chemical Extinguisher', category: 'Fire Extinguishers', stock: 145, status: 'Active' },
    { sku: 'AS-SMK-PRO', name: 'ProSeries Photoelectric Smoke Detector', category: 'Alarm Systems', stock: 89, status: 'Active' },
    { sku: 'HS-C2-50F', name: '50ft Industrial Fire Hose C2', category: 'Suppression Equipment', stock: 12, status: 'Low Stock' },
    { sku: 'CP-M-ALR', name: 'Master Alarm Control Panel V3', category: 'Control Panels', stock: 0, status: 'Out of Stock' },
  ];

  return (
    <Layout activeTab="Materials" title="Materials & Stock" onNavigate={onNavigate}>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Material Inventory</h1>
          <p className="text-slate-500">Manage website materials, stock levels, reorder points, and catalog availability.</p>
        </div>
        <button className="bg-[#b3000c] text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-[#8b000a] transition-colors">
          <PackagePlus className="w-4 h-4" /> Add material
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 mb-8">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Quick add material</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm" placeholder="Material name" />
            <input className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm" placeholder="SKU / code" />
            <input className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm" placeholder="Category" />
            <input className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm" placeholder="Initial stock" type="number" />
          </div>
          <button className="mt-4 bg-[#b3000c] text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-[#8b000a] transition-colors">
            <Plus className="w-4 h-4" /> Save material
          </button>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Stock alerts</p>
          <h2 className="text-3xl font-bold text-slate-900 mb-1">14</h2>
          <p className="text-sm text-slate-500">Materials are below reorder level or unavailable on the website.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex gap-4">
          <input type="text" placeholder="Search SKU, material name..." className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm" />
          <button className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-slate-50"><Filter className="w-4 h-4" /> Filter</button>
          <button className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-slate-50"><Download className="w-4 h-4" /> Export</button>
        </div>
        <table className="w-full text-left">
          <thead className="bg-slate-50/50">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">SKU</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Material Name</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Category</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Stock</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Status</th>
              <th className="px-6 py-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {products.map((p) => (
              <tr key={p.sku} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4 text-sm font-bold text-[#b3000c]">{p.sku}</td>
                <td className="px-6 py-4 text-sm font-medium text-slate-900">{p.name}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{p.category}</td>
                <td className={`px-6 py-4 text-sm font-bold ${p.stock < 20 ? 'text-amber-600' : 'text-slate-900'}`}>{p.stock}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${p.status === 'Active' ? 'bg-emerald-500' : p.status === 'Low Stock' ? 'bg-amber-500' : 'bg-slate-300'}`}></div>
                    <span className="text-xs font-medium text-slate-600">{p.status}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-right text-slate-400"><MoreHorizontal className="w-5 h-5 cursor-pointer" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}

export default ProductManagement;
