import { useEffect } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ReachNetwork } from "@/components/reach-network";

export default function Home() {
  useEffect(() => {
    if (window.location.hash === "#reach") {
      requestAnimationFrame(() => {
        document.getElementById("reach")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, []);

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
          <div className="space-y-3 md:space-y-4">
            <h1 className="text-5xl sm:text-6xl md:text-8xl font-serif tracking-tight text-foreground">
              Luis Ventura
            </h1>
            <p className="text-lg md:text-2xl font-serif italic text-muted-foreground tracking-wide">
              1965 — 2026
            </p>
          </div>

          <div className="w-16 h-px bg-primary/30 mx-auto my-6 md:my-12" />

          <p className="text-lg md:text-2xl font-serif text-foreground/80 leading-relaxed max-w-3xl mx-auto italic px-2">
            An extraordinary engineer, a visionary leader, and a generous soul.
            He built the foundations we stand on and lifted everyone around him.
          </p>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-6 pt-6 md:pt-12 px-2">
            <Link href="/compose">
              <Button size="lg" className="w-full sm:w-auto h-12 md:h-14 px-8 text-base md:text-lg font-serif bg-primary hover:bg-primary/90 text-primary-foreground rounded-full shadow-lg hover:shadow-xl transition-all duration-300">
                Leave a Tribute
              </Button>
            </Link>
            <Link href="/wall">
              <Button variant="ghost" size="lg" className="w-full sm:w-auto h-12 md:h-14 px-8 text-base md:text-lg font-serif text-foreground hover:bg-muted/50 rounded-full transition-all duration-300">
                Read Tributes
              </Button>
            </Link>
            <a href="#reach">
              <Button variant="ghost" size="lg" className="w-full sm:w-auto h-12 md:h-14 px-8 text-base md:text-lg font-serif text-foreground hover:bg-muted/50 rounded-full transition-all duration-300">
                Explore His Reach
              </Button>
            </a>
          </div>
        </motion.div>
      </section>

      {/* Reach Section */}
      <section id="reach" className="scroll-mt-20 py-12 md:py-24 px-4 bg-muted/30 border-y border-border/30">
        <div className="container mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-8 md:mb-12 space-y-3 md:space-y-4"
          >
            <div className="text-xs tracking-[0.3em] uppercase text-primary/80 font-medium">
              The Reach of His Work
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-6xl font-serif text-foreground leading-tight">
              A quiet thread<br className="hidden md:block" /> through countless lives
            </h2>
            <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Every employee at LCPtracker and Cikume, and millions of families connected to the
              projects, streets, and construction sites his software helped run (his code), were
              touched by him. He also believed the world was meant to be seen — and he saw all
              seven wonders of it with his own eyes. Click any point below to explore.
            </p>
          </motion.div>

          <ReachNetwork />

          <div className="text-center pt-8 md:pt-12">
            <Link href="/compose">
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

      {/* Final CTA */}
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
            Help us gather the stories, the quiet moments, and the legacy he left behind.
          </p>
          <div className="pt-4 md:pt-8">
            <Link href="/wall">
              <Button variant="outline" size="lg" className="h-12 md:h-14 px-8 md:px-10 text-base md:text-lg font-serif rounded-full border-primary/20 hover:border-primary/50 transition-all">
                Enter the Tribute Wall
              </Button>
            </Link>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
