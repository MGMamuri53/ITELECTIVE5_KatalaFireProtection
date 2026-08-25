import { useEffect, useState } from 'react';
import { Clock, Plus, Save, Trash2 } from 'lucide-react';
import { schemaApi } from '../services/katalaApi';

const emptyService = {
  code: '',
  name: '',
  category: '',
  duration: '',
  description: '',
  active: true,
};

function serviceDraft(service) {
  return {
    code: service.code || '',
    name: service.name || '',
    category: service.category || '',
    duration: service.duration || '',
    description: service.description || '',
    active: Boolean(service.active),
  };
}

function ServiceManagement() {
  const [services, setServices] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [form, setForm] = useState(emptyService);
  const [status, setStatus] = useState({ type: 'loading', message: 'Loading services...' });

  useEffect(() => {
    loadServices();
  }, []);

  async function loadServices() {
    setStatus({ type: 'loading', message: 'Loading services...' });
    try {
      const data = await schemaApi.listAdminServices();
      setServices(data.services || []);
      setDrafts(Object.fromEntries((data.services || []).map((item) => [item.serviceId, serviceDraft(item)])));
      setStatus({ type: 'idle', message: '' });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to load services.' });
    }
  }

  function updateForm(event) {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
  }

  async function addService(event) {
    event.preventDefault();
    setStatus({ type: 'loading', message: 'Saving service...' });
    try {
      const data = await schemaApi.createAdminService(form);
      setServices(data.services || []);
      setDrafts(Object.fromEntries((data.services || []).map((item) => [item.serviceId, serviceDraft(item)])));
      setForm(emptyService);
      setStatus({ type: 'success', message: 'Service saved to Supabase.' });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to save service.' });
    }
  }

  function updateDraft(service, patch) {
    setDrafts((current) => ({
      ...current,
      [service.serviceId]: {
        ...serviceDraft(service),
        ...(current[service.serviceId] || {}),
        ...patch,
      },
    }));
  }

  async function saveService(service) {
    const draft = drafts[service.serviceId] || serviceDraft(service);
    setStatus({ type: 'loading', message: 'Updating service...' });
    try {
      const data = await schemaApi.updateAdminService(service.serviceId, draft);
      setServices(data.services || []);
      setDrafts(Object.fromEntries((data.services || []).map((item) => [item.serviceId, serviceDraft(item)])));
      setStatus({ type: 'success', message: 'Service updated.' });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to update service.' });
    }
  }

  async function deleteService(service) {
    if (!window.confirm(`Deactivate ${service.name}?`)) return;
    setStatus({ type: 'loading', message: 'Deactivating service...' });
    try {
      const data = await schemaApi.deleteAdminService(service.serviceId);
      setServices(data.services || []);
      setDrafts(Object.fromEntries((data.services || []).map((item) => [item.serviceId, serviceDraft(item)])));
      setStatus({ type: 'success', message: 'Service deactivated.' });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to deactivate service.' });
    }
  }

  return (
    <>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Services</h1>
          <p className="text-slate-500">Add, update, publish, or hide services that customers can request.</p>
        </div>
      </div>

      {status.type !== 'idle' && (
        <div className={`mb-6 rounded-lg border px-4 py-3 text-sm ${status.type === 'error' ? 'bg-red-50 text-red-700 border-red-100' : status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-blue-50 text-blue-700 border-blue-100'}`}>
          {status.message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
        <form className="bg-white rounded-xl border border-slate-200 shadow-sm p-6" onSubmit={addService}>
          <h2 className="text-lg font-bold text-slate-900 mb-4">Quick add service</h2>
          <div className="space-y-4">
            <input name="code" value={form.code} onChange={updateForm} required className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm" placeholder="Service code" />
            <input name="name" value={form.name} onChange={updateForm} required className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm" placeholder="Service name" />
            <input name="category" value={form.category} onChange={updateForm} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm" placeholder="Category" />
            <input name="duration" value={form.duration} onChange={updateForm} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm" placeholder="Estimated duration" />
            <textarea name="description" value={form.description} onChange={updateForm} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm min-h-28" placeholder="Customer-facing description" />
            <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
              <input type="checkbox" name="active" checked={form.active} onChange={updateForm} />
              Publish service
            </label>
          </div>
          <button className="mt-4 bg-[#b3000c] text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-[#8b000a] transition-colors" disabled={status.type === 'loading'}>
            <Plus className="w-4 h-4" /> Save service
          </button>
        </form>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="grid grid-cols-6 gap-4 px-6 py-4 bg-slate-50/50 text-xs font-bold text-slate-500 uppercase">
            <span>Code</span>
            <span>Service</span>
            <span>Category</span>
            <span>Duration</span>
            <span>Status</span>
            <span></span>
          </div>
          <div className="divide-y divide-slate-100">
            {services.map((service) => (
              <div key={service.serviceId} className="grid grid-cols-6 gap-4 px-6 py-5 items-center hover:bg-slate-50/50 transition-colors">
                <input className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-[#b3000c]" value={(drafts[service.serviceId] || serviceDraft(service)).code} onChange={(event) => updateDraft(service, { code: event.target.value })} />
                <input className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-900" value={(drafts[service.serviceId] || serviceDraft(service)).name} onChange={(event) => updateDraft(service, { name: event.target.value })} />
                <input className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600" value={(drafts[service.serviceId] || serviceDraft(service)).category} onChange={(event) => updateDraft(service, { category: event.target.value })} />
                <span className="flex items-center gap-2"><Clock className="w-4 h-4 text-slate-300" /><input className="min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600" value={(drafts[service.serviceId] || serviceDraft(service)).duration} onChange={(event) => updateDraft(service, { duration: event.target.value })} /></span>
                <select className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold" value={(drafts[service.serviceId] || serviceDraft(service)).active ? 'Active' : 'Draft'} onChange={(event) => updateDraft(service, { active: event.target.value === 'Active' })}>
                  <option>Active</option>
                  <option>Draft</option>
                </select>
                <span className="flex justify-end gap-2">
                  <button type="button" className="p-2 text-slate-400 hover:text-[#b3000c]" onClick={() => saveService(service)} title="Save"><Save className="w-4 h-4" /></button>
                  <button type="button" className="p-2 text-slate-400 hover:text-[#b3000c]" onClick={() => deleteService(service)} title="Deactivate"><Trash2 className="w-4 h-4" /></button>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

export default ServiceManagement;
