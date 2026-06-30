import { Link } from "wouter";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { useListMyTenants, getListMyTenantsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/language-provider";

export default function Dashboard() {
  const { t } = useT();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const { data: myTenants, isLoading: tenantsLoading } = useListMyTenants({
    query: { enabled: isAuthenticated, queryKey: getListMyTenantsQueryKey() },
  });

  if (authLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="font-serif italic text-muted-foreground animate-pulse">{t("landing.loading")}</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-6">
        <h1 className="text-3xl font-serif">{t("dashboard.headingUnauthenticated")}</h1>
        <p className="text-muted-foreground font-serif italic max-w-md">
          {t("dashboard.signInPrompt")}
        </p>
        <Link href="/sign-in">
          <Button className="font-serif rounded-full px-8">{t("nav.signIn")}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-6 py-12">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-serif">{t("dashboard.heading")}</h1>
            {user?.email && (
              <p className="text-sm text-muted-foreground mt-1">{user.email}</p>
            )}
          </div>
          <Link href="/create">
            <Button className="font-serif rounded-full px-6">
              {t("nav.createPage")}
            </Button>
          </Link>
        </div>

        {tenantsLoading && (
          <div className="font-serif italic text-muted-foreground animate-pulse py-12 text-center">
            {t("landing.loading")}
          </div>
        )}

        {!tenantsLoading && (!myTenants || myTenants.length === 0) && (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-6 bg-muted/30 rounded-2xl border border-dashed border-border">
            <p className="text-xl font-serif text-muted-foreground italic">
              {t("dashboard.emptyState")}
            </p>
            <Link href="/create">
              <Button size="lg" className="font-serif rounded-full px-10">
                {t("dashboard.createFirstButton")}
              </Button>
            </Link>
          </div>
        )}

        {myTenants && myTenants.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {myTenants.map((tenant) => (
              <motion.div
                key={tenant.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card border border-border/40 rounded-2xl p-6 shadow-sm flex flex-col gap-4"
              >
                <div>
                  <h2 className="text-xl font-serif">{tenant.friendName}</h2>
                  {tenant.tagline && (
                    <p className="text-sm text-muted-foreground font-serif italic mt-1 line-clamp-2">
                      {tenant.tagline}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground/60 mt-2 font-mono">/{tenant.slug}</p>
                </div>
                <div className="flex gap-3 mt-auto">
                  <Link href={`/${tenant.slug}`} className="flex-1">
                    <Button variant="outline" className="w-full font-serif rounded-xl">
                      {t("dashboard.viewPage")}
                    </Button>
                  </Link>
                  <Link href={`/${tenant.slug}/manage`} className="flex-1">
                    <Button variant="default" className="w-full font-serif rounded-xl">
                      {t("nav.manage")}
                    </Button>
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
