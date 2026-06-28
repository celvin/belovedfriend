import { Link } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useListTenants } from "@workspace/api-client-react";

export default function Landing() {
  const { data: tenants, isLoading } = useListTenants();

  return (
    <div className="flex-1 flex flex-col">
      {/* Hero */}
      <section className="flex flex-col items-center justify-center px-6 py-24 text-center bg-gradient-to-b from-muted/40 to-background">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-2xl"
        >
          <h1 className="text-5xl md:text-6xl font-serif mb-6 leading-tight">
            A place to remember<br />those we love.
          </h1>
          <p className="text-xl text-muted-foreground font-serif italic mb-10 leading-relaxed">
            Create a beautiful tribute page for a beloved friend — gather stories,
            memories, and heartfelt messages from everyone who cared for them.
          </p>
          <Link href="/create">
            <Button size="lg" className="font-serif text-lg rounded-full px-10 py-6 shadow-md">
              Create a tribute page
            </Button>
          </Link>
        </motion.div>
      </section>

      {/* Directory */}
      <section className="max-w-5xl mx-auto w-full px-6 py-16">
        <h2 className="text-2xl font-serif text-center mb-10 text-muted-foreground">
          Tribute pages
        </h2>

        {isLoading && (
          <div className="text-center font-serif italic text-muted-foreground animate-pulse">
            Loading…
          </div>
        )}

        {!isLoading && (!tenants || tenants.length === 0) && (
          <div className="text-center font-serif italic text-muted-foreground py-12">
            No tribute pages yet.{" "}
            <Link href="/create" className="underline underline-offset-4 hover:text-foreground transition-colors">
              Be the first to create one.
            </Link>
          </div>
        )}

        {tenants && tenants.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {tenants.map((tenant) => (
              <Link key={tenant.id} href={`/${tenant.slug}`}>
                <div className="group bg-card border border-border/40 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-border/70 transition-all cursor-pointer">
                  <h3 className="text-xl font-serif mb-1 group-hover:text-primary transition-colors">
                    {tenant.friendName}
                  </h3>
                  {tenant.tagline && (
                    <p className="text-sm text-muted-foreground font-serif italic line-clamp-2">
                      {tenant.tagline}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground/60 mt-3 font-mono">
                    /{tenant.slug}
                  </p>
                </div>
              </Link>
            ))}
          </motion.div>
        )}
      </section>
    </div>
  );
}
