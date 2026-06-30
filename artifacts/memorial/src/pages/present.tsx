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
import { useT } from "@/components/language-provider";
import { TitleScene } from "@/components/presentation/title-scene";
import { MemoryScene } from "@/components/presentation/memory-scene";
import { JourneyScene } from "@/components/presentation/journey-scene";
import { PresentationControls } from "@/components/presentation/presentation-controls";
import { SCENE_MS, POLL_MS, FLOURISH_MS, PALETTE } from "@/components/presentation/constants";

type Scene = { kind: "title" } | { kind: "journey" } | { kind: "memory"; message: Message };

export default function Present() {
  const { t } = useT();
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

  // Soft synthesized ambient pad (no audio asset). Created lazily inside the
  // sound-toggle gesture so the browser allows it; ducked to silence during
  // videos so it never competes with a tribute's own audio.
  const audioRef = useRef<{ ctx: AudioContext; master: GainNode; oscs: OscillatorNode[] } | null>(null);
  function ensureAudio() {
    if (audioRef.current) return audioRef.current;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 640;
    filter.connect(master);
    master.connect(ctx.destination);
    const freqs = [110, 164.81, 220]; // A2 · E3 · A3 — a soft open chord
    const detunes = [-4, 3, -2];
    const oscs = freqs.map((f, i) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      o.detune.value = detunes[i];
      const g = ctx.createGain();
      g.gain.value = 0.5;
      o.connect(g);
      g.connect(filter);
      o.start();
      return o;
    });
    audioRef.current = { ctx, master, oscs };
    return audioRef.current;
  }
  function rampAmbient(target: number) {
    const a = audioRef.current;
    if (!a) return;
    a.master.gain.cancelScheduledValues(a.ctx.currentTime);
    a.master.gain.linearRampToValueAtTime(target, a.ctx.currentTime + 1.0);
  }
  function toggleSound() {
    ensureAudio()?.ctx.resume?.();
    setMuted((m) => !m);
  }
  useEffect(
    () => () => {
      const a = audioRef.current;
      a?.oscs.forEach((o) => {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
      });
      a?.ctx.close?.();
      audioRef.current = null;
    },
    [],
  );

  const pc = (tenant?.pageConfig ?? {}) as Record<string, unknown>;
  const accent = ((pc.theme as { accent?: string } | undefined)?.accent) || PALETTE.defaultAccent;
  const heroPhotoPath = (pc.hero as { heroPhotoPath?: string } | undefined)?.heroPhotoPath;
  const yearRange = [tenant?.birthYear, tenant?.deathYear].filter(Boolean).join(" — ") || null;

  // Apply the owner's curation: hide excluded memories, honor the explicit
  // order, then append anything not yet ordered (newest uploads) by id so they
  // always show without shifting already-ordered scenes.
  const orderedMsgs = useMemo(() => {
    const p = ((tenant?.pageConfig as Record<string, unknown> | undefined)?.presentation ?? {}) as {
      order?: number[];
      hidden?: number[];
    };
    const hidden = new Set(p.hidden ?? []);
    const orderIdx = new Map((p.order ?? []).map((id, i) => [id, i] as const));
    return [...(messages ?? [])]
      .filter((m) => !hidden.has(m.id))
      .sort((a, b) => {
        const ai = orderIdx.has(a.id) ? (orderIdx.get(a.id) as number) : Infinity;
        const bi = orderIdx.has(b.id) ? (orderIdx.get(b.id) as number) : Infinity;
        return ai !== bi ? ai - bi : a.id - b.id;
      });
  }, [messages, tenant?.pageConfig]);
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

  // Ambient level: silent when sound is off or during a video (so it never
  // competes with a tribute's own audio); a soft hum otherwise.
  useEffect(() => {
    const isVideo = scene?.kind === "memory" && scene.message.type === "video" && !!scene.message.videoPath;
    rampAmbient(muted || isVideo ? 0 : 0.045);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muted, scene]);

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
    const timer = setTimeout(() => setFlourish(false), FLOURISH_MS);
    return () => clearTimeout(timer);
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
    // Don't auto-relaunch the theater when we land back on the page this session.
    try {
      if (slug) sessionStorage.setItem(`lv-skip-present-${slug}`, "1");
    } catch {
      /* sessionStorage unavailable */
    }
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
      else if (e.key.toLowerCase() === "m") toggleSound();
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
          {t("present.preparing")}
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
              {t("present.emptyState")}
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
                {t("present.newMemoryArrived")}
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
            onMute={toggleSound}
            onFullscreen={toggleFullscreen}
            onExit={exit}
          />
        </>
      )}
    </div>
  );
}
