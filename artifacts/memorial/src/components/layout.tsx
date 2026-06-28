import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export function Layout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isAdmin, logout, isLoggingOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [, navigate] = useLocation();

  function go(path: string) {
    setMenuOpen(false);
    navigate(path);
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground font-sans">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link
            href="/"
            className="font-serif italic text-xl tracking-wide text-foreground/90 hover:text-foreground transition-colors"
            onClick={() => setMenuOpen(false)}
          >
            Luis Ventura
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-6">
            <a
              href="/#reach"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              His Reach
            </a>
            <Link href="/wall" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Tributes
            </Link>
            {isAuthenticated ? (
              <div className="flex items-center gap-4">
                {isAdmin && (
                  <Link
                    href="/admin"
                    className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Manage
                  </Link>
                )}
                <Link href="/compose" className="text-sm font-medium text-primary hover:text-primary/80 transition-colors">
                  Leave a Tribute
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
              <a
                href="/#reach"
                onClick={() => setMenuOpen(false)}
                className="py-3 text-foreground/80 hover:text-foreground"
              >
                His Reach
              </a>
              <button
                type="button"
                onClick={() => go("/wall")}
                className="py-3 text-left text-foreground/80 hover:text-foreground"
              >
                Tributes
              </button>
              {isAuthenticated ? (
                <>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => go("/admin")}
                      className="py-3 text-left text-foreground/80 hover:text-foreground"
                    >
                      Manage
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => go("/compose")}
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
                  onClick={() => go("/sign-in")}
                  className="py-3 text-left text-foreground/80 hover:text-foreground"
                >
                  Sign In
                </button>
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
