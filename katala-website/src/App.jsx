import { useEffect, useState } from 'react'
import './App.css'
import './layout_fix.css'
import Home from './page_home'
import Products from './page_products'
import Services from './page_services'
import Portfolio from './page_portfolio'
import Company from './page_company_profile'
import AdminPanel from './Admin/AdminPanel'

const routes = { products: Products, services: Services, portfolio: Portfolio, company: Company, admin: AdminPanel }

export default function App() {
  const [page, setPage] = useState(() => location.hash.slice(1) || 'home')
  useEffect(() => {
    const sync = () => setPage(location.hash.slice(1) || 'home')
    addEventListener('hashchange', sync)
    return () => removeEventListener('hashchange', sync)
  }, [])
  const Page = routes[page] || Home
  return <Page />
}
