import { useEffect } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ReachNetwork } from "@/components/reach-network";
import { useTenantSlug } from "@/lib/tenant";
import { useGetTenant } from "@workspace/api-client-react";

export default function Home() {
  const slug = useTenantSlug();
  const { data: tenant, isLoading, error } = useGetTenant(slug ?? "", {
    query: { enabled: !!slug, queryKey: [`/api/tenants/${slug}`] },
  });

  useEffect(() => {
    if (window.location.hash === "#reach") {
      requestAnimationFrame(() => {
        document.getElementById("reach")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, []);

  // 404 state
  if (!isLoading && (error || !tenant) && slug) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-6">
        <h1 className="text-4xl font-serif">Page not found</h1>
        <p className="text-muted-foreground font-serif italic">
          We couldn't find a tribute page at <span className="font-mono text-sm">/{slug}</span>.
        </p>
        <Link href="/">
          <Button variant="outline" className="font-serif rounded-full px-8">
            Go to belovedfriend.org
          </Button>
        </Link>
      </div>
    );
  }

  // Loading skeleton
  if (isLoading || !tenant) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="font-serif italic text-muted-foreground animate-pulse">Loading…</div>
      </div>
    );
  }

  const config = tenant.pageConfig as Record<string, unknown>;
  const heroConfig = (config.hero ?? {}) as Record<string, unknown>;
  const heroPhotoPath = heroConfig.heroPhotoPath as string | undefined;
  const ctaConfig = (config.cta ?? {}) as Record<string, unknown>;
  const sectionsConfig = (config.sections ?? {}) as Record<string, unknown>;
  const storyConfig = (config.story ?? {}) as Record<string, unknown>;

  const showDates = heroConfig.showDates !== false;
  const tributeLabel = (ctaConfig.tributeLabel as string | undefined) ?? "Leave a Tribute";
  const wallLabel = (ctaConfig.wallLabel as string | undefined) ?? "Read Tributes";
  const reachLabel = (ctaConfig.reachLabel as string | undefined) ?? "Explore Their Reach";

  const sectionOrder = (sectionsConfig.order as string[] | undefined) ?? ["story", "reach"];
  const storyBlocks = (storyConfig.blocks as Array<{ heading?: string; body: string }> | undefined) ?? [];

  const friendName = tenant.friendName;
  const tagline = tenant.tagline ?? "";
  const yearRange =
    showDates && (tenant.birthYear || tenant.deathYear)
      ? [tenant.birthYear, tenant.deathYear].filter(Boolean).join(" — ")
      : null;

  return (
    <div className="flex flex-col w-full pb-12 md:pb-24">
      {/* Hero Section */}
      <section className="min-h-[70vh] md:min-h-[85vh] flex flex-col justify-center items-center px-4 py-12 md:py-20 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-background to-background pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="max-w-4xl mx-auto z-10 space-y-6 md:space-y-8"
        >
          {heroPhotoPath && (
            <div className="flex justify-center">
              <img
                src={`/api${heroPhotoPath}`}
                alt={friendName}
                className="w-40 h-40 md:w-56 md:h-56 rounded-full object-cover shadow-xl ring-4 ring-primary/10"
              />
            </div>
          )}

          <div className="space-y-3 md:space-y-4">
            <h1 className="text-5xl sm:text-6xl md:text-8xl font-serif tracking-tight text-foreground">
              {friendName}
            </h1>
            {yearRange && (
              <p className="text-lg md:text-2xl font-serif italic text-muted-foreground tracking-wide">
                {yearRange}
              </p>
            )}
          </div>

          {tagline && (
            <>
              <div className="w-16 h-px bg-primary/30 mx-auto my-6 md:my-12" />
              <p className="text-lg md:text-2xl font-serif text-foreground/80 leading-relaxed max-w-3xl mx-auto italic px-2">
                {tagline}
              </p>
            </>
          )}

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-6 pt-6 md:pt-12 px-2">
            <Link href={`/${slug}/compose`}>
              <Button size="lg" className="w-full sm:w-auto h-12 md:h-14 px-8 text-base md:text-lg font-serif bg-primary hover:bg-primary/90 text-primary-foreground rounded-full shadow-lg hover:shadow-xl transition-all duration-300">
                {tributeLabel}
              </Button>
            </Link>
            <Link href={`/${slug}/wall`}>
              <Button variant="ghost" size="lg" className="w-full sm:w-auto h-12 md:h-14 px-8 text-base md:text-lg font-serif text-foreground hover:bg-muted/50 rounded-full transition-all duration-300">
                {wallLabel}
              </Button>
            </Link>
            <a href="#reach">
              <Button variant="ghost" size="lg" className="w-full sm:w-auto h-12 md:h-14 px-8 text-base md:text-lg font-serif text-foreground hover:bg-muted/50 rounded-full transition-all duration-300">
                {reachLabel}
              </Button>
            </a>
          </div>
        </motion.div>
      </section>

      {/* Dynamic Sections */}
      {sectionOrder.map((section) => {
        if (section === "story" && storyBlocks.length > 0) {
          return (
            <section key="story" className="py-12 md:py-24 px-4">
              <div className="container mx-auto max-w-3xl space-y-12">
                {storyBlocks.map((block, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="space-y-4"
                  >
                    {block.heading && (
                      <h2 className="text-2xl md:text-3xl font-serif text-foreground">
                        {block.heading}
                      </h2>
                    )}
                    <p className="text-base md:text-lg font-serif text-muted-foreground leading-relaxed">
                      {block.body}
                    </p>
                  </motion.div>
                ))}
              </div>
            </section>
          );
        }

        if (section === "wall") {
          return (
            <section key="wall" className="py-12 md:py-16 px-4 text-center bg-muted/20 border-y border-border/20">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="max-w-2xl mx-auto space-y-6"
              >
                <h2 className="text-2xl md:text-4xl font-serif italic text-foreground">
                  Share your memories
                </h2>
                <p className="text-base md:text-lg text-muted-foreground font-serif">
                  Help us gather the stories, the quiet moments, and the legacy left behind.
                </p>
                <div className="pt-4">
                  <Link href={`/${slug}/wall`}>
                    <Button variant="outline" size="lg" className="h-12 md:h-14 px-8 md:px-10 text-base md:text-lg font-serif rounded-full border-primary/20 hover:border-primary/50 transition-all">
                      Enter the Tribute Wall
                    </Button>
                  </Link>
                </div>
              </motion.div>
            </section>
          );
        }

        if (section === "reach") {
          return (
            <section key="reach" id="reach" className="scroll-mt-20 py-12 md:py-24 px-4 bg-muted/30 border-y border-border/30">
              <div className="container mx-auto max-w-6xl">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  className="text-center mb-8 md:mb-12 space-y-3 md:space-y-4"
                >
                  <div className="text-xs tracking-[0.3em] uppercase text-primary/80 font-medium">
                    The Reach of Their Work
                  </div>
                  <h2 className="text-3xl sm:text-4xl md:text-6xl font-serif text-foreground leading-tight">
                    A quiet thread<br className="hidden md:block" /> through countless lives
                  </h2>
                </motion.div>

                <ReachNetwork slug={slug ?? ""} />

                <div className="text-center pt-8 md:pt-12">
                  <Link href={`/${slug}/compose`}>
                    <Button
                      size="lg"
                      className="h-12 px-8 text-base font-serif bg-primary hover:bg-primary/90 text-primary-foreground rounded-full"
                    >
                      Add your voice to the map
                    </Button>
                  </Link>
                </div>
              </div>
            </section>
          );
        }

        return null;
      })}

      {/* Final CTA (shown when wall section not in order) */}
      {!sectionOrder.includes("wall") && (
        <section className="py-16 md:py-32 px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-2xl mx-auto space-y-6 md:space-y-8"
          >
            <h2 className="text-2xl md:text-4xl font-serif italic text-foreground">
              Share your memories
            </h2>
            <p className="text-base md:text-lg text-muted-foreground font-serif">
              Help us gather the stories, the quiet moments, and the legacy left behind.
            </p>
            <div className="pt-4 md:pt-8">
              <Link href={`/${slug}/wall`}>
                <Button variant="outline" size="lg" className="h-12 md:h-14 px-8 md:px-10 text-base md:text-lg font-serif rounded-full border-primary/20 hover:border-primary/50 transition-all">
                  Enter the Tribute Wall
                </Button>
              </Link>
            </div>
          </motion.div>
        </section>
      )}
    </div>
  );
}
