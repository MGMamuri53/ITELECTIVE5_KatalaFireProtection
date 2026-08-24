import { useState } from 'react';
import { ChatPanel, PageHeading, StatusBadge, TableHeader } from '../StaffShared';
import { queue } from '../staffData';

function WorkQueuePage() {
  const [selected, setSelected] = useState(queue[0]);

  return (
    <>
      <PageHeading title="Customer Requests" copy="Staff handles quotation review, service scheduling, and customer follow-up." />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6">
        <RequestTable items={queue} selected={selected} onSelect={setSelected} />
        <ChatPanel selected={selected} />
      </div>
    </>
  );
}

function RequestTable({ items, selected, onSelect }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <TableHeader columns={['Reference', 'Customer', 'Request', 'Status']} />
      <div className="divide-y divide-slate-100">
        {items.map((item) => (
          <button key={item.id} onClick={() => onSelect(item)} className={`w-full grid grid-cols-4 gap-4 px-6 py-5 text-left hover:bg-slate-50 transition-colors ${selected.id === item.id ? 'bg-red-50/50' : 'bg-white'}`}>
            <span className="text-sm font-bold text-[#b3000c]">{item.id}</span>
            <span className="text-sm font-medium text-slate-900">{item.customer}</span>
            <span className="text-sm text-slate-600">{item.subject}</span>
            <span><StatusBadge status={item.status} /></span>
          </button>
        ))}
      </div>
    </section>
  );
}

export default WorkQueuePage;
