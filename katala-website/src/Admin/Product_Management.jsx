import { useEffect, useMemo, useState } from 'react';
import { Filter, HelpCircle, PackagePlus, Save, Trash2 } from 'lucide-react';
import { schemaApi } from '../services/katalaApi';
import { useAdminSearch } from './Layout';

const emptyForm = {
  name: '',
  sku: '',
  model: '',
  size: '',
  unit: 'unit',
  category: '',
  description: '',
  imageUrl: '',
  stock: 0,
  reorderLevel: 0,
  minPrice: '',
  maxPrice: '',
};

const materialHelp = {
  name: 'Use the customer-facing material name, like Fire Alarm Control Panel.',
  sku: 'Enter the unique material code used by stock and quotations.',
  category: 'Group similar materials, like Fire Protection or Detection.',
  model: 'Use the model, brand, or reference name when available.',
  size: 'Enter the selectable option, such as 4 zones, 10 lb, or 100 ft.',
  unit: 'Enter how this stock is counted, such as unit, set, roll, or box.',
  description: 'Write a short description that helps staff and customers identify it.',
  imageUrl: 'Paste an image link, or use Upload picture to store a small image.',
  stock: 'Enter the current stock on hand for this exact material option.',
  reorderLevel: 'Enter the stock level that should trigger a low-stock warning.',
  minPrice: 'Enter the lowest estimated customer price for this option.',
  maxPrice: 'Enter the highest estimated customer price for this option.',
};

function materialDraft(material) {
  return {
    name: material.name || '',
    sku: material.sku || '',
    model: material.model || '',
    size: material.size || '',
    unit: material.unit || 'unit',
    category: material.category || '',
    description: material.description || '',
    imageUrl: material.imageUrl || '',
    stock: material.stock ?? 0,
    reorderLevel: material.reorderLevel ?? 0,
    minPrice: material.minPrice ?? '',
    maxPrice: material.maxPrice ?? '',
    active: Boolean(material.active),
  };
}

function readImage(file, onDone, onError) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    onError('Choose an image file.');
    return;
  }
  if (file.size > 700_000) {
    onError('Choose an image below 700 KB for now.');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => onDone(String(reader.result || ''));
  reader.onerror = () => onError('Unable to read image file.');
  reader.readAsDataURL(file);
}

function ProductManagement() {
  const [materials, setMaterials] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState({ type: 'loading', message: 'Loading materials...' });
  const { normalizedQuery } = useAdminSearch();

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

  function uploadFormImage(event) {
    readImage(
      event.target.files?.[0],
      (imageUrl) => setForm((current) => ({ ...current, imageUrl })),
      (message) => setStatus({ type: 'error', message }),
    );
    event.target.value = '';
  }

  function uploadDraftImage(material, event) {
    readImage(
      event.target.files?.[0],
      (imageUrl) => updateDraft(material, { imageUrl }),
      (message) => setStatus({ type: 'error', message }),
    );
    event.target.value = '';
  }

  async function addMaterial(event) {
    event.preventDefault();
    setStatus({ type: 'loading', message: 'Saving material...' });
    try {
      const data = await schemaApi.createAdminMaterial(form);
      setMaterials(data.materials || []);
      setDrafts(Object.fromEntries((data.materials || []).map((item) => [item.variantId, materialDraft(item)])));
      setForm(emptyForm);
      setStatus({ type: 'success', message: 'Material saved to database.' });
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
    if (!window.confirm(`Delete ${material.name} from the customer catalog?`)) return;
    setStatus({ type: 'loading', message: 'Deleting material...' });
    try {
      const data = await schemaApi.deleteAdminMaterial(material.variantId);
      setMaterials(data.materials || []);
      setDrafts(Object.fromEntries((data.materials || []).map((item) => [item.variantId, materialDraft(item)])));
      setStatus({ type: 'success', message: 'Material deleted from the customer catalog.' });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to delete material.' });
    }
  }

  const shown = useMemo(() => {
    const localNeedle = query.trim().toLowerCase();
    const topNeedle = normalizedQuery;
    if (!localNeedle && !topNeedle) return materials;
    return materials.filter((item) => {
      const haystack = [item.sku, item.name, item.category, item.model, item.size, item.status].join(' ').toLowerCase();
      return (!localNeedle || haystack.includes(localNeedle)) && (!topNeedle || haystack.includes(topNeedle));
    });
  }, [materials, normalizedQuery, query]);

  const lowStock = materials.filter((item) => ['Low Stock', 'Out of Stock'].includes(item.status)).length;

  return (
    <>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Material Inventory</h1>
          <p className="text-slate-500">Manage materials, stock levels, price ranges, and customer catalog availability.</p>
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
            <HelpInput name="name" value={form.name} onChange={updateForm} required placeholder="Material name" />
            <HelpInput name="sku" value={form.sku} onChange={updateForm} required placeholder="SKU / code" />
            <HelpInput name="category" value={form.category} onChange={updateForm} placeholder="Category" />
            <HelpInput name="model" value={form.model} onChange={updateForm} placeholder="Model" />
            <HelpInput name="size" value={form.size} onChange={updateForm} placeholder="Size / variant" />
            <HelpInput name="unit" value={form.unit} onChange={updateForm} placeholder="Unit" />
            <HelpInput name="description" value={form.description} onChange={updateForm} placeholder="Short material description" className="md:col-span-2" />
            <HelpInput name="imageUrl" value={form.imageUrl} onChange={updateForm} placeholder="Image URL or uploaded image data" />
            <label className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm text-slate-500 cursor-pointer hover:bg-white">
              Upload picture
              <input type="file" accept="image/*" onChange={uploadFormImage} className="sr-only" />
            </label>
            <HelpInput name="stock" value={form.stock} onChange={updateForm} placeholder="Initial stock" type="number" />
            <HelpInput name="reorderLevel" value={form.reorderLevel} onChange={updateForm} placeholder="Reorder level" type="number" />
            <HelpInput name="minPrice" value={form.minPrice} onChange={updateForm} placeholder="Minimum price" type="number" min="0" step="0.01" />
            <HelpInput name="maxPrice" value={form.maxPrice} onChange={updateForm} placeholder="Maximum price" type="number" min="0" step="0.01" />
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
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Price Range</th>
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
                  <div className="flex items-start gap-3">
                    {(drafts[material.variantId] || materialDraft(material)).imageUrl && (
                      <img className="h-12 w-12 rounded-lg border border-slate-200 object-cover bg-slate-50" src={(drafts[material.variantId] || materialDraft(material)).imageUrl} alt="" />
                    )}
                    <div className="min-w-0 flex-1">
                      <input className="w-full min-w-48 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-900" value={(drafts[material.variantId] || materialDraft(material)).name} onChange={(event) => updateDraft(material, { name: event.target.value })} />
                      <input className="mt-2 w-full min-w-48 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600" placeholder="Description" value={(drafts[material.variantId] || materialDraft(material)).description} onChange={(event) => updateDraft(material, { description: event.target.value })} />
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input className="w-28 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600" placeholder="Model" value={(drafts[material.variantId] || materialDraft(material)).model} onChange={(event) => updateDraft(material, { model: event.target.value })} />
                    <input className="w-28 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600" placeholder="Size" value={(drafts[material.variantId] || materialDraft(material)).size} onChange={(event) => updateDraft(material, { size: event.target.value })} />
                    <input className="w-24 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600" placeholder="Unit" value={(drafts[material.variantId] || materialDraft(material)).unit} onChange={(event) => updateDraft(material, { unit: event.target.value })} />
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input className="min-w-0 flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600" placeholder="Image URL" value={(drafts[material.variantId] || materialDraft(material)).imageUrl} onChange={(event) => updateDraft(material, { imageUrl: event.target.value })} />
                    <label className="shrink-0 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-500 cursor-pointer hover:bg-slate-50">
                      Upload
                      <input type="file" accept="image/*" onChange={(event) => uploadDraftImage(material, event)} className="sr-only" />
                    </label>
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
                  <input
                    className="mt-2 w-24 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs"
                    type="number"
                    min="0"
                    placeholder="Reorder"
                    value={(drafts[material.variantId] || materialDraft(material)).reorderLevel}
                    onChange={(event) => updateDraft(material, { reorderLevel: event.target.value })}
                  />
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-2">
                    <input className="w-24 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm" type="number" min="0" step="0.01" placeholder="Min" value={(drafts[material.variantId] || materialDraft(material)).minPrice} onChange={(event) => updateDraft(material, { minPrice: event.target.value })} />
                    <input className="w-24 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm" type="number" min="0" step="0.01" placeholder="Max" value={(drafts[material.variantId] || materialDraft(material)).maxPrice} onChange={(event) => updateDraft(material, { maxPrice: event.target.value })} />
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-xs font-bold text-slate-600">{material.status}</span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button type="button" className="p-2 text-slate-400 hover:text-[#b3000c]" onClick={() => saveMaterial(material)} title="Save row"><Save className="w-4 h-4" /></button>
                  <button type="button" className="p-2 text-slate-400 hover:text-[#b3000c]" onClick={() => deleteMaterial(material)} title="Delete material"><Trash2 className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function HelpInput({ name, className = '', ...props }) {
  return (
    <div className={`relative ${className}`}>
      <input
        name={name}
        className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-4 pr-10 text-sm"
        {...props}
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-white hover:text-slate-700"
        title={materialHelp[name] || 'Enter this material detail.'}
        aria-label={`${props.placeholder || name} help`}
      >
        <HelpCircle className="h-4 w-4" />
      </button>
    </div>
  );
}

export default ProductManagement;
