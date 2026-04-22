import { Navigate, Outlet } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import LoadingSpinner from './LoadingSpinner';

export default function CompanyRequiredRoute() {
  const { companies, companiesLoading } = useApp();

  if (companiesLoading) {
    return <LoadingSpinner fullScreen />;
  }

  if (companies.length === 0) {
    return <Navigate to="/create-company" replace />;
  }

  return <Outlet />;
}
