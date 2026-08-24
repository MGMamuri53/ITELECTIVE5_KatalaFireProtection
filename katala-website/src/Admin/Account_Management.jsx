import Layout from './Layout';
import { ShieldCheck, UserPlus, Users, UserCog } from 'lucide-react';

const accounts = [
  { id: 'CUS-1042', name: 'Apex Industrial Park', email: 'facilities@apex.test', role: 'Customer', status: 'Verified' },
  { id: 'CUS-1037', name: 'Summit Healthcare Facility', email: 'admin@summit.test', role: 'Customer', status: 'Pending' },
  { id: 'STF-0021', name: 'Mara Santos', email: 'mara@katala.test', role: 'Staff', status: 'Active' },
  { id: 'STF-0018', name: 'Luis Reyes', email: 'luis@katala.test', role: 'Staff', status: 'Active' },
];

function AccountManagement({ onNavigate }) {
  return (
    <Layout activeTab="Accounts" title="Account Management" onNavigate={onNavigate}>
      <div className="flex flex-col gap-6">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 mb-1">Accounts</h1>
            <p className="text-slate-500">Admin controls customer access, staff accounts, roles, and verification status.</p>
          </div>
          <button className="bg-[#b3000c] text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-[#8b000a] transition-colors">
            <UserPlus className="w-4 h-4" /> Add account
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <SummaryCard label="Customer accounts" value="128" icon={Users} />
          <SummaryCard label="Staff accounts" value="12" icon={UserCog} />
          <SummaryCard label="Pending verification" value="7" icon={ShieldCheck} />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Account ID</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Name</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Email</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Role</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Status</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {accounts.map((account) => (
                <tr key={account.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 text-sm font-bold text-[#b3000c]">{account.id}</td>
                  <td className="px-6 py-4 text-sm font-medium text-slate-900">{account.name}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{account.email}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{account.role}</td>
                  <td className="px-6 py-4">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${account.status === 'Pending' ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>
                      {account.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right"><button className="text-xs font-bold text-[#b3000c] hover:underline">MANAGE</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
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
