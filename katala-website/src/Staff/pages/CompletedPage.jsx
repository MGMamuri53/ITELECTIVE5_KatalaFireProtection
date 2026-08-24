import { PageHeading, TableHeader } from '../StaffShared';
import { completedItems } from '../staffData';

function CompletedPage() {
  return (
    <>
      <PageHeading title="Completed Work" copy="Review completed quotations, service jobs, and maintenance checkups." />
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <TableHeader columns={['Reference', 'Customer', 'Type', 'Completed', 'Result']} />
        <div className="divide-y divide-slate-100">
          {completedItems.map((item) => (
            <div key={item.id} className="grid grid-cols-5 gap-4 px-6 py-5 items-center hover:bg-slate-50/50 transition-colors">
              <span className="text-sm font-bold text-[#b3000c]">{item.id}</span>
              <span className="text-sm font-medium text-slate-900">{item.customer}</span>
              <span className="text-sm text-slate-600">{item.type}</span>
              <span className="text-sm text-slate-600">{item.completed}</span>
              <span className="text-sm text-emerald-700 font-medium">{item.result}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export default CompletedPage;
