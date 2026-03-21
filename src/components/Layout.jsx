import React from 'react';
import Sidebar from './Sidebar';
import './Layout.css';

const Layout = ({ children, activeTab, setActiveTab, onExport, user }) => {
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Usuário';
  const userInitials = userName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="layout">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} onExport={onExport} user={user} />
      <main className="main-content">
        <header className="top-bar glass">
          <div className="search-bar">
            <input type="text" placeholder="Buscar despesas..." />
          </div>
          <div className="top-actions">
            <div className="profile-pill glass">
              <span>{userName}</span>
              <div className="topbar-avatar">{userInitials}</div>
            </div>
          </div>
        </header>
        <div className="content-area animate-in">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
