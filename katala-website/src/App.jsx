import { useEffect, useState } from 'react'
import './App.css'
import Home from './page_home'
import Products from './page_products'
import Services from './page_services'
import Portfolio from './page_portfolio'
import Company from './page_company_profile'
import AdminPanel from './Admin/AdminPanel'
import Signup from './page_signup'
import Signin from './page_signin'
import { getStoredSession } from './services/katalaApi'

const routes = {
  home: Home,
  products: Products,
  services: Services,
  portfolio: Portfolio,
  company: Company,
  admin: AdminPanel,
  signup: Signup,
  signin: Signin,
}

function currentRoute() {
  const route = location.hash.slice(1).trim().toLowerCase()
  return routes[route] ? route : 'signup'
}

export default function App() {
  const [page, setPage] = useState(currentRoute)

  useEffect(() => {
    if (!location.hash) history.replaceState(null, '', '#signup')

    const syncRoute = () => {
      setPage(currentRoute())
      window.scrollTo(0, 0)
    }

    const syncAuth = () => {
      const session = getStoredSession()
      const route = currentRoute()

      // Supabase's email-confirmation link can establish the verified session
      // when the customer returns to the site. Move verified customers out of
      // the registration/sign-in screen once that session is available.
      if (session?.token && (route === 'signup' || route === 'signin')) {
        const returnPage = sessionStorage.getItem('katala-return-after-auth') || 'home'
        sessionStorage.removeItem('katala-return-after-auth')
        location.hash = returnPage
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
  return <Page />
}