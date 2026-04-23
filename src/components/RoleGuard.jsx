import { useRole } from '../hooks/useRole';

/**
 * Renders children only when the user satisfies the required permission.
 * Falls back to `fallback` (default null — renders nothing) otherwise.
 *
 * permission values:
 *   'view'          — any authenticated member
 *   'edit'          — admin or manager
 *   'delete'        — admin only
 *   'admin'         — admin only
 *   'manageMembers' — admin only
 */
export default function RoleGuard({ permission = 'view', children, fallback = null }) {
  const role = useRole();

  if (role.roleLoading) return null;

  const allowed =
    permission === 'view'          ? role.isStaff :
    permission === 'edit'          ? role.canEdit :
    permission === 'delete'        ? role.canDelete :
    permission === 'admin'         ? role.isAdmin :
    permission === 'manageMembers' ? role.canManageMembers :
    false;

  return allowed ? children : fallback;
}
