import { useState } from 'react';
import Sidebar from './components/Sidebar';
import RoleSwitcher from './components/RoleSwitcher';
import Dashboard from './pages/Dashboard';
import AlertsPanel from './pages/AlertsPanel';
import NetworkView from './pages/NetworkView';
import GeoMapView from './pages/GeoMapView';
import TrendView from './pages/TrendView';
import IncidentReport from './pages/IncidentReport';

type Page = 'dashboard' | 'alerts' | 'network' | 'geomap' | 'trends' | 'reports';

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [role, setRole] = useState<'Analyst' | 'Admin'>('Admin');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const pageTitle: Record<Page, string> = {
    dashboard: 'Threat Dashboard',
    alerts: 'Alert Center',
    network: 'Network Analysis',
    geomap: 'Geo Intelligence',
    trends: 'Trend Monitor',
    reports: 'Incident Reports',
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return <Dashboard role={role} />;
      case 'alerts': return <AlertsPanel role={role} />;
      case 'network': return <NetworkView />;
      case 'geomap': return <GeoMapView />;
      case 'trends': return <TrendView />;
      case 'reports': return <IncidentReport role={role} />;
    }
  };

  return (
    <div className="app-layout">
      <Sidebar
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />
      <div className={`main-area ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <header className="header">
          <h1>{pageTitle[currentPage]}</h1>
          <RoleSwitcher role={role} onToggle={() => setRole(role === 'Admin' ? 'Analyst' : 'Admin')} />
        </header>
        <div className="page-content">
          {renderPage()}
        </div>
      </div>
    </div>
  );
}
