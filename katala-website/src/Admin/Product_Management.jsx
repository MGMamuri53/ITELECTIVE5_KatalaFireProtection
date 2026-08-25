import { useEffect, useMemo, useState } from 'react';
import { Filter, PackagePlus, Save, Trash2 } from 'lucide-react';
import { schemaApi } from '../services/katalaApi';

const emptyForm = {
  name: '',
  sku: '',
  model: '',
  size: '',
  unit: 'unit',
  category: '',
  stock: 0,
  reorderLevel: 0,
};

function materialDraft(material) {
  return {
    name: material.name || '',
    sku: material.sku || '',
    model: material.model || '',
    size: material.size || '',
    unit: material.unit || 'unit',
    category: material.category || '',
    stock: material.stock ?? 0,
    reorderLevel: material.reorderLevel ?? 0,
    active: Boolean(material.active),
  };
}

function ProductManagement() {
  const [materials, setMaterials] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState({ type: 'loading', message: 'Loading materials...' });

  useEffect(() => {
    loadMaterials();
  }, []);

  async function loadMaterials() {
    setStatus({ type: 'loading', message: 'Loading materials...' });
    try {
      const data = await schemaApi.listAdminMaterials();
      setMaterials(data.materials || []);
      setDrafts(Object.fromEntries((data.materials || []).map((item) => [item.variantId, materialDraft(item)])));
      setStatus({ type: 'idle', message: '' });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to load materials.' });
    }
  }

  function updateForm(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function addMaterial(event) {
    event.preventDefault();
    setStatus({ type: 'loading', message: 'Saving material...' });
    try {
      const data = await schemaApi.createAdminMaterial(form);
      setMaterials(data.materials || []);
      setDrafts(Object.fromEntries((data.materials || []).map((item) => [item.variantId, materialDraft(item)])));
      setForm(emptyForm);
      setStatus({ type: 'success', message: 'Material saved to Supabase.' });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to save material.' });
    }
  }

  function updateDraft(material, patch) {
    setDrafts((current) => ({
      ...current,
      [material.variantId]: {
        ...materialDraft(material),
        ...(current[material.variantId] || {}),
        ...patch,
      },
    }));
  }

  async function saveMaterial(material) {
    const draft = drafts[material.variantId] || materialDraft(material);
    setStatus({ type: 'loading', message: 'Updating material...' });
    try {
      const data = await schemaApi.updateAdminMaterial(material.variantId, draft);
      setMaterials(data.materials || []);
      setDrafts(Object.fromEntries((data.materials || []).map((item) => [item.variantId, materialDraft(item)])));
      setStatus({ type: 'success', message: 'Material updated.' });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to update material.' });
    }
  }

  async function deleteMaterial(material) {
    if (!window.confirm(`Deactivate ${material.name}?`)) return;
    setStatus({ type: 'loading', message: 'Deactivating material...' });
    try {
      const data = await schemaApi.deleteAdminMaterial(material.variantId);
      setMaterials(data.materials || []);
      setDrafts(Object.fromEntries((data.materials || []).map((item) => [item.variantId, materialDraft(item)])));
      setStatus({ type: 'success', message: 'Material deactivated.' });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to deactivate material.' });
    }
  }

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return materials;
    return materials.filter((item) => [item.sku, item.name, item.category, item.model, item.size].join(' ').toLowerCase().includes(needle));
  }, [materials, query]);

  const lowStock = materials.filter((item) => ['Low Stock', 'Out of Stock'].includes(item.status)).length;

  return (
    <>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Material Inventory</h1>
          <p className="text-slate-500">Manage materials, stock levels, reorder points, and catalog availability from Supabase.</p>
        </div>
      </div>

      {status.type !== 'idle' && (
        <div className={`mb-6 rounded-lg border px-4 py-3 text-sm ${status.type === 'error' ? 'bg-red-50 text-red-700 border-red-100' : status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>
          {status.message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 mb-8">
        <form className="bg-white rounded-xl border border-slate-200 shadow-sm p-6" onSubmit={addMaterial}>
          <h2 className="text-lg font-bold text-slate-900 mb-4">Quick add material</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input name="name" value={form.name} onChange={updateForm} required className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm" placeholder="Material name" />
            <input name="sku" value={form.sku} onChange={updateForm} required className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm" placeholder="SKU / code" />
            <input name="category" value={form.category} onChange={updateForm} className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm" placeholder="Category" />
            <input name="model" value={form.model} onChange={updateForm} className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm" placeholder="Model" />
            <input name="size" value={form.size} onChange={updateForm} className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm" placeholder="Size / variant" />
            <input name="unit" value={form.unit} onChange={updateForm} className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm" placeholder="Unit" />
            <input name="stock" value={form.stock} onChange={updateForm} className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm" placeholder="Initial stock" type="number" />
            <input name="reorderLevel" value={form.reorderLevel} onChange={updateForm} className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm" placeholder="Reorder level" type="number" />
          </div>
          <button className="mt-4 bg-[#b3000c] text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-[#8b000a] transition-colors" disabled={status.type === 'loading'}>
            <PackagePlus className="w-4 h-4" /> Save material
          </button>
        </form>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Stock alerts</p>
          <h2 className="text-3xl font-bold text-slate-900 mb-1">{lowStock}</h2>
          <p className="text-sm text-slate-500">Materials are below reorder level, unavailable, or inactive.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex gap-4">
          <input type="text" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search SKU, material name..." className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm" />
          <button type="button" className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-slate-50"><Filter className="w-4 h-4" /> Filter</button>
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
            {shown.map((material) => (
              <tr key={material.variantId} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4">
                  <input className="w-36 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-[#b3000c]" value={(drafts[material.variantId] || materialDraft(material)).sku} onChange={(event) => updateDraft(material, { sku: event.target.value })} />
                </td>
                <td className="px-6 py-4">
                  <input className="w-full min-w-48 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-900" value={(drafts[material.variantId] || materialDraft(material)).name} onChange={(event) => updateDraft(material, { name: event.target.value })} />
                  <div className="mt-2 flex gap-2">
                    <input className="w-28 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600" placeholder="Model" value={(drafts[material.variantId] || materialDraft(material)).model} onChange={(event) => updateDraft(material, { model: event.target.value })} />
                    <input className="w-28 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600" placeholder="Size" value={(drafts[material.variantId] || materialDraft(material)).size} onChange={(event) => updateDraft(material, { size: event.target.value })} />
                  </div>
                </td>
                <td className="px-6 py-4">
                  <input className="w-36 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600" value={(drafts[material.variantId] || materialDraft(material)).category} onChange={(event) => updateDraft(material, { category: event.target.value })} />
                </td>
                <td className="px-6 py-4">
                  <input
                    className="w-24 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold"
                    type="number"
                    min="0"
                    value={(drafts[material.variantId] || materialDraft(material)).stock}
                    onChange={(event) => updateDraft(material, { stock: event.target.value })}
                  />
                </td>
                <td className="px-6 py-4">
                  <select className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold" value={(drafts[material.variantId] || materialDraft(material)).active ? 'Active' : 'Inactive'} onChange={(event) => updateDraft(material, { active: event.target.value === 'Active' })}>
                    <option>Active</option>
                    <option>Inactive</option>
                  </select>
                  <span className="ml-2 text-xs text-slate-500">{material.status}</span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button type="button" className="p-2 text-slate-400 hover:text-[#b3000c]" onClick={() => saveMaterial(material)} title="Save row"><Save className="w-4 h-4" /></button>
                  <button type="button" className="p-2 text-slate-400 hover:text-[#b3000c]" onClick={() => deleteMaterial(material)} title="Deactivate"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default ProductManagement;
