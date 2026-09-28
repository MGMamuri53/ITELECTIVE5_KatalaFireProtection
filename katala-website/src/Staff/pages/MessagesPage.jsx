import { useState } from 'react';
import { ChatPanel, PageHeading, RefreshTableButton } from '../StaffShared';
import { useStaffSearch } from '../staffSearch';
import { threads } from '../staffData';
import { filterStaffItems } from '../staffWorkflow';

function MessagesPage() {
  const [selected, setSelected] = useState(threads[0]);
  const { normalizedQuery } = useStaffSearch();
  const shown = filterStaffItems(threads.map((thread) => ({
    ...thread,
    id: thread.request,
    subject: thread.lastMessage,
    customer: thread.customer,
  })), normalizedQuery);
  const selectedThread = shown.find((thread) => thread.request === selected?.request) || shown[0];

  return (
    <>
      <PageHeading
        title="Messages"
        copy="View customer conversations linked to quotation and service requests."
        actions={<RefreshTableButton onClick={() => setSelected(threads[0])} label="Refresh table" />}
      />
      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6">
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {shown.map((thread) => (
            <button key={thread.id} onClick={() => setSelected(thread)} className={`w-full p-5 text-left border-b border-slate-100 hover:bg-slate-50 transition-colors ${selectedThread?.id === thread.id ? 'bg-red-50/50' : 'bg-white'}`}>
              <div className="flex justify-between gap-4 mb-1">
                <h2 className="text-sm font-bold text-slate-900">{thread.customer}</h2>
                <span className="text-xs text-slate-400">{thread.time}</span>
              </div>
              <p className="text-xs font-bold text-[#b3000c] mb-2">{thread.request}</p>
              <p className="text-sm text-slate-500">{thread.lastMessage}</p>
              {thread.unread > 0 && <span className="inline-flex mt-3 text-[10px] font-bold px-2 py-1 rounded-full bg-[#b3000c] text-white">{thread.unread} unread</span>}
            </button>
          ))}
          {!shown.length && <div className="px-6 py-10 text-sm text-slate-500">No messages match your search.</div>}
        </section>
        {selectedThread
          ? <ChatPanel selected={{ id: selectedThread.request, customer: selectedThread.customer, kind: 'Message', priority: selectedThread.unread ? 'Unread' : 'Normal' }} />
          : <aside className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-sm text-slate-500">Select a matching message thread.</aside>}
      </div>
    </>
  );
}

export default MessagesPage;
