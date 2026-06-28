import { useState } from "react";
import { Link, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { VideoRecorder } from "@/components/video-recorder";
import { CardDesigner } from "@/components/card-designer";
import { Video, PenTool, MapPin } from "lucide-react";
import { useTenantSlug } from "@/lib/tenant";

export default function Compose() {
  const slug = useTenantSlug() ?? "";
  const { isAuthenticated, isLoading } = useAuth();
  const search = useSearch();
  const nodeParam = new URLSearchParams(search).get("node");
  const nodeId = nodeParam && /^\d+$/.test(nodeParam) ? parseInt(nodeParam, 10) : undefined;
  const [mode, setMode] = useState<"select" | "video" | "card">("select");

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="font-serif italic text-muted-foreground">Preparing...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-6">
        <h1 className="text-3xl font-serif">Sign in to leave a tribute</h1>
        <p className="text-muted-foreground font-serif italic max-w-md">
          We use a magic link to verify your identity — no password needed.
        </p>
        <Link href={`/sign-in?slug=${slug}&intent=compose`}>
          <Button size="lg" className="font-serif rounded-full px-8">
            Get a magic link
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center bg-background/50">
      <AnimatePresence mode="wait">
        {mode === "select" ? (
          <motion.div
            key="select"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex-1 flex flex-col items-center justify-center p-4 w-full max-w-4xl mx-auto text-center"
          >
            <h1 className="text-4xl md:text-5xl font-serif mb-6 text-foreground">Leave a Tribute</h1>
            {nodeId != null && (
              <div className="flex items-center justify-center gap-2 mb-4 text-sm text-muted-foreground">
                <MapPin size={14} className="text-primary/70 shrink-0" />
                <span>Attaching to a place on the map (node #{nodeId})</span>
              </div>
            )}
            <p className="text-lg text-muted-foreground font-serif italic mb-16 max-w-2xl">
              Choose how you'd like to share your memory. You can record a quiet video message or carefully design a condolence card.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-3xl">
              <button
                onClick={() => setMode("video")}
                className="group relative flex flex-col items-center p-12 bg-card border border-border/40 rounded-3xl shadow-sm hover:shadow-xl transition-all duration-500 overflow-hidden text-left"
              >
                <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-500">
                  <Video className="w-10 h-10 text-primary" />
                </div>
                <h3 className="text-2xl font-serif mb-4">Record a Video</h3>
                <p className="text-muted-foreground text-center">
                  Speak from the heart. Record up to 3 minutes of video directly from your camera.
                </p>
              </button>

              <button
                onClick={() => setMode("card")}
                className="group relative flex flex-col items-center p-12 bg-card border border-border/40 rounded-3xl shadow-sm hover:shadow-xl transition-all duration-500 overflow-hidden text-left"
              >
                <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-500">
                  <PenTool className="w-10 h-10 text-primary" />
                </div>
                <h3 className="text-2xl font-serif mb-4">Design a Card</h3>
                <p className="text-muted-foreground text-center">
                  Write a message, choose a gentle design, and optionally upload a photo.
                </p>
              </button>
            </div>
          </motion.div>
        ) : mode === "video" ? (
          <motion.div
            key="video"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="w-full flex-1 flex flex-col"
          >
            <div className="container mx-auto py-8 px-4">
              <Button variant="ghost" onClick={() => setMode("select")} className="mb-8 font-serif text-muted-foreground hover:text-foreground">
                ← Back
              </Button>
              <VideoRecorder slug={slug} nodeId={nodeId} />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="card"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="w-full flex-1 flex flex-col"
          >
            <div className="container mx-auto py-8 px-4 max-w-6xl">
              <Button variant="ghost" onClick={() => setMode("select")} className="mb-8 font-serif text-muted-foreground hover:text-foreground">
                ← Back
              </Button>
              <CardDesigner slug={slug} nodeId={nodeId} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
