import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Bell,
  Network,
  Globe,
  TrendingUp,
  FileText,
  ChevronLeft,
  ChevronRight,
  Shield,
  Sun,
  Moon,
  List,
  Search,
} from 'lucide-react';
import { useTheme } from '../ThemeContext';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: any) => void;
  collapsed: boolean;
  onToggle: () => void;
  role: 'Analyst' | 'Admin';
  onSearch: (query: string) => void;
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'alerts', label: 'Alert Center', icon: Bell },
  { id: 'network', label: 'Network Graph', icon: Network },
  { id: 'geomap', label: 'Geo Map', icon: Globe },
  { id: 'trends', label: 'Trends', icon: TrendingUp },
  { id: 'reports', label: 'Reports', icon: FileText },
  { id: 'model-perf', label: 'Model Perf.', icon: TrendingUp },
  { id: 'health', label: 'System Health', icon: Shield },
];

export default function Sidebar({ currentPage, onNavigate, collapsed, onToggle, role, onSearch }: SidebarProps) {
  const { theme, toggleTheme } = useTheme();
  const [dataMode, setDataMode] = useState<'kafka' | 'offline' | 'fixture' | 'unknown'>('unknown');
  const [searchInput, setSearchInput] = useState('');

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => {
        if (d.mode === 'kafka') setDataMode('kafka');
        else if (d.mode === 'offline') setDataMode('offline');
        else setDataMode('fixture');
      })
      .catch(() => setDataMode('unknown'));
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      onSearch(searchInput.trim());
    }
  };

  return (
    <nav className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <Shield size={18} />
        </div>
        <span className="sidebar-logo-text">NETRA Analyzer</span>
      </div>

      {/* Data Mode Badge */}
      {dataMode !== 'unknown' && (
        <div className={`data-mode-badge ${dataMode === 'kafka' ? 'live' : dataMode === 'offline' ? 'live' : 'fixture'}`}>
          <span className="data-mode-dot" />
          <span>{dataMode === 'kafka' ? 'Live Data (Kafka)' : dataMode === 'offline' ? 'Live APIs (No Docker)' : 'Fixture Data'}</span>
        </div>
      )}

      {/* Search Bar */}
      <div className="search-bar">
        <form onSubmit={handleSearchSubmit}>
          <div className="search-bar-wrapper">
            <Search size={14} className="search-bar-icon" />
            <input
              type="text"
              className="search-bar-input"
              placeholder="Search keywords..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </form>
      </div>

      <div className="sidebar-nav">
        <div className="sidebar-section-title">Navigation</div>
        {navItems.map((item) => (
          <div
            key={item.id}
            className={`sidebar-item ${currentPage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <item.icon className="sidebar-icon" size={20} />
            <span className="sidebar-label">{item.label}</span>
          </div>
        ))}

        {/* Watchlist — Admin only */}
        {role === 'Admin' && (
          <div
            className={`sidebar-item ${currentPage === 'watchlist' ? 'active' : ''}`}
            onClick={() => onNavigate('watchlist')}
          >
            <List className="sidebar-icon" size={20} />
            <span className="sidebar-label">Watchlist</span>
          </div>
        )}
      </div>

      <div className="sidebar-toggle" style={{ display: 'flex', gap: 8 }}>
        <button className="theme-toggle" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button onClick={onToggle}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </nav>
  );
}
