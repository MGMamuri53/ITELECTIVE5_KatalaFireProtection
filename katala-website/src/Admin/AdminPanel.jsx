import { useState } from 'react';
import Dashboard from './Dashboard';
import ProductManagement from './Product_Management';
import AccountManagement from './Account_Management';
import ServiceManagement from './Service_Management';
import WebsiteManagement from './Website_Management';

function AdminPanel() {
  const [activeTab, setActiveTab] = useState('Dashboard');

  const renderPage = () => {
    switch (activeTab) {
      case 'Dashboard':
        return <Dashboard onNavigate={setActiveTab} />;
      case 'Accounts':
        return <AccountManagement onNavigate={setActiveTab} />;
      case 'Website':
        return <WebsiteManagement onNavigate={setActiveTab} />;
      case 'Materials':
        return <ProductManagement onNavigate={setActiveTab} />;
      case 'Services':
        return <ServiceManagement onNavigate={setActiveTab} />;
      default:
        return <Dashboard onNavigate={setActiveTab} />;
    }
  };

  return renderPage();
}

export default AdminPanel;
