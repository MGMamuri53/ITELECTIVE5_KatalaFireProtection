import { useEffect, useState } from 'react';
import Dashboard from './Dashboard';
import ProductManagement from './Product_Management';
import AccountManagement from './Account_Management';
import ServiceManagement from './Service_Management';
import WebsiteManagement from './Website_Management';
import QuotationRequests from './Quotation_Request';
import SystemSettings from './System_Settings';
import Layout from './Layout';

const pageTitles = {
  Dashboard: 'Admin Portal',
  Accounts: 'Account Management',
  Requests: 'Quotation Requests',
  Website: 'Website Management',
  Materials: 'Materials & Stock',
  Services: 'Service Management',
  Settings: 'System Settings',
};

function AdminPanel() {
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [visitedTabs, setVisitedTabs] = useState(() => new Set(['Dashboard']));

  useEffect(() => {
    setVisitedTabs((current) => {
      if (current.has(activeTab)) return current;
      const next = new Set(current);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  return (
    <Layout activeTab={activeTab} title={pageTitles[activeTab] || 'Admin Portal'} onNavigate={setActiveTab}>
      <AdminPane active={activeTab === 'Dashboard'} mounted={visitedTabs.has('Dashboard')}><Dashboard /></AdminPane>
      <AdminPane active={activeTab === 'Accounts'} mounted={visitedTabs.has('Accounts')}><AccountManagement /></AdminPane>
      <AdminPane active={activeTab === 'Requests'} mounted={visitedTabs.has('Requests')}><QuotationRequests /></AdminPane>
      <AdminPane active={activeTab === 'Website'} mounted={visitedTabs.has('Website')}><WebsiteManagement /></AdminPane>
      <AdminPane active={activeTab === 'Materials'} mounted={visitedTabs.has('Materials')}><ProductManagement /></AdminPane>
      <AdminPane active={activeTab === 'Services'} mounted={visitedTabs.has('Services')}><ServiceManagement /></AdminPane>
      <AdminPane active={activeTab === 'Settings'} mounted={visitedTabs.has('Settings')}><SystemSettings /></AdminPane>
    </Layout>
  );
}

function AdminPane({ active, mounted, children }) {
  if (!mounted) return null;
  return <section hidden={!active}>{children}</section>;
}

export default AdminPanel;
