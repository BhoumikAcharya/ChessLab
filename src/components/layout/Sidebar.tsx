import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Library, Eye, Settings, Cpu } from 'lucide-react';

export const Sidebar: React.FC = () => {
  return (
    <aside className="app-sidebar">
      <div>
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <Cpu size={18} color="#111418" />
          </div>
          <span style={{ fontWeight: 700, letterSpacing: '-0.02em', fontSize: '1.125rem' }}>
            Chess<span style={{ color: 'var(--cl-accent)' }}>Lab</span>
          </span>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-label">Navigation</div>
          <nav className="sidebar-nav">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `sidebar-nav-item ${isActive ? 'active' : ''}`
              }
              end
            >
              <LayoutDashboard size={18} />
              <span>Dashboard</span>
            </NavLink>

            <NavLink
              to="/library"
              className={({ isActive }) =>
                `sidebar-nav-item ${isActive ? 'active' : ''}`
              }
            >
              <Library size={18} />
              <span>Game Library</span>
            </NavLink>

            <NavLink
              to="/review"
              className={({ isActive }) =>
                `sidebar-nav-item ${isActive ? 'active' : ''}`
              }
            >
              <Eye size={18} />
              <span>Game Review</span>
            </NavLink>

            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `sidebar-nav-item ${isActive ? 'active' : ''}`
              }
            >
              <Settings size={18} />
              <span>Settings</span>
            </NavLink>
          </nav>
        </div>
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-footer-text">
          <span className="sidebar-footer-dot" />
          <span>Stockfish 16 WASM</span>
        </div>
      </div>
    </aside>
  );
};
