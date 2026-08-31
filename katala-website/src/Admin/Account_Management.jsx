import { useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, ShieldCheck, UserCog, Users } from 'lucide-react';
import { schemaApi } from '../services/katalaApi';
import { useAdminSearch } from './Layout';
import { filterBySearch } from '../shared/search';

const roleOptions = [
  { value: 'customer', label: 'Customer' },
  { value: 'staff', label: 'Staff' },
  { value: 'admin', label: 'Admin' },
];

const statusOptions = ['Active', 'Pending', 'Inactive', 'Suspended'];
const accountTabs = [
  { value: 'customer', label: 'Customers' },
  { value: 'staff', label: 'Staff' },
  { value: 'admin', label: 'Admins' },
];

function AccountManagement({ initialTab = 'staff' }) {
  const [accounts, setAccounts] = useState([]);
  const [summary, setSummary] = useState({ customers: 0, staff: 0, pending: 0 });
  const [drafts, setDrafts] = useState({});
  const [activeTab, setActiveTab] = useState(initialTab);
  const [status, setStatus] = useState({ type: 'loading', message: 'Loading accounts...' });
  const { normalizedQuery } = useAdminSearch();

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  async function loadAccounts() {
    setStatus({ type: 'loading', message: 'Loading accounts...' });
    try {
      const data = await schemaApi.listAdminAccounts();
      setAccounts(data.accounts || []);
      setSummary(data.summary || { customers: 0, staff: 0, pending: 0 });
      setDrafts(Object.fromEntries((data.accounts || []).map((account) => [
        account.id,
        {
          role: account.role,
          status: account.status,
          assignedStaffName: account.assignedStaffName || '',
          staffDesignation: account.staffDesignation || '',
          department: account.department || '',
        },
      ])));
      setStatus({ type: 'idle', message: '' });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to load accounts.' });
    }
  }

  function updateDraft(accountId, field, value) {
    setDrafts((current) => ({
      ...current,
      [accountId]: {
        ...(current[accountId] || {}),
        [field]: value,
      },
    }));
  }

  async function saveAccount(accountId, patch = null) {
    const account = accounts.find((item) => item.id === accountId);
    const draft = patch || drafts[accountId];
    if (!account || !draft) return;
    const payload = {
      role: draft.role,
      status: draft.status,
      ...(draft.role === 'staff'
        ? {
            assignedStaffName: draft.assignedStaffName || '',
            staffDesignation: draft.staffDesignation || '',
            department: draft.department || '',
          }
        : {}),
    };

    setStatus({ type: 'loading', message: 'Saving account...' });
    try {
      const data = await schemaApi.updateAdminAccount(accountId, payload);
      setAccounts(data.accounts || []);
      setSummary(data.summary || { customers: 0, staff: 0, pending: 0 });
      setDrafts(Object.fromEntries((data.accounts || []).map((item) => [
        item.id,
        {
          role: item.role,
          status: item.status,
          assignedStaffName: item.assignedStaffName || '',
          staffDesignation: item.staffDesignation || '',
          department: item.department || '',
        },
      ])));
      setStatus({ type: 'success', message: 'Account updated.' });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to update account.' });
    }
  }

  const searched = filterBySearch(accounts, normalizedQuery, ['accountId', 'name', 'email', 'role', 'status', 'companyName', 'contactNumber', 'assignedStaffName', 'staffDesignation', 'department']);
  const shown = searched.filter((account) => account.role === activeTab);
  const pendingStaff = searched.filter((account) => account.role === 'staff' && account.status === 'Pending');
  const isStaffTab = activeTab === 'staff';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Accounts</h1>
          <p className="text-slate-500">
            {isStaffTab
              ? 'Edit assignment names, roles, departments, and availability for staff scheduling.'
              : activeTab === 'admin'
                ? 'Review administrator accounts and control account access.'
                : 'Review customer accounts and control account access.'}
          </p>
        </div>
        <button type="button" className="bg-white text-slate-700 px-4 py-2 rounded-lg font-bold flex items-center gap-2 border border-slate-200 hover:bg-slate-50 transition-colors" onClick={loadAccounts}>
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SummaryCard label="Customer accounts" value={summary.customers} icon={Users} />
        <SummaryCard label="Staff accounts" value={summary.staff} icon={UserCog} />
        <SummaryCard label="Pending approval" value={summary.pending} icon={ShieldCheck} />
      </div>

      {status.type !== 'idle' && (
        <div className={`rounded-lg border px-4 py-3 text-sm font-semibold ${
          status.type === 'error'
            ? 'bg-red-50 text-red-700 border-red-100'
            : status.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
              : 'bg-slate-50 text-slate-600 border-slate-200'
        }`}>
          {status.message}
        </div>
      )}

      {pendingStaff.length > 0 && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <p className="text-[10px] font-bold text-[#b3000c] uppercase tracking-widest mb-1">Staff approval</p>
              <h2 className="text-lg font-bold text-slate-900">Pending staff signups</h2>
            </div>
            <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-100 px-3 py-1 rounded-full">{pendingStaff.length} waiting</span>
          </div>
          <div className="grid gap-3">
            {pendingStaff.map((account) => (
              <article key={account.id} className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                <div>
                  <strong className="block text-slate-900">{account.name}</strong>
                  <span className="text-sm text-slate-500">{account.email}</span>
                </div>
                <button type="button" className="bg-[#b3000c] text-white px-4 py-2 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-[#8b000a] transition-colors" onClick={() => saveAccount(account.id, { role: 'staff', status: 'Active' })}>
                  <CheckCircle2 className="w-4 h-4" /> Approve staff
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {accountTabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={`px-4 py-2 rounded-lg border text-sm font-bold transition-colors ${activeTab === tab.value ? 'bg-[#b3000c] text-white border-[#b3000c]' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            onClick={() => setActiveTab(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50/50">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Account ID</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Name</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Email</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Role</th>
              {isStaffTab && <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Staff Assignment</th>}
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Status</th>
              <th className="px-6 py-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((account) => {
              const draft = drafts[account.id] || { role: account.role, status: account.status };
              return (
                <tr key={account.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 text-sm font-bold text-[#b3000c]">{account.accountId}</td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">{account.name}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{account.email}</td>
                  <td className="px-6 py-4">
                    <select className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700" value={draft.role} onChange={(event) => updateDraft(account.id, 'role', event.target.value)}>
                      {roleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </td>
                  {isStaffTab && <td className="px-6 py-4">
                    <div className="grid gap-2 min-w-52">
                      <input className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 disabled:bg-slate-50 disabled:text-slate-400" disabled={draft.role !== 'staff'} placeholder="Assigned staff name" value={draft.assignedStaffName || ''} onChange={(event) => updateDraft(account.id, 'assignedStaffName', event.target.value)} />
                      <input className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 disabled:bg-slate-50 disabled:text-slate-400" disabled={draft.role !== 'staff'} placeholder="Designation" value={draft.staffDesignation || ''} onChange={(event) => updateDraft(account.id, 'staffDesignation', event.target.value)} />
                      <input className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 disabled:bg-slate-50 disabled:text-slate-400" disabled={draft.role !== 'staff'} placeholder="Department / team" value={draft.department || ''} onChange={(event) => updateDraft(account.id, 'department', event.target.value)} />
                    </div>
                  </td>}
                  <td className="px-6 py-4">
                    <select className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700" value={draft.status} onChange={(event) => updateDraft(account.id, 'status', event.target.value)}>
                      {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-3">
                      <button type="button" className="text-xs font-bold text-[#b3000c] hover:underline" onClick={() => saveAccount(account.id)}>SAVE</button>
                      {draft.status === 'Active' ? (
                        <button type="button" className="text-xs font-bold text-slate-500 hover:underline" onClick={() => saveAccount(account.id, { ...draft, status: 'Inactive' })}>DEACTIVATE</button>
                      ) : (
                        <button type="button" className="text-xs font-bold text-emerald-700 hover:underline" onClick={() => saveAccount(account.id, { ...draft, status: 'Active' })}>ACTIVATE</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!shown.length && status.type !== 'loading' && (
              <tr>
                <td className="px-6 py-10 text-center text-sm text-slate-500" colSpan={isStaffTab ? 7 : 6}>{normalizedQuery ? 'No accounts match your search.' : `No ${activeTab} accounts found.`}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const SummaryCard = ({ label, value, icon: Icon }) => (
  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
    <div className="flex justify-between items-end">
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
        <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
      </div>
      <Icon className="w-6 h-6 text-slate-300" />
    </div>
  </div>
);

export default AccountManagement;
