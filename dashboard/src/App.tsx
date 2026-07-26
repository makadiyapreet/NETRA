import { useState, useEffect } from 'react';
import { ThemeProvider } from './ThemeContext';
import Sidebar from './components/Sidebar';
import RoleSwitcher from './components/RoleSwitcher';
import GuidedTour from './components/GuidedTour';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import AlertsPanel from './pages/AlertsPanel';
import NetworkView from './pages/NetworkView';
import GeoMapView from './pages/GeoMapView';
import TrendView from './pages/TrendView';
import IncidentReport from './pages/IncidentReport';
import SearchResults from './pages/SearchResults';
import WatchlistManager from './pages/WatchlistManager';
import ModelPerformance from './pages/ModelPerformance';
import SystemHealth from './pages/SystemHealth';

type Page =
  | 'dashboard'
  | 'alerts'
  | 'network'
  | 'geomap'
  | 'trends'
  | 'reports'
  | 'search'
  | 'watchlist'
  | 'model-perf'
  | 'health';

const IS_DEV_MODE = import.meta.env.VITE_AUTH_MODE === 'dev';

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [role, setRole] = useState<'Analyst' | 'Admin'>('Admin');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userName, setUserName] = useState('');
  const [showTour, setShowTour] = useState(false);
  const [authView, setAuthView] = useState<'login' | 'signup'>('login');

  // Check for existing JWT on mount
  useEffect(() => {
    if (IS_DEV_MODE) {
      setIsAuthenticated(true);
      return;
    }

    const token = localStorage.getItem('netra-token');
    const userStr = localStorage.getItem('netra-user');
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        setRole(user.role || 'Analyst');
        setUserName(user.displayName || user.email || '');
        setIsAuthenticated(true);
      } catch {
        localStorage.removeItem('netra-token');
        localStorage.removeItem('netra-user');
      }
    }
  }, []);

  const handleLogin = (token: string, user: { id: number; email: string; role: 'Admin' | 'Analyst'; displayName: string }) => {
    setRole(user.role);
    setUserName(user.displayName || user.email);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('netra-token');
    localStorage.removeItem('netra-user');
    setIsAuthenticated(false);
    setRole('Analyst');
    setUserName('');
  };

  const pageTitle: Record<Page, string> = {
    dashboard: 'Threat Dashboard',
    alerts: 'Alert Center',
    network: 'Network Analysis',
    geomap: 'Geo Intelligence',
    trends: 'Trend Monitor',
    reports: 'Incident Reports',
    search: 'Search Results',
    watchlist: 'Watchlist Manager',
    'model-perf': 'Model Performance',
    health: 'System Health',
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setCurrentPage('search');
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return <Dashboard role={role} />;
      case 'alerts': return <AlertsPanel role={role} />;
      case 'network': return <NetworkView />;
      case 'geomap': return <GeoMapView />;
      case 'trends': return <TrendView />;
      case 'reports': return <IncidentReport role={role} />;
      case 'search': return <SearchResults query={searchQuery} onNavigate={setCurrentPage} />;
      case 'watchlist': return <WatchlistManager role={role} />;
      case 'model-perf': return <ModelPerformance />;
      case 'health': return <SystemHealth />;
    }
  };

  // Show login/signup screen if not authenticated
  if (!isAuthenticated) {
    return (
      <ThemeProvider>
        <div className="auth-page-wrapper">
          {authView === 'login' ? (
            <Login onLogin={handleLogin} onSwitchToSignup={() => setAuthView('signup')} />
          ) : (
            <Signup
              onSignupSuccess={() => setAuthView('login')}
              onSwitchToLogin={() => setAuthView('login')}
            />
          )}
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <div className="app-layout">
        <Sidebar
          currentPage={currentPage}
          onNavigate={setCurrentPage}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          role={role}
          onSearch={handleSearch}
        />
        <div className={`main-area ${sidebarCollapsed ? 'collapsed' : ''}`}>
          <header className="header">
            <h1>{pageTitle[currentPage]}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                onClick={() => setShowTour(true)}
                className="btn btn-primary btn-sm"
              >
                Take a Tour
              </button>
              {userName && (
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {userName} ({role})
                </span>
              )}
              {IS_DEV_MODE && (
                <RoleSwitcher role={role} onToggle={() => setRole(role === 'Admin' ? 'Analyst' : 'Admin')} />
              )}
              <button
                onClick={handleLogout}
                className="btn btn-secondary btn-sm"
              >
                Logout
              </button>
            </div>
          </header>
          <div className="page-content">
            {renderPage()}
          </div>
        </div>

        {showTour && (
          <GuidedTour
            onNavigate={setCurrentPage}
            onClose={() => setShowTour(false)}
          />
        )}
      </div>
    </ThemeProvider>
  );
}
