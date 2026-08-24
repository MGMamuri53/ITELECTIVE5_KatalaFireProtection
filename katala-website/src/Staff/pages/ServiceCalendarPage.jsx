import { PageHeading, StatusBadge, TableHeader } from '../StaffShared';
import { calendarItems } from '../staffData';

function ServiceCalendarPage() {
  return (
    <>
      <PageHeading title="Service Calendar" copy="Track scheduled service visits, assigned staff, and customer confirmations." />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <TableHeader columns={['Date', 'Customer', 'Service', 'Assigned Staff', 'Status']} />
          <div className="divide-y divide-slate-100">
            {calendarItems.map((item) => (
              <div key={`${item.date}-${item.customer}`} className="grid grid-cols-5 gap-4 px-6 py-5 items-center hover:bg-slate-50/50 transition-colors">
                <span className="text-sm font-bold text-[#b3000c]">{item.date}<br /><span className="text-xs text-slate-500 font-medium">{item.time}</span></span>
                <span className="text-sm font-medium text-slate-900">{item.customer}</span>
                <span className="text-sm text-slate-600">{item.service}</span>
                <span className="text-sm text-slate-600">{item.staff}</span>
                <StatusBadge status={item.status} />
              </div>
            ))}
          </div>
        </section>
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Add schedule</h2>
          <div className="space-y-4">
            <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm" placeholder="Customer" />
            <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm" placeholder="Service type" />
            <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm" type="date" />
            <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm" type="time" />
          </div>
          <button className="mt-4 bg-[#b3000c] text-white px-4 py-2 rounded-lg font-bold hover:bg-[#8b000a] transition-colors">Save schedule</button>
        </section>
      </div>
    </>
  );
}

export default ServiceCalendarPage;
