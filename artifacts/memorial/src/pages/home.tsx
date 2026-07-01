import { useEffect } from "react";
import { motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ReachNetwork } from "@/components/reach-network";
import { useTenantSlug } from "@/lib/tenant";
import { Linkify } from "@/lib/linkify";
import { useGetTenant } from "@workspace/api-client-react";
import { useT } from "@/components/language-provider";

export default function Home() {
  const { t } = useT();
  const slug = useTenantSlug();
  const [, setLocation] = useLocation();
  const { data: tenant, isLoading, error } = useGetTenant(slug ?? "", {
    query: { enabled: !!slug, queryKey: [`/api/tenants/${slug}`] },
  });

  // Kiosk auto-launch: if the owner enabled it, opening the page starts the
  // theater. Skipped once the viewer has exited the theater this session
  // (a sessionStorage flag set on exit) so it doesn't trap them in a loop.
  useEffect(() => {
    if (!tenant || !slug) return;
    const autoplay = ((tenant.pageConfig as Record<string, unknown> | undefined)?.presentation as { autoplay?: boolean } | undefined)?.autoplay === true;
    if (!autoplay) return;
    if (sessionStorage.getItem(`lv-skip-present-${slug}`) === "1") return;
    setLocation(`/${slug}/present`);
  }, [tenant, slug, setLocation]);

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
        <h1 className="text-4xl font-serif">{t("home.notFoundHeading")}</h1>
        <p className="text-muted-foreground font-serif italic">
          {t("home.notFoundBody", { slug })}
        </p>
        <Link href="/">
          <Button variant="outline" className="font-serif rounded-full px-8">
            {t("home.goToBrand")}
          </Button>
        </Link>
      </div>
    );
  }

  // Loading skeleton
  if (isLoading || !tenant) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="font-serif italic text-muted-foreground animate-pulse">{t("home.loading")}</div>
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
  // A CTA label counts as "customized" only if it's non-blank AND not a shipped
  // English default. Blank or default-equal values fall through to the translated
  // label, so ES/FR visitors never see English defaults that leaked into pageConfig
  // (e.g. tenants that saved page settings before this was fixed). The editor saves
  // `primaryLabel`; keep a fallback to the legacy `tributeLabel`.
  const DEFAULT_CTA_LABELS = new Set(["leave a tribute", "read tributes", "explore their reach"]);
  const customCtaLabel = (v: unknown): string | undefined => {
    const s = typeof v === "string" ? v.trim() : "";
    return s && !DEFAULT_CTA_LABELS.has(s.toLowerCase()) ? s : undefined;
  };
  const tributeLabel =
    customCtaLabel(ctaConfig.primaryLabel) ??
    customCtaLabel(ctaConfig.tributeLabel) ??
    t("nav.leaveTribute");
  const wallLabel = customCtaLabel(ctaConfig.wallLabel) ?? t("home.wallLabel");
  const reachLabel = customCtaLabel(ctaConfig.reachLabel) ?? t("home.reachLabel");

  const sectionOrder = (sectionsConfig.order as string[] | undefined) ?? ["story", "wall", "reach"];
  // Per-section visibility toggles (default visible unless explicitly false).
  const showStory = sectionsConfig.story !== false && storyConfig.enabled !== false;
  const showWall = sectionsConfig.wall !== false;
  const showReach = sectionsConfig.reach !== false;
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

          <div className="pt-5 md:pt-8">
            <Link
              href={`/${slug}/present`}
              className="inline-flex items-center gap-1.5 text-sm font-serif text-muted-foreground hover:text-primary transition-colors"
            >
              {t("home.playTribute")}
            </Link>
          </div>
        </motion.div>
      </section>

      {/* Dynamic Sections */}
      {sectionOrder.map((section) => {
        if (section === "story" && showStory && storyBlocks.length > 0) {
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
                    <p className="text-base md:text-lg font-serif text-muted-foreground leading-relaxed whitespace-pre-wrap">
                      <Linkify text={block.body} />
                    </p>
                  </motion.div>
                ))}
              </div>
            </section>
          );
        }

        if (section === "wall" && showWall) {
          return (
            <section key="wall" className="py-12 md:py-16 px-4 text-center bg-muted/20 border-y border-border/20">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="max-w-2xl mx-auto space-y-6"
              >
                <h2 className="text-2xl md:text-4xl font-serif italic text-foreground">
                  {t("home.wallHeading")}
                </h2>
                <p className="text-base md:text-lg text-muted-foreground font-serif">
                  {t("home.wallSubcopy")}
                </p>
                <div className="pt-4">
                  <Link href={`/${slug}/wall`}>
                    <Button variant="outline" size="lg" className="h-12 md:h-14 px-8 md:px-10 text-base md:text-lg font-serif rounded-full border-primary/20 hover:border-primary/50 transition-all">
                      {t("home.enterTributeWall")}
                    </Button>
                  </Link>
                </div>
              </motion.div>
            </section>
          );
        }

        if (section === "reach" && showReach) {
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
                    {t("home.reachEyebrow")}
                  </div>
                  <h2 className="text-3xl sm:text-4xl md:text-6xl font-serif text-foreground leading-tight">
                    {t("home.reachHeading")}
                  </h2>
                </motion.div>

                <ReachNetwork slug={slug ?? ""} />

                <div className="text-center pt-8 md:pt-12">
                  <Link href={`/${slug}/compose`}>
                    <Button
                      size="lg"
                      className="h-12 px-8 text-base font-serif bg-primary hover:bg-primary/90 text-primary-foreground rounded-full"
                    >
                      {t("home.addVoiceToMap")}
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
              {t("home.wallHeading")}
            </h2>
            <p className="text-base md:text-lg text-muted-foreground font-serif">
              {t("home.wallSubcopy")}
            </p>
            <div className="pt-4 md:pt-8">
              <Link href={`/${slug}/wall`}>
                <Button variant="outline" size="lg" className="h-12 md:h-14 px-8 md:px-10 text-base md:text-lg font-serif rounded-full border-primary/20 hover:border-primary/50 transition-all">
                  {t("home.enterTributeWall")}
                </Button>
              </Link>
            </div>
          </motion.div>
        </section>
      )}
    </div>
  );
}
