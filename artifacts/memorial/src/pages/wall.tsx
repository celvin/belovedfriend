import { useState } from "react";
import { useListMessages, useGetMessageStats } from "@workspace/api-client-react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Play, ExternalLink } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useTenantSlug } from "@/lib/tenant";

type FilterType = "all" | "card" | "video" | "link";

export default function Wall() {
  const slug = useTenantSlug() ?? "";
  const [filter, setFilter] = useState<FilterType>("all");
  const { data: messages, isLoading } = useListMessages(slug, {
    type: filter !== "all" ? filter : undefined,
  });
  const { data: stats } = useGetMessageStats(slug);

  const [playingVideo, setPlayingVideo] = useState<string | null>(null);

  return (
    <div className="flex-1 bg-background/50 pb-24">
      <div className="bg-card border-b border-border/40 py-10 md:py-16 px-4 text-center">
        <div className="container mx-auto max-w-4xl">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif mb-4 md:mb-6">Tribute Wall</h1>
          {stats && (
            <p className="text-base md:text-lg text-muted-foreground font-serif italic mb-6 md:mb-8">
              {stats.total} tributes from {stats.countries} countries
            </p>
          )}

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              variant={filter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("all")}
              className="rounded-full font-serif md:h-10 md:px-5"
            >
              All Messages
            </Button>
            <Button
              variant={filter === "card" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("card")}
              className="rounded-full font-serif md:h-10 md:px-5"
            >
              Cards
            </Button>
            <Button
              variant={filter === "video" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("video")}
              className="rounded-full font-serif md:h-10 md:px-5"
            >
              Videos
            </Button>
            <Button
              variant={filter === "link" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("link")}
              className="rounded-full font-serif md:h-10 md:px-5"
            >
              Links
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] bg-muted/20 animate-pulse rounded-xl" />
            ))}
          </div>
        ) : messages?.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-xl text-muted-foreground font-serif italic mb-6">
              No tributes found.
            </p>
            <Link href={`/${slug}/compose`}>
              <Button className="font-serif rounded-full px-8">Be the first to leave a tribute</Button>
            </Link>
          </div>
        ) : (
          <div className="columns-1 md:columns-2 lg:columns-3 xl:columns-4 gap-6 space-y-6">
            {messages?.map((msg, idx) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(idx * 0.05, 0.5) }}
                className="break-inside-avoid mb-6"
              >
                {msg.type === "video" ? (
                  <div
                    className="bg-black/90 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow relative aspect-[3/4] group cursor-pointer"
                    onClick={() => setPlayingVideo(msg.videoPath!)}
                  >
                    <div className="absolute inset-0 flex items-center justify-center z-10">
                      <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 group-hover:bg-white/30 transition-all">
                        <Play className="w-6 h-6 text-white ml-1" />
                      </div>
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
                    <div className="absolute bottom-0 left-0 right-0 p-6 z-20 text-white">
                      <h3 className="font-serif text-xl mb-1">{msg.authorName}</h3>
                      <p className="text-sm text-white/70">{msg.relationship}</p>
                    </div>
                  </div>
                ) : msg.type === "link" ? (
                  <a
                    href={msg.url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer border border-border/20 bg-card group"
                  >
                    <div className="p-8 flex flex-col gap-4">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-serif text-lg font-medium group-hover:text-primary transition-colors">
                          {msg.authorName}
                        </h3>
                        <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1 group-hover:text-primary transition-colors" />
                      </div>
                      {msg.body && (
                        <p className="text-muted-foreground text-sm leading-relaxed line-clamp-4 font-serif">
                          {msg.body}
                        </p>
                      )}
                      {msg.url && (
                        <p className="text-xs text-primary/60 truncate mt-auto font-mono">
                          {msg.url}
                        </p>
                      )}
                    </div>
                  </a>
                ) : (
                  <Link href={`/${slug}/tribute/${msg.id}`}>
                    <div
                      className="rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer border border-border/20 group"
                      style={{
                        background: msg.card?.background || "var(--card)",
                        color: msg.card?.accent || "inherit",
                      }}
                    >
                      {msg.photoPath && (
                        <div className="w-full aspect-square overflow-hidden bg-black/5">
                          <img
                            src={`/api${msg.photoPath}`}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <div className="p-8 flex flex-col gap-6">
                        <p
                          className="text-lg leading-relaxed opacity-90 line-clamp-6"
                          style={{
                            fontFamily:
                              msg.card?.font === "serif"
                                ? "var(--font-serif)"
                                : msg.card?.font === "handwritten"
                                ? "var(--font-handwriting)"
                                : "var(--font-sans)",
                          }}
                        >
                          {msg.card?.body || msg.body}
                        </p>

                        <div className="mt-auto pt-6 border-t border-current/10">
                          <h3 className="font-serif font-medium">{msg.authorName}</h3>
                          <p className="text-sm opacity-70 mt-1">{msg.relationship}</p>
                        </div>
                      </div>
                    </div>
                  </Link>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!playingVideo} onOpenChange={(open) => !open && setPlayingVideo(null)}>
        <DialogContent className="max-w-4xl w-full p-0 bg-black border-none overflow-hidden h-[80vh] flex items-center justify-center">
          {playingVideo && (
            <video
              src={`/api${playingVideo}`}
              controls
              autoPlay
              className="max-w-full max-h-full object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
