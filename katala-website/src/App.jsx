import { useEffect, useState } from 'react'
import './App.css'
import './layout_fix.css'
import Home from './page_home'
import Products from './page_products'
import Services from './page_services'
import Portfolio from './page_portfolio'
import Company from './page_company_profile'
import Signup from './page_signup'
import Signin from './page_signin'

const routes = { products: Products, services: Services, portfolio: Portfolio, company: Company, signup: Signup, signin: Signin }

export default function App() {
  const [page, setPage] = useState(() => location.hash.slice(1) || 'signup')
  useEffect(() => {
    const sync = () => setPage(location.hash.slice(1) || 'signup')
    addEventListener('hashchange', sync)
    return () => removeEventListener('hashchange', sync)
  }, [])
  const Page = routes[page] || Home
  return <Page />
}
