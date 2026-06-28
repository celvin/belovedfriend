import { motion } from "framer-motion";
import { Starfield } from "@/components/starfield";

interface Props {
  friendName: string;
  yearRange: string | null;
  tagline: string | null;
  heroPhotoPath?: string;
  accent: string;
  reduceMotion?: boolean;
}

export function TitleScene({ friendName, yearRange, tagline, heroPhotoPath, accent, reduceMotion = false }: Props) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
      <Starfield count={120} />
      <motion.div
        initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.96 }}
        animate={{ opacity: 1, scale: reduceMotion ? 1 : 1.06 }}
        transition={{ duration: reduceMotion ? 1.2 : 6.5, ease: "easeOut" }}
        className="relative z-10 flex flex-col items-center gap-6"
      >
        {heroPhotoPath && (
          <img
            src={`/api${heroPhotoPath}`}
            alt=""
            className="h-40 w-40 rounded-full border border-white/20 object-cover md:h-52 md:w-52"
            style={{ boxShadow: `0 0 90px ${accent}66` }}
          />
        )}
        <h1 className="font-serif text-5xl tracking-tight md:text-7xl">{friendName}</h1>
        {yearRange && (
          <p className="font-serif text-xl italic text-white/70 md:text-2xl">{yearRange}</p>
        )}
        {tagline && (
          <>
            <div className="my-2 h-px w-16" style={{ background: `${accent}80` }} />
            <p className="max-w-2xl font-serif text-lg italic text-white/85 md:text-2xl">{tagline}</p>
          </>
        )}
      </motion.div>
    </div>
  );
}
