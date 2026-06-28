import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import {
  useGetReach,
  useGetTenant,
  useListMessages,
  getGetReachQueryKey,
  getGetTenantQueryKey,
  getListMessagesQueryKey,
  ListMessagesType,
  type Message,
} from "@workspace/api-client-react";
import { useTenantSlug } from "@/lib/tenant";
import { TitleScene } from "@/components/presentation/title-scene";
import { MemoryScene } from "@/components/presentation/memory-scene";
import { JourneyScene } from "@/components/presentation/journey-scene";
import { PresentationControls } from "@/components/presentation/presentation-controls";
import { SCENE_MS, POLL_MS, FLOURISH_MS, PALETTE } from "@/components/presentation/constants";

type Scene = { kind: "title" } | { kind: "journey" } | { kind: "memory"; message: Message };

export default function Present() {
  const slug = useTenantSlug() ?? "";
  const [, setLocation] = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: tenant } = useGetTenant(slug, {
    query: { enabled: !!slug, refetchInterval: POLL_MS, queryKey: getGetTenantQueryKey(slug) },
  });
  const { data: reach } = useGetReach(slug, {
    query: { enabled: !!slug, refetchInterval: POLL_MS, queryKey: getGetReachQueryKey(slug) },
  });
  const messagesParams = { type: ListMessagesType.all };
  const { data: messages } = useListMessages(slug, messagesParams, {
    query: { enabled: !!slug, refetchInterval: POLL_MS, queryKey: getListMessagesQueryKey(slug, messagesParams) },
  });

  const [size, setSize] = useState(() => ({
    w: typeof window !== "undefined" ? window.innerWidth : 1280,
    h: typeof window !== "undefined" ? window.innerHeight : 720,
  }));
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Best-effort OS fullscreen on mount (browsers may require a direct gesture;
  // the page is a full-viewport overlay regardless). A control button below lets
  // the viewer toggle it explicitly (a click is always a valid gesture).
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    containerRef.current?.requestFullscreen?.().catch(() => {});
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else containerRef.current?.requestFullscreen?.().catch(() => {});
  };

  const pc = (tenant?.pageConfig ?? {}) as Record<string, unknown>;
  const accent = ((pc.theme as { accent?: string } | undefined)?.accent) || PALETTE.defaultAccent;
  const heroPhotoPath = (pc.hero as { heroPhotoPath?: string } | undefined)?.heroPhotoPath;
  const yearRange = [tenant?.birthYear, tenant?.deathYear].filter(Boolean).join(" — ") || null;

  // Oldest-first so newly added (higher id) memories append at the end and never
  // shift the indices of scenes already playing.
  const orderedMsgs = useMemo(() => [...(messages ?? [])].sort((a, b) => a.id - b.id), [messages]);
  const hasNodes = (reach?.nodes?.length ?? 0) > 0;
  const scenes = useMemo<Scene[]>(() => {
    const s: Scene[] = [{ kind: "title" }];
    if (hasNodes) s.push({ kind: "journey" });
    for (const m of orderedMsgs) s.push({ kind: "memory", message: m });
    return s;
  }, [hasNodes, orderedMsgs]);

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    if (index >= scenes.length) setIndex(0);
  }, [scenes.length, index]);

  const goNext = () => setIndex((i) => (scenes.length ? (i + 1) % scenes.length : 0));
  const goPrev = () => setIndex((i) => (scenes.length ? (i - 1 + scenes.length) % scenes.length : 0));

  const scene = scenes[index];
  const edgeCount = reach?.edges?.length ?? 0;

  const reduceMotion = useMemo(
    () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  // How long the current scene stays on screen (null = wait for a video to end).
  // Journey is paced to the number of hops but capped so it never drags.
  const sceneDuration = useMemo<number | null>(() => {
    if (!scene) return null;
    if (scene.kind === "memory" && scene.message.type === "video" && scene.message.videoPath) return null;
    if (scene.kind === "title") return SCENE_MS.title;
    if (scene.kind === "journey") return Math.min(16000, Math.max(SCENE_MS.journeyBase, edgeCount * SCENE_MS.journeyPerEdge));
    return SCENE_MS.photo;
  }, [scene, edgeCount]);

  // Timer-driven advance; video memory scenes advance on their `ended` event.
  useEffect(() => {
    if (!playing || sceneDuration == null) return;
    const timer = setTimeout(goNext, sceneDuration);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, playing, sceneDuration, scenes.length]);

  // New-memory flourish (skip the initial load).
  const seenRef = useRef<Set<number> | null>(null);
  const [flourish, setFlourish] = useState(false);
  useEffect(() => {
    if (!messages) return;
    const ids = new Set(messages.map((m) => m.id));
    if (seenRef.current === null) {
      seenRef.current = ids;
      return;
    }
    let isNew = false;
    for (const id of ids) if (!seenRef.current.has(id)) isNew = true;
    seenRef.current = ids;
    if (!isNew) return;
    setFlourish(true);
    const t = setTimeout(() => setFlourish(false), FLOURISH_MS);
    return () => clearTimeout(t);
  }, [messages]);

  // Auto-hiding controls + cursor.
  const [controlsVisible, setControlsVisible] = useState(true);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const show = () => {
      setControlsVisible(true);
      clearTimeout(timer);
      timer = setTimeout(() => setControlsVisible(false), 3000);
    };
    show();
    window.addEventListener("mousemove", show);
    window.addEventListener("touchstart", show);
    return () => {
      window.removeEventListener("mousemove", show);
      window.removeEventListener("touchstart", show);
      clearTimeout(timer);
    };
  }, []);

  const exit = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    setLocation(`/${slug}`);
  };

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key.toLowerCase() === "m") setMuted((m) => !m);
      else if (e.key === "Escape") exit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenes.length]);

  const ready = !!tenant;
  const empty = ready && scenes.length <= 1;

  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 z-[100] overflow-hidden bg-[#0e0b07] text-white ${controlsVisible ? "" : "cursor-none"}`}
    >
      {!ready ? (
        <div className="absolute inset-0 flex items-center justify-center font-serif italic text-white/60">
          Preparing the tribute…
        </div>
      ) : (
        <>
          <AnimatePresence mode="wait">
            <motion.div
              key={index}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8 }}
              className="absolute inset-0"
            >
              {scene?.kind === "title" && (
                <TitleScene
                  friendName={tenant.friendName}
                  yearRange={yearRange}
                  tagline={tenant.tagline ?? null}
                  heroPhotoPath={heroPhotoPath}
                  accent={accent}
                  reduceMotion={reduceMotion}
                />
              )}
              {scene?.kind === "journey" && (
                <JourneyScene
                  nodes={reach?.nodes ?? []}
                  edges={reach?.edges ?? []}
                  width={size.w}
                  height={size.h}
                  accent={accent}
                  durationMs={sceneDuration ?? 13000}
                  reduceMotion={reduceMotion}
                />
              )}
              {scene?.kind === "memory" && (
                <MemoryScene message={scene.message} muted={muted} reduceMotion={reduceMotion} onEnded={goNext} />
              )}
            </motion.div>
          </AnimatePresence>

          {/* Thin scene-progress bar (timer scenes only; videos run on their own) */}
          {playing && !reduceMotion && sceneDuration != null && (
            <motion.div
              key={`progress-${index}`}
              className="absolute left-0 top-0 z-[112] h-[3px]"
              style={{ background: "rgba(255,255,255,0.5)" }}
              initial={{ width: 0 }}
              animate={{ width: "100%" }}
              transition={{ duration: sceneDuration / 1000, ease: "linear" }}
            />
          )}

          {empty && (
            <div className="pointer-events-none absolute bottom-24 left-0 right-0 text-center font-serif italic text-white/50">
              Memories will appear here as they're shared.
            </div>
          )}

          <AnimatePresence>
            {flourish && (
              <motion.div
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="absolute left-1/2 top-8 z-[115] -translate-x-1/2 rounded-full border border-white/20 bg-white/10 px-5 py-2 font-serif text-sm backdrop-blur-md"
              >
                ✨ A new memory just arrived
              </motion.div>
            )}
          </AnimatePresence>

          <PresentationControls
            playing={playing}
            muted={muted}
            visible={controlsVisible}
            isFullscreen={isFullscreen}
            onToggle={() => setPlaying((p) => !p)}
            onPrev={goPrev}
            onNext={goNext}
            onMute={() => setMuted((m) => !m)}
            onFullscreen={toggleFullscreen}
            onExit={exit}
          />
        </>
      )}
    </div>
  );
}
