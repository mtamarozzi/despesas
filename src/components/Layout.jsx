import React from 'react';
import Sidebar from './Sidebar';
import './Layout.css';

const Layout = ({ children, activeTab, setActiveTab, onExport, user }) => {
  return (
    <div className="layout">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} onExport={onExport} user={user} />
      <main className="main-content">
        <header className="top-bar glass">
          <div className="search-bar">
            <input type="text" placeholder="Search report data..." />
          </div>
          <div className="top-actions">
            <button className="top-btn"><i className="lucide-bell"></i></button>
            <button className="top-btn"><i className="lucide-settings"></i></button>
            <div className="profile-pill glass">
              <span>Reports Panel</span>
              <img src="https://ui-avatars.com/api/?name=Alex+Rivera&background=9D59FF&color=fff" alt="User" />
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
