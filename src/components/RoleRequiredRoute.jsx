import { Outlet } from 'react-router-dom';
import { useRole } from '../hooks/useRole';
import LoadingSpinner from './LoadingSpinner';
import AccessDenied from './AccessDenied';

/**
 * Protects a group of routes by required permission level.
 * Shows LoadingSpinner while role is resolving, AccessDenied if insufficient.
 */
export default function RoleRequiredRoute({ permission = 'admin', message }) {
  const role = useRole();

  if (role.roleLoading) return <LoadingSpinner fullScreen />;

  const allowed =
    permission === 'admin'         ? role.isAdmin :
    permission === 'manageMembers' ? role.canManageMembers :
    permission === 'edit'          ? role.canEdit :
    false;

  return allowed
    ? <Outlet />
    : <AccessDenied message={message ?? "You need admin access to view this page."} />;
}
