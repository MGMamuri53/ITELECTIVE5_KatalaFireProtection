import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  MessageSquare,
  Search,
  ShieldCheck,
  UserRound,
} from 'lucide-react';

const navItems = [
  { name: 'Work Queue', route: 'staff-work-queue', icon: ClipboardList },
  { name: 'Messages', route: 'staff-messages', icon: MessageSquare },
  { name: 'Service Calendar', route: 'staff-service-calendar', icon: CalendarDays },
  { name: 'Maintenance', route: 'staff-maintenance', icon: ShieldCheck },
  { name: 'Completed', route: 'staff-completed', icon: CheckCircle2 },
];

function StaffLayout({ activePage, children }) {
  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-900">
      <aside className="w-[250px] h-screen bg-[#334155] text-white fixed left-0 top-0 flex flex-col py-6 border-r border-slate-700">
        <div className="px-6 mb-10 flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
            <div className="w-6 h-6 bg-[#b3000c] rounded-sm flex items-center justify-center text-white font-bold">K</div>
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight text-white">Katala Staff</h1>
            <p className="text-xs text-slate-400">Request Desk</p>
          </div>
        </div>

        <nav className="flex-1 px-2 space-y-1">
          {navItems.map((item) => (
            <StaffNavItem
              key={item.name}
              active={activePage === item.name}
              href={`#${item.route}`}
              icon={item.icon}
              label={item.name}
            />
          ))}
        </nav>

        <a href="#home" className="mx-4 px-4 py-3 text-sm font-medium text-slate-300 hover:text-white transition-colors">Back to website</a>
      </aside>

      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 ml-[250px] sticky top-0 z-40">
        <div className="flex items-center gap-8 flex-1">
          <h2 className="text-[#b3000c] font-bold text-xl">Staff Portal</h2>
          <div className="max-w-md w-full relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3000c]/20 transition-all" placeholder="Search quote, service, customer, or schedule..." />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button className="p-2 text-slate-500 hover:bg-slate-50 rounded-full relative">
            <Bell className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-[#b3000c] rounded-full border-2 border-white"></span>
          </button>
          <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center border border-slate-200">
            <UserRound className="w-5 h-5 text-slate-500" />
          </div>
        </div>
      </header>

      <main className="ml-[250px] p-8">
        <div className="max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}

const StaffNavItem = ({ active = false, href, icon: Icon, label }) => (
  <a href={href} className={`w-full flex items-center px-4 py-3 rounded-lg transition-colors ${active ? 'bg-[#b3000c] text-white' : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'}`}>
    <Icon className="w-5 h-5 mr-3" />
    <span className="font-medium text-sm">{label}</span>
  </a>
);

export default StaffLayout;
