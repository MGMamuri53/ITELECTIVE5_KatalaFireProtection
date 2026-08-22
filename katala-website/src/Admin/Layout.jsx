
import { LayoutDashboard, Package, Wrench, ClipboardList, Calendar, Users, Settings, Search, Bell } from 'lucide-react';

export const Sidebar = ({ activeTab, onNavigate }) => {
  const navItems = [
    { name: 'Dashboard', icon: LayoutDashboard },
    { name: 'Products', icon: Package },
    { name: 'Services', icon: Wrench },
    { name: 'Requests', icon: ClipboardList },
    { name: 'Appointments', icon: Calendar },
    { name: 'Customers', icon: Users },
    { name: 'Settings', icon: Settings },
  ];

  return (
    <div className="w-[260px] h-screen bg-[#334155] text-white fixed left-0 top-0 flex flex-col py-6 border-r border-slate-700">
      <div className="px-6 mb-10 flex items-center gap-3">
        <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
          <div className="w-6 h-6 bg-[#b3000c] rounded-sm flex items-center justify-center text-white font-bold">K</div>
        </div>
        <div>
          <h1 className="font-bold text-lg leading-tight text-white">Katala Admin</h1>
          <p className="text-xs text-slate-400">Safety Management</p>
        </div>
      </div>
      
      <nav className="flex-1 px-2 space-y-1">
        {navItems.map((item) => (
          <button
            key={item.name}
            onClick={() => onNavigate(item.name)}
            className={`w-full flex items-center px-4 py-3 rounded-lg transition-colors ${
              activeTab === item.name 
                ? 'bg-[#b3000c] text-white' 
                : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
            }`}
          >
            <item.icon className="w-5 h-5 mr-3" />
            <span className="font-medium text-sm">{item.name}</span>
          </button>
        ))}
      </nav>

      <div className="px-4 mt-auto">
        <button className="w-full flex items-center px-4 py-3 text-slate-300 hover:text-white transition-colors">
          <div className="w-8 h-8 rounded-full bg-slate-600 mr-3 flex items-center justify-center">
            <Users className="w-4 h-4" />
          </div>
          <span className="text-sm font-medium">Admin User</span>
        </button>
      </div>
    </div>
  );
};

export const TopBar = ({ title }) => (
  <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 ml-[260px] sticky top-0 z-40">
    <div className="flex items-center gap-8 flex-1">
      <h2 className="text-[#b3000c] font-bold text-xl">{title}</h2>
      <div className="max-w-md w-full relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
        <input 
          type="text" 
          placeholder="Search..." 
          className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3000c]/20 transition-all"
        />
      </div>
    </div>
    <div className="flex items-center gap-4">
      <button className="p-2 text-slate-500 hover:bg-slate-50 rounded-full relative">
        <Bell className="w-5 h-5" />
        <span className="absolute top-2 right-2 w-2 h-2 bg-[#b3000c] rounded-full border-2 border-white"></span>
      </button>
      <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden border border-slate-200">
        <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=150" alt="User" />
      </div>
    </div>
  </header>
);

function Layout({ children, activeTab, title, onNavigate }) {
  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-900">
      <Sidebar activeTab={activeTab} onNavigate={onNavigate} />
      <TopBar title={title} />
      <main className="ml-[260px] p-8">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

export default Layout;