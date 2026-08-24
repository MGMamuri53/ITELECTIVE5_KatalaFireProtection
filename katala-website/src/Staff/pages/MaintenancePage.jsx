import { PageHeading, StatusBadge, SummaryCard, TableHeader } from '../StaffShared';
import { maintenanceChecks } from '../staffData';

function MaintenancePage() {
  return (
    <>
      <PageHeading title="Regular Maintenance Checkups" copy="Monitor recurring maintenance obligations and upcoming checkups for retained customers." />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <SummaryCard label="Due this week" value="3" />
        <SummaryCard label="Scheduled" value="12" />
        <SummaryCard label="Overdue" value="1" tone="danger" />
      </div>
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <TableHeader columns={['Plan ID', 'Customer', 'Scope', 'Due Date', 'Frequency', 'Status']} />
        <div className="divide-y divide-slate-100">
          {maintenanceChecks.map((check) => (
            <div key={check.id} className="grid grid-cols-6 gap-4 px-6 py-5 items-center hover:bg-slate-50/50 transition-colors">
              <span className="text-sm font-bold text-[#b3000c]">{check.id}</span>
              <span className="text-sm font-medium text-slate-900">{check.customer}</span>
              <span className="text-sm text-slate-600">{check.scope}</span>
              <span className="text-sm text-slate-600">{check.due}</span>
              <span className="text-sm text-slate-600">{check.frequency}</span>
              <StatusBadge status={check.status} />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export default MaintenancePage;
