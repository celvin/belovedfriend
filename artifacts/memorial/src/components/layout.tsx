import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useListMyTenants, useGetTenant } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { PLATFORM_SEGMENTS } from "@/lib/tenant";

function useCurrentSlug(): string | undefined {
  const [location] = useLocation();
  const firstSegment = location.split("/")[1] ?? "";
  if (PLATFORM_SEGMENTS.has(firstSegment)) return undefined;
  return firstSegment || undefined;
}

// "#rrggbb" → the "H S% L%" triplet our CSS variables expect (they wrap it in hsl()).
function hexToHslTriplet(hex: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

// Build the owner's chosen theme (accent colour + font) as CSS-variable overrides
// applied to the whole tenant subtree.
function buildThemeStyle(theme?: Record<string, unknown>): React.CSSProperties | undefined {
  if (!theme) return undefined;
  const style: Record<string, string> = {};
  if (typeof theme.accent === "string") {
    const triplet = hexToHslTriplet(theme.accent);
    if (triplet) style["--primary"] = triplet;
  }
  if (theme.font === "sans") style["--app-font-serif"] = "var(--app-font-sans)";
  else if (theme.font === "handwritten") style["--app-font-serif"] = "var(--app-font-handwriting)";
  return Object.keys(style).length ? (style as React.CSSProperties) : undefined;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAdmin, logout, isLoggingOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [, navigate] = useLocation();

  const slug = useCurrentSlug();
  const isPlatform = slug === undefined;

  // Fetch tenant name when on a tenant route.
  // useGetTenant has enabled: !!(slug) built-in; passing "" keeps it disabled.
  const { data: tenant } = useGetTenant(slug ?? "");

  // Ownership detection: check if this slug is in my tenants list.
  // Disable the query when not authenticated by overriding enabled via the query option.
  const { data: myTenants } = useListMyTenants(
    isAuthenticated && !!slug ? undefined : { query: { enabled: false, queryKey: ["/api/tenants/mine"] } },
  );
  const isOwner = isAdmin || (myTenants ?? []).some((t) => t.slug === slug);

  function go(path: string) {
    setMenuOpen(false);
    navigate(path);
  }

  const brandName = isPlatform
    ? "belovedfriend.org"
    : (tenant?.friendName ?? slug ?? "…");

  const brandHref = isPlatform ? "/" : `/${slug}`;

  const heroConfig = (tenant?.pageConfig as Record<string, unknown> | undefined)?.hero as Record<string, unknown> | undefined;
  const heroPhotoPath = heroConfig?.heroPhotoPath as string | undefined;
  const themeConfig = (tenant?.pageConfig as Record<string, unknown> | undefined)?.theme as Record<string, unknown> | undefined;
  const themeStyle = isPlatform ? undefined : buildThemeStyle(themeConfig);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground font-sans" style={themeStyle}>
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link
            href={brandHref}
            className="flex items-center gap-2 text-foreground/90 hover:text-foreground transition-colors"
            onClick={() => setMenuOpen(false)}
          >
            {heroPhotoPath && (
              <img
                src={`/api${heroPhotoPath}`}
                alt=""
                className="w-8 h-8 rounded-full object-cover flex-shrink-0"
              />
            )}
            <span className="font-serif italic text-xl tracking-wide">{brandName}</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6">
            {isPlatform ? (
              // Platform nav
              <>
                <Link href="/create" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                  Create a page
                </Link>
                {isAuthenticated ? (
                  <div className="flex items-center gap-4">
                    <Link href="/dashboard" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                      Dashboard
                    </Link>
                    <Button variant="ghost" size="sm" onClick={logout} disabled={isLoggingOut} className="text-muted-foreground">
                      Sign Out
                    </Button>
                  </div>
                ) : (
                  <Link href="/sign-in" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                    Sign In
                  </Link>
                )}
              </>
            ) : (
              // Tenant nav
              <>
                <Link href={`/${slug}`} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                  Home
                </Link>
                <Link href={`/${slug}/wall`} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                  Tributes
                </Link>
                <Link href={`/${slug}/map`} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                  Reach
                </Link>
                {isAuthenticated ? (
                  <div className="flex items-center gap-4">
                    {isOwner && (
                      <Link href={`/${slug}/manage`} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                        Manage
                      </Link>
                    )}
                    <Link
                      href={`/${slug}/compose`}
                      className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                      Leave a Tribute
                    </Link>
                    <Button variant="ghost" size="sm" onClick={logout} disabled={isLoggingOut} className="text-muted-foreground">
                      Sign Out
                    </Button>
                  </div>
                ) : (
                  <Link
                    href={`/sign-in?slug=${slug}&intent=compose`}
                    className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Sign In
                  </Link>
                )}
              </>
            )}
          </nav>

          {/* Mobile toggle */}
          <button
            type="button"
            className="md:hidden p-2 -mr-2 text-foreground/80 hover:text-foreground"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Mobile slide-down panel */}
        {menuOpen && (
          <div className="md:hidden border-t border-border/40 bg-background/95 backdrop-blur-md">
            <nav className="container mx-auto px-4 py-4 flex flex-col gap-1 text-base">
              {isPlatform ? (
                // Platform mobile nav
                <>
                  <button
                    type="button"
                    onClick={() => go("/create")}
                    className="py-3 text-left text-foreground/80 hover:text-foreground"
                  >
                    Create a page
                  </button>
                  {isAuthenticated ? (
                    <>
                      <button
                        type="button"
                        onClick={() => go("/dashboard")}
                        className="py-3 text-left text-foreground/80 hover:text-foreground"
                      >
                        Dashboard
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          logout();
                        }}
                        disabled={isLoggingOut}
                        className="py-3 text-left text-muted-foreground hover:text-foreground"
                      >
                        Sign Out
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => go("/sign-in")}
                      className="py-3 text-left text-foreground/80 hover:text-foreground"
                    >
                      Sign In
                    </button>
                  )}
                </>
              ) : (
                // Tenant mobile nav
                <>
                  <button
                    type="button"
                    onClick={() => go(`/${slug}`)}
                    className="py-3 text-left text-foreground/80 hover:text-foreground"
                  >
                    Home
                  </button>
                  <button
                    type="button"
                    onClick={() => go(`/${slug}/wall`)}
                    className="py-3 text-left text-foreground/80 hover:text-foreground"
                  >
                    Tributes
                  </button>
                  <button
                    type="button"
                    onClick={() => go(`/${slug}/map`)}
                    className="py-3 text-left text-foreground/80 hover:text-foreground"
                  >
                    Reach
                  </button>
                  {isAuthenticated ? (
                    <>
                      {isOwner && (
                        <button
                          type="button"
                          onClick={() => go(`/${slug}/manage`)}
                          className="py-3 text-left text-foreground/80 hover:text-foreground"
                        >
                          Manage
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => go(`/${slug}/compose`)}
                        className="py-3 text-left font-medium text-primary hover:text-primary/80"
                      >
                        Leave a Tribute
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          logout();
                        }}
                        disabled={isLoggingOut}
                        className="py-3 text-left text-muted-foreground hover:text-foreground"
                      >
                        Sign Out
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => go(`/sign-in?slug=${slug}&intent=compose`)}
                      className="py-3 text-left text-foreground/80 hover:text-foreground"
                    >
                      Sign In
                    </button>
                  )}
                </>
              )}
            </nav>
          </div>
        )}
      </header>
      <main className="flex-1 flex flex-col">
        {children}
      </main>
      <footer className="py-8 border-t border-border/40 mt-auto">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground font-serif italic">
            In loving memory.
          </p>
        </div>
      </footer>
    </div>
  );
}
