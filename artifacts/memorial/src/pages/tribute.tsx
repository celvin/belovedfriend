import { useGetMessage } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { useTenantSlug } from "@/lib/tenant";

export default function Tribute() {
  const slug = useTenantSlug() ?? "";
  const { id } = useParams<{ id: string }>();
  const { data: message, isLoading, error } = useGetMessage(slug, Number(id));

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="font-serif italic text-muted-foreground">Loading tribute...</div>
      </div>
    );
  }

  if (error || !message) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
        <h2 className="text-2xl font-serif mb-4">Tribute not found</h2>
        <Link href={`/${slug}/wall`}>
          <Button variant="outline">Return to Wall</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-muted/10 py-12 px-4">
      <div className="container max-w-4xl mx-auto">
        <Link href={`/${slug}/wall`} className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors mb-8">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to all tributes
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border/40 shadow-xl rounded-2xl overflow-hidden"
        >
          {message.type === "video" && message.videoPath ? (
            <div className="aspect-video bg-black relative">
              <video
                src={`/api${message.videoPath}`}
                controls
                autoPlay
                className="w-full h-full object-contain"
              />
            </div>
          ) : message.type === "card" && message.card ? (
            <div
              className="p-12 md:p-24 flex flex-col min-h-[60vh] relative"
              style={{
                background: message.card.background || "var(--card)",
                color: message.card.accent || "inherit",
                fontFamily:
                  message.card.font === "serif"
                    ? "var(--font-serif)"
                    : message.card.font === "handwritten"
                    ? "var(--font-handwriting)"
                    : "var(--font-sans)",
              }}
            >
              {message.photoPath && (
                <div className="mb-12 flex justify-center">
                  <img
                    src={`/api${message.photoPath}`}
                    alt="Tribute"
                    className="max-h-96 object-contain rounded-lg shadow-md"
                  />
                </div>
              )}

              <div
                className={`flex-1 flex flex-col ${
                  message.card.layout === "top"
                    ? "justify-start text-left"
                    : message.card.layout === "bottom"
                    ? "justify-end text-left"
                    : "justify-center text-center"
                }`}
              >
                {message.card.title && (
                  <h2 className="text-4xl md:text-5xl font-serif mb-8">{message.card.title}</h2>
                )}

                <p className="text-xl md:text-2xl leading-relaxed whitespace-pre-wrap mb-12 opacity-90">
                  {message.card.body || message.body}
                </p>

                {message.card.signature && (
                  <div className="text-2xl font-handwriting mt-auto opacity-80">
                    — {message.card.signature}
                  </div>
                )}
              </div>
            </div>
          ) : message.type === "link" && message.url ? (
            <div className="p-12 md:p-24 flex flex-col items-center justify-center min-h-[30vh] gap-6">
              <p className="font-serif text-lg text-muted-foreground italic text-center max-w-xl">
                {message.body}
              </p>
              <a
                href={message.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-primary hover:underline font-serif text-xl break-all"
              >
                {message.url}
              </a>
            </div>
          ) : null}

          <div className="p-8 bg-background border-t border-border/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="font-serif text-xl">{message.authorName}</h3>
              {(message.relationship || message.location) && (
                <p className="text-muted-foreground text-sm mt-1">
                  {[message.relationship, message.location].filter(Boolean).join(" • ")}
                </p>
              )}
            </div>
            <div className="text-sm text-muted-foreground italic">
              {format(new Date(message.createdAt), "MMMM d, yyyy")}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
