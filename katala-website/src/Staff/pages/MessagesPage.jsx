import { useState } from 'react';
import { ChatPanel, PageHeading } from '../StaffShared';
import { threads } from '../staffData';

function MessagesPage() {
  const [selected, setSelected] = useState(threads[0]);

  return (
    <>
      <PageHeading title="Messages" copy="View customer conversations linked to quotation and service requests." />
      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6">
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {threads.map((thread) => (
            <button key={thread.id} onClick={() => setSelected(thread)} className={`w-full p-5 text-left border-b border-slate-100 hover:bg-slate-50 transition-colors ${selected.id === thread.id ? 'bg-red-50/50' : 'bg-white'}`}>
              <div className="flex justify-between gap-4 mb-1">
                <h2 className="text-sm font-bold text-slate-900">{thread.customer}</h2>
                <span className="text-xs text-slate-400">{thread.time}</span>
              </div>
              <p className="text-xs font-bold text-[#b3000c] mb-2">{thread.request}</p>
              <p className="text-sm text-slate-500">{thread.lastMessage}</p>
              {thread.unread > 0 && <span className="inline-flex mt-3 text-[10px] font-bold px-2 py-1 rounded-full bg-[#b3000c] text-white">{thread.unread} unread</span>}
            </button>
          ))}
        </section>
        <ChatPanel selected={{ id: selected.request, customer: selected.customer, kind: 'Message', priority: selected.unread ? 'Unread' : 'Normal' }} />
      </div>
    </>
  );
}

export default MessagesPage;
