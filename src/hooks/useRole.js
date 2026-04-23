import { useApp } from '../context/AppContext';
import { ROLES } from '../services/memberService';

export function useRole() {
  const { userRole, roleLoading } = useApp();

  const isAdmin   = userRole === ROLES.ADMIN;
  const isManager = userRole === ROLES.ADMIN || userRole === ROLES.MANAGER;
  const isStaff   = userRole !== null; // any member has at least staff access

  return {
    role: userRole,
    roleLoading,
    isAdmin,
    isManager,
    isStaff,
    canEdit:          isManager,  // admin + manager
    canDelete:        isAdmin,    // admin only
    canManageMembers: isAdmin,    // admin only
    canCreateCompany: isAdmin,    // admin only (for subsidiaries; first company is always allowed)
    canCreateSale:    isStaff,    // all roles
  };
}
