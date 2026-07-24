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
} from 'lucide-react';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: any) => void;
  collapsed: boolean;
  onToggle: () => void;
}

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'alerts', label: 'Alert Center', icon: Bell },
  { id: 'network', label: 'Network Graph', icon: Network },
  { id: 'geomap', label: 'Geo Map', icon: Globe },
  { id: 'trends', label: 'Trends', icon: TrendingUp },
  { id: 'reports', label: 'Reports', icon: FileText },
];

export default function Sidebar({ currentPage, onNavigate, collapsed, onToggle }: SidebarProps) {
  return (
    <nav className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <Shield size={18} />
        </div>
        <span className="sidebar-logo-text">PS05 Analyzer</span>
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
      </div>

      <div className="sidebar-toggle">
        <button onClick={onToggle}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </nav>
  );
}
