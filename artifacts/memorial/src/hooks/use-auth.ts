import { useGetCurrentUser, useLogout } from "@workspace/api-client-react";
import { useCallback } from "react";
import { useLocation } from "wouter";

export function useAuth() {
  const { data: currentUser, isLoading } = useGetCurrentUser();
  const logoutMutation = useLogout();
  const [, setLocation] = useLocation();

  const logout = useCallback(() => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        setLocation("/");
      },
    });
  }, [logoutMutation, setLocation]);

  return {
    user: currentUser?.user,
    isAuthenticated: currentUser?.authenticated ?? false,
    isAdmin: currentUser?.user?.role === "admin",
    isLoading,
    logout,
    isLoggingOut: logoutMutation.isPending,
  };
}
