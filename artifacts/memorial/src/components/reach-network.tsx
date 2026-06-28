import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "wouter";
import {
  useGetReachNetwork,
  useListMessages,
  type Message,
  type ReachNode,
} from "@workspace/api-client-react";
import { X, Play, Video as VideoIcon, Plus, Network, Globe } from "lucide-react";
import { InlineVideoRecorder } from "@/components/inline-video-recorder";
import { WorldMap, type PlottedNode } from "@/components/world-map";

interface PositionedNode extends ReachNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

const CATEGORY_LABEL: Record<ReachNode["category"], string> = {
  project: "Project area",
  city: "City",
  agency: "Agency",
  community: "Community",
  team: "Team",
  wonder: "Wonder of the World",
};

const CATEGORY_COLOR: Record<ReachNode["category"], string> = {
  project: "#B47C34",
  city: "#7A4A1F",
  agency: "#4A6B4A",
  community: "#9A4B22",
  team: "#2B556B",
  wonder: "#A03A6B",
};

function radiusFor(node: ReachNode): number {
  const base =
    node.category === "wonder" ? 7 :
    node.category === "project" ? 6 :
    node.category === "city" ? 5 :
    4;
  return base + Math.min(node.weight ?? 1, 6) * 0.6;
}

function videosForNode(node: ReachNode, all: Message[]): Message[] {
  const videos = all.filter((m) => m.type === "video" && m.videoPath);
  if (node.category === "city") {
    const cityName = node.label.split(",")[0]?.trim().toLowerCase();
    if (!cityName) return [];
    return videos.filter((v) =>
      (v.location ?? "").toLowerCase().includes(cityName),
    );
  }
  // For non-city nodes, surface a small recent sampling so the marker always has something to show.
  return videos.slice(0, 4);
}

type ViewMode = "constellation" | "map";

export function ReachNetwork() {
  const { data, isLoading } = useGetReachNetwork();
  const { data: messages } = useListMessages({ type: "all", limit: 200 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1, h: 600 });
  const [nodes, setNodes] = useState<PositionedNode[]>([]);
  const [selected, setSelected] = useState<{ id: string; x: number; y: number; radius: number } | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("map");
  const [mapPlotted, setMapPlotted] = useState<PlottedNode[]>([]);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false,
  );
  const animationRef = useRef<number | null>(null);
  const nodesRef = useRef<PositionedNode[]>([]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Initialize layout
  useEffect(() => {
    if (!data || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    setSize({ w, h });

    const next: PositionedNode[] = data.nodes.map((node, i) => {
      const angle = (i / data.nodes.length) * Math.PI * 2;
      const r = Math.min(w, h) * 0.32 + Math.random() * 40;
      return {
        ...node,
        x: w / 2 + Math.cos(angle) * r,
        y: h / 2 + Math.sin(angle) * r,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        radius: radiusFor(node),
      };
    });
    nodesRef.current = next;
    setNodes(next);

    const ro = new ResizeObserver(() => {
      if (!containerRef.current) return;
      const r2 = containerRef.current.getBoundingClientRect();
      setSize({ w: r2.width, h: r2.height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [data]);

  // Gentle, slow drift animation. Pauses when a node is selected so the marker stays anchored.
  useEffect(() => {
    if (!nodes.length || view !== "constellation") return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 16, 3);
      last = now;
      if (!selected) {
        const w = size.w;
        const h = size.h;
        const arr = nodesRef.current;
        for (const n of arr) {
          n.x += n.vx * dt;
          n.y += n.vy * dt;
          if (n.x < 24 || n.x > w - 24) n.vx *= -1;
          if (n.y < 24 || n.y > h - 24) n.vy *= -1;
        }
        setNodes([...arr]);
      }
      animationRef.current = requestAnimationFrame(tick);
    };
    animationRef.current = requestAnimationFrame(tick);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [nodes.length, selected, size.w, size.h, view]);

  // The "live" position of the selected node — tracks drift in constellation, or
  // reprojected coordinates in map view.
  const selectedLive = useMemo(() => {
    if (!selected) return null;
    if (view === "map") {
      const p = mapPlotted.find((m) => m.node.id === selected.id);
      if (p) {
        const live = nodes.find((n) => n.id === selected.id);
        if (!live) return null;
        return { ...live, x: p.x, y: p.y, radius: p.radius };
      }
      return null;
    }
    const live = nodes.find((n) => n.id === selected.id);
    return live ?? null;
  }, [selected, nodes, view, mapPlotted]);

  // Clear selection when switching to a view that can't show the selected node
  useEffect(() => {
    if (!selected) return;
    if (view === "map") {
      const ok = data?.nodes.some(
        (n) => n.id === selected.id && typeof n.lat === "number" && typeof n.lng === "number",
      );
      if (!ok) setSelected(null);
    }
  }, [view, selected, data]);

  const edges = useMemo(() => {
    if (!data) return [];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    return data.edges
      .map((e) => ({ source: byId.get(e.source), target: byId.get(e.target) }))
      .filter(
        (e): e is { source: PositionedNode; target: PositionedNode } =>
          !!e.source && !!e.target,
      );
  }, [data, nodes]);

  if (isLoading || !data) {
    return (
      <div className="h-[640px] w-full flex items-center justify-center text-muted-foreground font-serif italic">
        Loading the network of his impact...
      </div>
    );
  }

  const summary = data.summary;
  const allMessages = messages ?? [];

  return (
    <div className="space-y-8">
      {/* Summary numbers — readable on entry, not gated behind animation */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-6 md:gap-6 text-center">
        {[
          { label: "Lives touched", value: summary.livesTouched?.toLocaleString() ?? "—" },
          { label: "Years of service", value: `${summary.yearsOfService}+` },
          { label: "Project areas", value: summary.projects.toString() },
          { label: "Agency types", value: summary.agencies.toString() },
          { label: "Cities", value: summary.cities.toString() },
          { label: "Team members", value: `${summary.teamSize}+` },
          { label: "Wonders visited", value: (summary.wonders ?? 7).toString() },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.05 }}
          >
            <div className="text-3xl md:text-4xl font-serif text-primary">{s.value}</div>
            <div className="text-xs md:text-sm tracking-widest uppercase text-muted-foreground mt-2">
              {s.label}
            </div>
          </motion.div>
        ))}
      </div>

      {/* View toggle */}
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-1 p-1 rounded-full border border-border/40 bg-card/60 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setView("constellation")}
            className={`px-4 py-1.5 text-xs font-medium tracking-wide rounded-full flex items-center gap-1.5 transition ${
              view === "constellation"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Network size={13} /> Constellation
          </button>
          <button
            type="button"
            onClick={() => setView("map")}
            className={`px-4 py-1.5 text-xs font-medium tracking-wide rounded-full flex items-center gap-1.5 transition ${
              view === "map"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Globe size={13} /> World map
          </button>
        </div>
      </div>

      {/* Interactive network */}
      <div
        ref={containerRef}
        className="relative w-full h-[420px] md:h-[640px] rounded-2xl border border-border/30 overflow-hidden bg-gradient-to-b from-background to-muted/40"
      >
        {view === "constellation" ? (
          <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${size.w} ${size.h}`}>
            {/* edges */}
            <g>
              {edges.map((e, i) => {
                const dx = e.target.x - e.source.x;
                const dy = e.target.y - e.source.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const maxDist = Math.min(size.w, size.h) * 0.55;
                const opacity = Math.max(0, 0.35 * (1 - dist / maxDist));
                if (opacity <= 0.02) return null;
                const isActive =
                  selectedLive &&
                  (e.source.id === selectedLive.id || e.target.id === selectedLive.id);
                return (
                  <line
                    key={i}
                    x1={e.source.x}
                    y1={e.source.y}
                    x2={e.target.x}
                    y2={e.target.y}
                    stroke={isActive ? CATEGORY_COLOR[selectedLive!.category] : "#B47C34"}
                    strokeOpacity={isActive ? 0.55 : opacity}
                    strokeWidth={isActive ? 1 : 0.6}
                  />
                );
              })}
            </g>

            {/* nodes */}
            <g>
              {nodes.map((n) => {
                const isHover = hovered === n.id;
                const isSel = selectedLive?.id === n.id;
                const color = CATEGORY_COLOR[n.category];
                return (
                  <g
                    key={n.id}
                    transform={`translate(${n.x},${n.y})`}
                    className="cursor-pointer"
                    onMouseEnter={() => setHovered(n.id)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected({ id: n.id, x: n.x, y: n.y, radius: n.radius });
                    }}
                  >
                    <circle r={n.radius + 8} fill={color} opacity={isSel ? 0.18 : isHover ? 0.14 : 0.06} />
                    <circle r={n.radius + 4} fill={color} opacity={isSel ? 0.28 : 0.12} />
                    <circle
                      r={n.radius}
                      fill={color}
                      stroke="#fffaf0"
                      strokeWidth={isSel ? 2 : 1}
                    />
                    {(isHover ||
                      isSel ||
                      (!isMobile &&
                        (n.category === "project" || n.category === "team"))) && (
                      <text
                        x={n.radius + 8}
                        y={4}
                        fontSize={isSel ? 13 : 11}
                        fontFamily="Inter, sans-serif"
                        fill="#3B2F1E"
                        style={{ pointerEvents: "none" }}
                      >
                        {n.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        ) : (
          <WorldMap
            nodes={data.nodes}
            width={size.w}
            height={size.h}
            selectedId={selectedLive?.id ?? null}
            hoveredId={hovered}
            compact={isMobile}
            onHover={setHovered}
            onSelect={(id) => {
              const p = mapPlotted.find((m) => m.node.id === id);
              if (p) setSelected({ id, x: p.x, y: p.y, radius: p.radius });
            }}
            onLayout={setMapPlotted}
          />
        )}

        {/* Click-to-deselect background */}
        {selectedLive && (
          <button
            type="button"
            aria-label="Close marker"
            onClick={() => setSelected(null)}
            className="absolute inset-0 bg-transparent"
          />
        )}

        {/* Helper hint */}
        {!selectedLive && (
          <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 text-xs tracking-widest uppercase text-muted-foreground/70">
            {view === "map"
              ? "Click any place to leave a tribute from that location"
              : "Click any point to explore tributes from that place"}
          </div>
        )}

        {/* Legend */}
        <div className="absolute top-3 left-3 right-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] md:text-xs">
          {(view === "map"
            ? (Array.from(
                new Set(
                  mapPlotted.map((p) => p.node.category),
                ),
              ) as Array<keyof typeof CATEGORY_COLOR>)
            : (Object.keys(CATEGORY_COLOR) as Array<keyof typeof CATEGORY_COLOR>)
          ).map((k) => (
            <div key={k} className="flex items-center gap-1.5 text-muted-foreground">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: CATEGORY_COLOR[k] }}
              />
              <span className="capitalize">{k}</span>
            </div>
          ))}
        </div>

        {/* Marker popover */}
        <AnimatePresence>
          {selectedLive && (
            <NodeMarker
              key={`${view}-${selectedLive.id}`}
              node={selectedLive}
              size={size}
              videos={videosForNode(selectedLive, allMessages)}
              onClose={() => setSelected(null)}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function NodeMarker({
  node,
  size,
  videos,
  onClose,
}: {
  node: PositionedNode;
  size: { w: number; h: number };
  videos: Message[];
  onClose: () => void;
}) {
  const [recording, setRecording] = useState(false);
  const cardW = recording ? 360 : 320;
  const cardH = recording ? 460 : 240;
  const margin = 12;
  let left = node.x + node.radius + 14;
  let top = node.y - cardH / 2;
  if (left + cardW + margin > size.w) left = node.x - cardW - node.radius - 14;
  if (left < margin) left = margin;
  if (top < margin) top = margin;
  if (top + cardH + margin > size.h) top = size.h - cardH - margin;

  const defaultLocation =
    node.category === "city" || node.category === "wonder" || node.category === "project"
      ? node.label
      : "";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1, width: cardW }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: 0.2 }}
      style={{ left, top }}
      className="absolute z-10 bg-card/95 backdrop-blur-md border border-border/60 rounded-xl shadow-xl overflow-hidden"
    >
      <div className="flex items-start justify-between gap-2 px-4 pt-3 pb-2 border-b border-border/40">
        <div className="min-w-0">
          <div className="text-[10px] tracking-widest uppercase text-muted-foreground">
            {CATEGORY_LABEL[node.category]}
          </div>
          <div className="font-serif text-lg leading-tight text-foreground truncate">
            {node.label}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-muted-foreground hover:text-foreground p-1 -mt-1 -mr-1 rounded"
        >
          <X size={16} />
        </button>
      </div>
      {node.note && (
        <p className="px-4 py-2 text-xs italic text-muted-foreground border-b border-border/30">
          {node.note}
        </p>
      )}
      <div className="px-4 py-3 max-h-[400px] overflow-y-auto">
        {recording ? (
          <InlineVideoRecorder
            defaultLocation={defaultLocation}
            contextLabel={node.label}
            onCancel={() => setRecording(false)}
            onSaved={() => {
              setRecording(false);
            }}
          />
        ) : videos.length === 0 ? (
          <div className="text-sm text-muted-foreground space-y-3">
            <div className="flex items-center gap-2 text-foreground/80">
              <VideoIcon size={14} className="text-primary" />
              <span className="font-medium">No video tributes here yet</span>
            </div>
            <p className="text-xs leading-relaxed">
              {node.category === "city"
                ? "Be the first to share a memory from this place."
                : "Be the first to share a memory about this part of his work."}
            </p>
            <button
              type="button"
              onClick={() => setRecording(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <VideoIcon size={12} /> Record a tribute here →
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <ul className="space-y-3">
              {videos.map((v) => (
                <li key={v.id}>
                  <Link
                    href={`/tribute/${v.id}`}
                    className="flex items-center gap-3 group rounded-md p-1 -m-1 hover:bg-muted/60 transition"
                  >
                    <div className="relative w-16 h-12 rounded-md overflow-hidden bg-muted flex-shrink-0">
                      <video
                        src={`/api/storage${v.videoPath}`}
                        preload="metadata"
                        muted
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/20 transition">
                        <Play size={16} className="text-white drop-shadow" />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground truncate">
                        {v.authorName}
                      </div>
                      {v.relationship && (
                        <div className="text-xs text-muted-foreground truncate">
                          {v.relationship}
                        </div>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setRecording(true)}
              className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-medium text-primary hover:bg-primary/5 rounded-md py-2 border border-dashed border-primary/30"
            >
              <Plus size={12} /> Add your tribute for {node.label}
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
