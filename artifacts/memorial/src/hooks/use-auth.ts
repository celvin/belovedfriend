import { useGetCurrentUser, useLogout, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useLocation } from "wouter";

export function useAuth() {
  const { data: currentUser, isLoading } = useGetCurrentUser();
  const logoutMutation = useLogout();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const logout = useCallback(() => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        // Flip auth state immediately so the UI updates, then refetch to confirm.
        queryClient.setQueryData(getGetCurrentUserQueryKey(), { authenticated: false });
        queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
        setLocation("/");
      },
    });
  }, [logoutMutation, queryClient, setLocation]);

  return {
    user: currentUser?.user,
    isAuthenticated: currentUser?.authenticated ?? false,
    isAdmin: currentUser?.user?.role === "admin",
    isLoading,
    logout,
    isLoggingOut: logoutMutation.isPending,
  };
}
