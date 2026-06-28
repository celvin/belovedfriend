import { Link } from "wouter";
import { motion, type Variants } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useListTenants } from "@workspace/api-client-react";
import { Heart, Share2, MapPin, ArrowRight } from "lucide-react";

const steps = [
  {
    icon: Heart,
    title: "Create a page",
    body: "Give their memory a home — a quiet, beautiful space that honours who they were.",
  },
  {
    icon: Share2,
    title: "Share the link",
    body: "Send it to family, friends, colleagues — anyone whose life they touched.",
  },
  {
    icon: MapPin,
    title: "Friends leave tributes & map pins",
    body: "Each message, story, and location builds a living portrait of their reach.",
  },
];

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.25, 0.1, 0.25, 1], delay: i * 0.12 },
  }),
};

export default function Landing() {
  const { data: tenants, isLoading } = useListTenants();

  return (
    <div className="flex-1 flex flex-col">
      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center px-6 py-28 md:py-36 text-center overflow-hidden">
        {/* Softened radial background */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_30%,_hsl(var(--primary)/0.10)_0%,_transparent_70%)] pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-b from-muted/30 via-transparent to-background pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className="relative z-10 max-w-2xl"
        >
          <p className="text-xs tracking-[0.28em] uppercase text-primary/70 font-medium mb-6">
            belovedfriend.org
          </p>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-serif leading-tight mb-6 text-foreground">
            A place to remember<br />those we love.
          </h1>

          <div className="w-14 h-px bg-primary/30 mx-auto my-6" />

          <p className="text-lg md:text-xl text-muted-foreground font-serif italic leading-relaxed mb-10">
            Create a beautiful tribute page for a beloved friend — gather stories,
            memories, and heartfelt messages from everyone who cared for them.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/create">
              <Button
                size="lg"
                className="font-serif text-base md:text-lg rounded-full px-10 py-6 shadow-md hover:shadow-lg transition-shadow duration-300"
              >
                Create a tribute page
              </Button>
            </Link>
            <a href="#how-it-works">
              <Button
                variant="ghost"
                size="lg"
                className="font-serif text-base md:text-lg rounded-full px-8 py-6 text-muted-foreground hover:text-foreground transition-colors"
              >
                How it works
              </Button>
            </a>
          </div>
        </motion.div>
      </section>

      {/* How it works */}
      <section
        id="how-it-works"
        className="scroll-mt-16 bg-muted/20 border-y border-border/20 py-20 md:py-24 px-6"
      >
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-14"
          >
            <h2 className="text-3xl md:text-4xl font-serif text-foreground mb-3">
              How it works
            </h2>
            <p className="text-muted-foreground font-serif italic">
              Three gentle steps, lasting forever.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-8">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <motion.div
                  key={step.title}
                  custom={i}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeUp}
                  className="flex flex-col items-center text-center gap-4"
                >
                  <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <Icon className="w-6 h-6 text-primary/80" strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="text-xs tracking-[0.2em] uppercase text-primary/60 font-medium mb-1">
                      Step {i + 1}
                    </p>
                    <h3 className="text-xl font-serif text-foreground mb-2">{step.title}</h3>
                    <p className="text-sm md:text-base text-muted-foreground font-serif italic leading-relaxed">
                      {step.body}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Directory */}
      <section className="max-w-5xl mx-auto w-full px-6 py-20">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-serif text-foreground mb-2">
            Tribute pages
          </h2>
          <p className="text-muted-foreground font-serif italic text-base">
            Each one a life remembered with care.
          </p>
        </motion.div>

        {isLoading && (
          <div className="text-center font-serif italic text-muted-foreground animate-pulse py-12">
            Loading…
          </div>
        )}

        {!isLoading && (!tenants || tenants.length === 0) && (
          <div className="text-center font-serif italic text-muted-foreground py-16 space-y-3">
            <p className="text-lg">No tribute pages yet.</p>
            <Link
              href="/create"
              className="underline underline-offset-4 hover:text-foreground transition-colors text-sm"
            >
              Be the first to create one.
            </Link>
          </div>
        )}

        {tenants && tenants.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
          >
            {tenants.map((tenant, i) => (
              <motion.div
                key={tenant.id}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
              >
                <Link href={`/${tenant.slug}`}>
                  <div className="group h-full bg-card border border-border/40 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-300 cursor-pointer flex flex-col gap-3">
                    <div className="flex-1">
                      <h3 className="text-xl font-serif text-foreground group-hover:text-primary transition-colors duration-200 mb-1">
                        {tenant.friendName}
                      </h3>
                      {tenant.tagline && (
                        <p className="text-sm text-muted-foreground font-serif italic line-clamp-2 leading-relaxed">
                          {tenant.tagline}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-border/20">
                      <span className="text-xs text-muted-foreground/50 font-mono">
                        /{tenant.slug}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-primary/70 font-serif group-hover:gap-2 transition-all duration-200">
                        Visit page
                        <ArrowRight className="w-3 h-3" strokeWidth={1.5} />
                      </span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        )}
      </section>

      {/* Closing line */}
      <section className="py-16 md:py-20 px-6 text-center border-t border-border/20">
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-muted-foreground font-serif italic text-base md:text-lg max-w-xl mx-auto leading-relaxed"
        >
          belovedfriend.org is a calm, private space for communities to honour the people
          who shaped them — built with care, kept simple, free of noise.
        </motion.p>
      </section>
    </div>
  );
}
