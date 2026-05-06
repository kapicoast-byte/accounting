import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

const STORAGE_KEY = 'sidebar_collapsed';

export default function AppLayout() {
  const [collapsed,   setCollapsed]   = useState(() => localStorage.getItem(STORAGE_KEY) === 'true');
  const [mobileOpen,  setMobileOpen]  = useState(false);

  function toggleCollapse() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }

  // Close mobile sidebar on resize to desktop
  useEffect(() => {
    function onResize() {
      if (window.innerWidth >= 768) setMobileOpen(false);
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const sidebarW = collapsed ? 60 : 240;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 35,
            background: 'rgba(0,0,0,0.5)',
          }}
        />
      )}

      {/* Top bar + content area */}
      <div
        className="main-content"
        style={{
          marginLeft: sidebarW,
          transition: 'margin-left 0.2s ease',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <TopBar onMobileOpen={() => setMobileOpen(true)} />
        <main style={{
          flex: 1,
          padding: '24px',
          marginTop: 'var(--topbar-h)',
        }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
