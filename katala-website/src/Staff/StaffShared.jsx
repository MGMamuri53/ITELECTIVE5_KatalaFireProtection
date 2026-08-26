import { useState } from 'react';
import { RefreshCw, Send } from 'lucide-react';
import { chatMessages } from './staffData';

export function PageHeading({ title, copy, actions = null }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-1">{title}</h1>
        <p className="text-slate-500">{copy}</p>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function RefreshTableButton({ onClick, loading = false, label = 'Refresh table' }) {
  return (
    <button
      type="button"
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-60"
      onClick={onClick}
      disabled={loading}
    >
      <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
      {loading ? 'Refreshing...' : label}
    </button>
  );
}

export function TableHeader({ columns }) {
  return (
    <div className="grid gap-4 px-6 py-4 bg-slate-50/50 text-xs font-bold text-slate-500 uppercase" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
      {columns.map((column) => <span key={column}>{column}</span>)}
    </div>
  );
}

export function StatusBadge({ status }) {
  const style = /due|awaiting|tentative|review|reply/i.test(status)
    ? 'bg-amber-50 text-amber-700 border-amber-100'
    : /confirm|scheduled|open/i.test(status)
      ? 'bg-blue-50 text-blue-700 border-blue-100'
      : 'bg-emerald-50 text-emerald-700 border-emerald-100';

  return <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${style}`}>{status}</span>;
}

export function SummaryCard({ label, value, tone = 'default' }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <h2 className={`text-3xl font-bold ${tone === 'danger' ? 'text-[#b3000c]' : 'text-slate-900'}`}>{value}</h2>
    </div>
  );
}

export function ChatPanel({ selected }) {
  const [draft, setDraft] = useState('');

  return (
    <aside className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col min-h-[620px]">
      <div className="p-5 border-b border-slate-200">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Customer chat</p>
        <h2 className="text-lg font-bold text-slate-900">{selected.customer}</h2>
        <p className="text-sm text-slate-500">{selected.id} / {selected.kind} / {selected.priority} priority</p>
      </div>

      <div className="flex-1 p-5 space-y-4 bg-slate-50/50">
        {chatMessages.map((message, index) => (
          <div key={index} className={`flex ${message.from === 'staff' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[82%] rounded-xl px-4 py-3 text-sm shadow-sm ${message.from === 'staff' ? 'bg-[#b3000c] text-white' : 'bg-white text-slate-700 border border-slate-200'}`}>
              <p className={`text-[10px] font-bold uppercase mb-1 ${message.from === 'staff' ? 'text-red-100' : 'text-slate-400'}`}>{message.name}</p>
              <p>{message.text}</p>
            </div>
          </div>
        ))}
      </div>

      <form className="p-4 border-t border-slate-200 flex gap-3" onSubmit={(event) => { event.preventDefault(); setDraft(''); }}>
        <input value={draft} onChange={(event) => setDraft(event.target.value)} className="flex-1 bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3000c]/20" placeholder="Reply to customer..." />
        <button className="bg-[#b3000c] text-white px-4 rounded-lg font-bold flex items-center gap-2 hover:bg-[#8b000a] transition-colors" type="submit">
          <Send className="w-4 h-4" /> Send
        </button>
      </form>
    </aside>
  );
}
