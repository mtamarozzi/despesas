import React from 'react';
import { 
  LayoutDashboard, 
  Receipt, 
  PlusCircle, 
  BarChart3, 
  Bell, 
  Settings, 
  LogOut,
  ChevronRight
} from 'lucide-react';
import logoImg from '../assets/logo.png';
import './Sidebar.css';

const Sidebar = ({ activeTab, setActiveTab, onExport, user, isOpen }) => {
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Usuário';
  const userInitials = userName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'expenses', label: 'Despesas', icon: Receipt },
    { id: 'calendar', label: 'Calendário', icon: Bell },
    { id: 'new-entry', label: 'Nova Despesa', icon: PlusCircle },
    { id: 'reports', label: 'Relatórios', icon: BarChart3 },
    { id: 'settings', label: 'Ajustes', icon: Settings },
  ];

  return (
    <aside className={`sidebar glass${isOpen ? ' open' : ''}`}>
      <div className="sidebar-header">
        <div className="logo-container">
          <img src={logoImg} alt="CasaFlow Logo" className="logo-img" />
        </div>
      </div>

      <nav className="sidebar-nav">
        {menuItems.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => setActiveTab(item.id)}
          >
            <item.icon size={20} />
            <span>{item.label}</span>
            {activeTab === item.id && <div className="active-indicator" />}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button className="export-btn" onClick={onExport}>
          Exportar Relatório
        </button>

        <div className="user-profile">
          <div className="user-avatar">{userInitials}</div>
          <div className="user-info">
            <p>{userName}</p>
            <span>Conta Ativa</span>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
