import React, { useState } from 'react';
import Sidebar from './Sidebar';
import { LayoutDashboard, Receipt, PlusCircle, BarChart3, Bell } from 'lucide-react';
import './Layout.css';

const mobileMenuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'expenses', label: 'Despesas', icon: Receipt },
  { id: 'new-entry', label: 'Novo', icon: PlusCircle },
  { id: 'calendar', label: 'Calendário', icon: Bell },
  { id: 'reports', label: 'Relatórios', icon: BarChart3 },
];

const Layout = ({ children, activeTab, setActiveTab, onExport, user }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Usuário';
  const userInitials = userName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  const handleNavClick = (tab) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  };

  return (
    <div className="layout">
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <Sidebar activeTab={activeTab} setActiveTab={handleNavClick} onExport={onExport} user={user} isOpen={sidebarOpen} />
      <main className="main-content">
        <header className="top-bar glass">
          <button className="hamburger-btn" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Menu">
            <span />
            <span />
            <span />
          </button>
          <div className="search-bar">
            <input type="text" placeholder="Buscar despesas..." />
          </div>
          <div className="top-actions">
            <div className="profile-pill glass">
              <span className="profile-name">{userName}</span>
              <div className="topbar-avatar">{userInitials}</div>
            </div>
          </div>
        </header>
        <div className="content-area animate-in">
          {children}
        </div>
      </main>
      <nav className="mobile-bottom-nav glass">
        {mobileMenuItems.map((item) => (
          <button
            key={item.id}
            className={`mobile-nav-item ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => handleNavClick(item.id)}
          >
            <item.icon size={22} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

export default Layout;
