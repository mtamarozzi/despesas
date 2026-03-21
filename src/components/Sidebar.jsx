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
import './Sidebar.css';

const Sidebar = ({ activeTab, setActiveTab }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'expenses', label: 'Expenses', icon: Receipt },
    { id: 'calendar', label: 'Calendar', icon: Bell },
    { id: 'new-entry', label: 'New Entry', icon: PlusCircle },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
  ];

  return (
    <aside className="sidebar glass">
      <div className="sidebar-header">
        <div className="logo-container">
          <div className="logo-icon glow"></div>
          <div>
            <h1>Ethereal Ledger</h1>
            <span>RESIDENTIAL CONTROL</span>
          </div>
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
        <button className="export-btn">
          Export Report
        </button>
        
        <div className="user-profile">
          <img src="https://ui-avatars.com/api/?name=Alex+Rivera&background=9D59FF&color=fff" alt="User" />
          <div className="user-info">
            <p>Alex Rivera</p>
            <span>Premium Plan</span>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
