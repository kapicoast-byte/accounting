import { useApp } from '../context/AppContext';

export function useAuth() {
  const { user, profile, authLoading } = useApp();
  return {
    user,
    profile,
    authLoading,
    isAuthenticated: !!user,
  };
}
