
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, CircleX, ClipboardList, Globe2, LayoutDashboard, LogOut, Package, Search, Settings, User, Users, UserCog, Wrench } from 'lucide-react';
import { authApi, getStoredSession } from '../services/katalaApi';

const AdminSearchContext = createContext({ query: '', normalizedQuery: '', setQuery: () => {}, clearQuery: () => {} })

export function useAdminSearch() {
  return useContext(AdminSearchContext)
}

export const Sidebar = ({ activeTab, onNavigate }) => {
  const navItems = [
    { name: 'Dashboard', icon: LayoutDashboard },
    { name: 'Accounts', icon: UserCog },
    { name: 'Requests', icon: ClipboardList },
    { name: 'Website', icon: Globe2 },
    { name: 'Materials', icon: Package },
    { name: 'Services', icon: Wrench },
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
            type="button"
            key={item.name}
            onClick={() => {
              if (activeTab !== item.name) onNavigate(item.name)
            }}
            aria-current={activeTab === item.name ? 'page' : undefined}
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

      <SidebarAccount />
    </div>
  );
};

export const TopBar = ({ title }) => {
  const { query, setQuery, clearQuery } = useAdminSearch()
  return (
  <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 ml-[260px] sticky top-0 z-40">
    <div className="flex items-center gap-8 flex-1">
      <h2 className="text-[#b3000c] font-bold text-xl">{title}</h2>
      <div className="max-w-md w-full relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
        <input 
          type="text" 
          placeholder="Search..." 
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-10 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#b3000c]/20 transition-all"
        />
        {query && (
          <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700" onClick={clearQuery} aria-label="Clear admin search">
            <CircleX className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
    <div className="flex items-center gap-4">
      <button type="button" className="p-2 text-slate-500 hover:bg-slate-50 rounded-full relative">
        <Bell className="w-5 h-5" />
        <span className="absolute top-2 right-2 w-2 h-2 bg-[#b3000c] rounded-full border-2 border-white"></span>
      </button>
      <TopbarAccount />
    </div>
  </header>
  )
};

function Layout({ children, activeTab, title, onNavigate }) {
  const [query, setQuery] = useState('')
  const searchValue = useMemo(() => ({
    query,
    normalizedQuery: query.trim().replace(/\s+/g, ' ').toLowerCase(),
    setQuery,
    clearQuery: () => setQuery(''),
  }), [query])

  useEffect(() => {
    const theme = localStorage.getItem('katala-admin-theme') || 'light'
    document.documentElement.classList.toggle('admin-theme-dark', theme === 'dark')
  }, [])

  return (
    <AdminSearchContext.Provider value={searchValue}>
    <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-900">
      <Sidebar activeTab={activeTab} onNavigate={onNavigate} />
      <TopBar title={title} />
      <main className="ml-[260px] p-8">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
    </AdminSearchContext.Provider>
  );
}

export default Layout;

function accountLabel() {
  const user = getStoredSession()?.user
  return user?.name || user?.email || 'Admin User'
}

async function signOut() {
  await authApi.signout().catch(() => {})
  location.hash = 'signin'
}

function SidebarAccount() {
  const label = accountLabel()

  return (
    <div className="px-4 mt-auto">
      <button type="button" className="w-full flex items-center px-4 py-3 text-slate-300 hover:text-white transition-colors" onClick={signOut} title="Sign out">
        <div className="w-8 h-8 rounded-full bg-slate-600 mr-3 flex items-center justify-center">
          <Users className="w-4 h-4" />
        </div>
        <span className="text-sm font-medium truncate">{label}</span>
        <LogOut className="w-4 h-4 ml-auto" />
      </button>
    </div>
  )
}

function TopbarAccount() {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const label = accountLabel()
  const initial = label.charAt(0).toUpperCase()

  useEffect(() => {
    function close(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  return (
    <div className="portal-account-menu" ref={menuRef}>
      <button type="button" className="portal-avatar-button" onClick={() => setOpen((current) => !current)} aria-haspopup="menu" aria-expanded={open} title={label}>
        {initial || <User className="w-5 h-5" />}
      </button>
      <div className={`portal-account-dropdown ${open ? 'open' : ''}`} role="menu">
        <a href="#home" role="menuitem">Back to website</a>
        <button type="button" role="menuitem" onClick={signOut}>Sign out</button>
      </div>
    </div>
  )
}
