import { useParams } from "wouter";

export const PLATFORM_SEGMENTS = new Set(["", "sign-in", "create", "dashboard"]);

export function useTenantSlug(): string | undefined {
  const p = useParams();
  return (p as Record<string, string>).slug;
}
