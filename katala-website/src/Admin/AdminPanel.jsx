import { useState } from 'react';
import Dashboard from './Dashboard';
import ProductManagement from './Product_Management';
import QuotationRequests from './Quotation_Request';

function AdminPanel() {
  const [activeTab, setActiveTab] = useState('Dashboard');

  const renderPage = () => {
    switch (activeTab) {
      case 'Dashboard':
        return <Dashboard onNavigate={setActiveTab} />;
      case 'Products':
        return <ProductManagement onNavigate={setActiveTab} />;
      case 'Requests':
        return <QuotationRequests onNavigate={setActiveTab} />;
      default:
        return <Dashboard onNavigate={setActiveTab} />;
    }
  };

  return renderPage();
}

export default AdminPanel;
