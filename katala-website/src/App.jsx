import { useEffect, useState } from 'react'
import './App.css'
import Home from './page_home'
import Products from './page_products'
import Services from './page_services'
import Portfolio from './page_portfolio'
import Company from './page_company_profile'
import AdminPanel from './Admin/AdminPanel'
import StaffPanel, { StaffCompleted, StaffMaintenance, StaffMessages, StaffPaidAssignments, StaffServiceCalendar, StaffSettings, StaffWorkQueue } from './Staff/StaffPanel'
import Profile from './page_profile'
import Signup from './page_signup'
import Signin from './page_signin'
import { getStoredSession, isAuthReady } from './services/katalaApi'

const staffRoutes = new Set(['staff', 'staff-work-queue', 'staff-messages', 'staff-paid-assignments', 'staff-service-calendar', 'staff-maintenance', 'staff-completed', 'staff-settings'])
const protectedRoutes = new Set(['admin', 'profile', ...staffRoutes])

const routes = {
  home: Home,
  products: Products,
  services: Services,
  portfolio: Portfolio,
  company: Company,
  profile: Profile,
  admin: AdminPanel,
  staff: StaffPanel,
  'staff-work-queue': StaffWorkQueue,
  'staff-messages': StaffMessages,
  'staff-paid-assignments': StaffPaidAssignments,
  'staff-service-calendar': StaffServiceCalendar,
  'staff-maintenance': StaffMaintenance,
  'staff-completed': StaffCompleted,
  'staff-settings': StaffSettings,
  signup: Signup,
  signin: Signin,
}

function defaultRouteForRole(role) {
  if (role === 'admin') return 'admin'
  if (role === 'staff') return 'staff-work-queue'
  return 'profile'
}

function canAccessRoute(route, role, hasToken) {
  if (!protectedRoutes.has(route)) return true
  if (!hasToken) return false
  if (route === 'admin') return role === 'admin'
  if (staffRoutes.has(route)) return role === 'staff' || role === 'admin'
  return route === 'profile'
}

function safeRouteForRole(route, role, hasToken) {
  return canAccessRoute(route, role, hasToken) ? route : defaultRouteForRole(role)
}

function currentRoute() {
  const route = location.hash
    .slice(1)
    .split('?')[0]
    .replace(/^\/+/, '')
    .trim()
    .toLowerCase()
  return routes[route] ? route : 'home'
}

export default function App() {
  const [page, setPage] = useState(currentRoute)
  const [authReady, setAuthReady] = useState(isAuthReady)

  useEffect(() => {
    if (!location.hash) history.replaceState(null, '', '#home')

    const syncRoute = () => {
      setPage(currentRoute())
      window.scrollTo(0, 0)
      syncAuth()
    }

    const syncAuth = () => {
      setAuthReady(isAuthReady())
      const session = getStoredSession()
      const route = currentRoute()
      const role = session?.user?.role || 'customer'

      if (!isAuthReady() && protectedRoutes.has(route)) return

      // Supabase's email-confirmation link can establish the verified session
      // when the customer returns to the site. Move verified customers out of
      // the registration/sign-in screen once that session is available.
      if (session?.token && (route === 'signup' || route === 'signin')) {
        if (route === 'signin' && sessionStorage.getItem('katala-login-in-progress')) return
        const savedReturnPage = sessionStorage.getItem('katala-return-after-auth') || defaultRouteForRole(role)
        const returnPage = safeRouteForRole(savedReturnPage, role, Boolean(session?.token))
        sessionStorage.removeItem('katala-return-after-auth')
        location.hash = returnPage
      }

      if (route === 'admin' && !session?.token) {
        sessionStorage.setItem('katala-return-after-auth', 'admin')
        location.hash = 'signin'
      }

      if (route === 'admin' && session?.token && role !== 'admin') {
        sessionStorage.removeItem('katala-return-after-auth')
        location.hash = defaultRouteForRole(role)
      }

      if (staffRoutes.has(route) && !session?.token) {
        sessionStorage.setItem('katala-return-after-auth', route)
        location.hash = 'signin'
      }

      if (staffRoutes.has(route) && session?.token && !['staff', 'admin'].includes(role)) {
        sessionStorage.removeItem('katala-return-after-auth')
        location.hash = defaultRouteForRole(role)
      }
    }

    addEventListener('hashchange', syncRoute)
    addEventListener('katala-auth-changed', syncAuth)
    syncAuth()

    return () => {
      removeEventListener('hashchange', syncRoute)
      removeEventListener('katala-auth-changed', syncAuth)
    }
  }, [])

  const Page = routes[page] || Signup
  if (!authReady && protectedRoutes.has(page)) {
    return <div className="auth-loading-screen">Loading secure portal...</div>
  }
  return <Page />
}
