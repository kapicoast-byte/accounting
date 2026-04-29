import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';

export default function AppLayout() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <Navbar />
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '28px' }}>
        <Outlet />
      </main>
    </div>
  );
}
