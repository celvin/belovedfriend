import { motion } from "framer-motion";
import type { Message } from "@workspace/api-client-react";
import { PALETTE } from "@/components/presentation/constants";

interface Props {
  message: Message;
  muted: boolean;
  /** Called when a video finishes — the engine advances to the next scene. */
  onEnded: () => void;
}

function Caption({ heading, sub }: { heading?: string | null; sub?: string | null }) {
  if (!heading && !sub) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, duration: 1 }}
      className="absolute bottom-12 left-10 right-10 z-10 text-left"
    >
      {sub && (
        <p className="mb-2 max-w-3xl font-serif text-lg text-white/90 md:text-2xl line-clamp-4">{sub}</p>
      )}
      {heading && <p className="font-serif text-sm italic text-white/60 md:text-base">{heading}</p>}
    </motion.div>
  );
}

export function MemoryScene({ message, muted, onEnded }: Props) {
  const who = [message.authorName, message.relationship, message.location].filter(Boolean).join(" · ");
  const cardBody = (message.card as { body?: string } | null | undefined)?.body;
  const text = cardBody || message.body || "";

  if (message.type === "video" && message.videoPath) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        <video
          src={`/api${message.videoPath}`}
          autoPlay
          muted={muted}
          playsInline
          onEnded={onEnded}
          className="h-full w-full object-contain"
        />
        <Caption heading={who} sub={message.body} />
      </div>
    );
  }

  if (message.photoPath) {
    return (
      <div className="absolute inset-0 overflow-hidden bg-black">
        <motion.img
          src={`/api${message.photoPath}`}
          alt=""
          initial={{ scale: 1.05 }}
          animate={{ scale: 1.16 }}
          transition={{ duration: 7.5, ease: "linear" }}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/20" />
        <Caption heading={who} sub={text} />
      </div>
    );
  }

  // Text-only card / message.
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center px-10 text-center"
      style={{ background: `radial-gradient(ellipse at center, ${PALETTE.inkSoft}, ${PALETTE.ink})` }}
    >
      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2 }}
        className="max-w-3xl font-serif text-2xl leading-relaxed text-white/90 md:text-4xl"
      >
        {text || "A memory."}
      </motion.p>
      {who && <p className="mt-8 font-serif italic text-white/60">{who}</p>}
    </div>
  );
}
