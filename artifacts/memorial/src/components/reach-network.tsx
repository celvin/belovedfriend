import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetReach,
  useGetTenant,
  useCreateReachNode,
  useCreateReachEdge,
  useListMessages,
  getGetReachQueryKey,
  getGetTenantQueryKey,
  getListMessagesQueryKey,
  ListMessagesType,
  type ReachNode,
  type Message,
} from "@workspace/api-client-react";
import { X, Play, Plus, Network, Globe, Maximize2, Minimize2 } from "lucide-react";
import { InlineVideoRecorder } from "@/components/inline-video-recorder";
import { WorldMap, type PlottedNode } from "@/components/world-map";
import { useAuth } from "@/hooks/use-auth";

interface PositionedNode extends ReachNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

// Default color/label for unknown categories
const DEFAULT_COLOR = "#8A7A5A";
const DEFAULT_LABEL = "Other";

const KNOWN_COLORS: Record<string, string> = {
  project: "#B47C34",
  city: "#7A4A1F",
  agency: "#4A6B4A",
  community: "#9A4B22",
  team: "#2B556B",
  wonder: "#A03A6B",
};

const KNOWN_LABELS: Record<string, string> = {
  project: "Project area",
  city: "City",
  agency: "Agency",
  community: "Community",
  team: "Team",
  wonder: "Wonder of the World",
};

function categoryColor(cat: string): string {
  return KNOWN_COLORS[cat] ?? DEFAULT_COLOR;
}

function categoryLabel(cat: string): string {
  return KNOWN_LABELS[cat] ?? DEFAULT_LABEL;
}

function radiusFor(node: ReachNode): number {
  const base =
    node.category === "wonder" ? 7 :
    node.category === "project" ? 6 :
    node.category === "city" ? 5 :
    4;
  return base;
}

type ViewMode = "constellation" | "map";

type AddPanelMode = "node" | "edge";

interface AddNodeFormProps {
  slug: string;
  onClose: () => void;
  presetLat?: number;
  presetLng?: number;
  onClearLocation?: () => void;
}

interface AddEdgeFormProps {
  slug: string;
  nodes: ReachNode[];
  onClose: () => void;
}

function AddEdgeForm({ slug, nodes, onClose }: AddEdgeFormProps) {
  const queryClient = useQueryClient();
  const createEdge = useCreateReachEdge();
  const [sourceId, setSourceId] = useState<string>("");
  const [targetId, setTargetId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const sameNode = sourceId !== "" && targetId !== "" && sourceId === targetId;
  const canSubmit = sourceId !== "" && targetId !== "" && !sameNode && !createEdge.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (sameNode) {
      setError("Source and target must be different nodes.");
      return;
    }
    createEdge.mutate(
      {
        slug,
        data: {
          sourceNodeId: Number(sourceId),
          targetNodeId: Number(targetId),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetReachQueryKey(slug) });
          onClose();
        },
        onError: (err: unknown) => {
          const msg =
            err instanceof Error
              ? err.message
              : "Failed to add connection. The nodes may not belong to this map, or the connection already exists.";
          setError(msg);
        },
      },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs text-muted-foreground mb-1">From (source)</label>
        <select
          className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background"
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
          required
        >
          <option value="">Select a place…</option>
          {nodes.map((n) => (
            <option key={n.id} value={String(n.id)}>
              {n.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">To (target)</label>
        <select
          className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          required
        >
          <option value="">Select a place…</option>
          {nodes.map((n) => (
            <option key={n.id} value={String(n.id)}>
              {n.label}
            </option>
          ))}
        </select>
      </div>
      {sameNode && (
        <p className="text-xs text-muted-foreground">Choose two different places to connect.</p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex-1 bg-primary text-primary-foreground rounded-full py-2 text-sm font-medium hover:bg-primary/90 transition disabled:opacity-50"
        >
          {createEdge.isPending ? "Connecting…" : "Connect"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-4 rounded-full py-2 text-sm border border-border/40 hover:bg-muted/40 transition"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

interface AddPanelProps {
  slug: string;
  nodes: ReachNode[];
  onClose: () => void;
  presetLat?: number;
  presetLng?: number;
  onClearLocation?: () => void;
  onModeChange?: (mode: AddPanelMode) => void;
}

function AddPanel({ slug, nodes, onClose, presetLat, presetLng, onClearLocation, onModeChange }: AddPanelProps) {
  const [mode, setMode] = useState<AddPanelMode>("node");

  function handleModeChange(m: AddPanelMode) {
    setMode(m);
    onModeChange?.(m);
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm"
    >
      <div className="bg-card border border-border/60 rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-lg">Add to the map</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded">
            <X size={16} />
          </button>
        </div>

        {/* Mode switch */}
        <div className="inline-flex items-center w-full p-1 mb-4 rounded-full border border-border/40 bg-muted/30">
          <button
            type="button"
            onClick={() => handleModeChange("node")}
            className={`flex-1 py-1 text-xs font-medium tracking-wide rounded-full transition ${
              mode === "node"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Add a place
          </button>
          <button
            type="button"
            onClick={() => handleModeChange("edge")}
            className={`flex-1 py-1 text-xs font-medium tracking-wide rounded-full transition ${
              mode === "edge"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Connect two
          </button>
        </div>

        {mode === "node" ? (
          <AddNodeFormBody
            slug={slug}
            onClose={onClose}
            presetLat={presetLat}
            presetLng={presetLng}
            onClearLocation={onClearLocation}
          />
        ) : (
          <AddEdgeForm slug={slug} nodes={nodes} onClose={onClose} />
        )}
      </div>
    </motion.div>
  );
}

function AddNodeFormBody({ slug, onClose, presetLat, presetLng, onClearLocation }: AddNodeFormProps) {
  const queryClient = useQueryClient();
  const createNode = useCreateReachNode();
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("city");
  const [note, setNote] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [error, setError] = useState<string | null>(null);

  const hasPreset = presetLat != null && presetLng != null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const data: { label: string; category: string; note?: string; lat?: number; lng?: number } = {
      label: label.trim(),
      category,
    };
    if (note.trim()) data.note = note.trim();
    if (hasPreset) {
      data.lat = presetLat;
      data.lng = presetLng;
    } else {
      if (lat.trim()) {
        const n = parseFloat(lat);
        if (isNaN(n)) { setError("Latitude must be a number"); return; }
        data.lat = n;
      }
      if (lng.trim()) {
        const n = parseFloat(lng);
        if (isNaN(n)) { setError("Longitude must be a number"); return; }
        data.lng = n;
      }
    }
    createNode.mutate({ slug, data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetReachQueryKey(slug) });
        onClearLocation?.();
        onClose();
      },
      onError: () => setError("Failed to add node. Try again."),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Place or area name</label>
        <input
          className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background"
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="e.g. São Paulo, Brazil"
          required
        />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Category</label>
        <select
          className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background"
          value={category}
          onChange={e => setCategory(e.target.value)}
        >
          <option value="city">City</option>
          <option value="project">Project area</option>
          <option value="community">Community</option>
          <option value="team">Team</option>
          <option value="agency">Agency</option>
          <option value="wonder">Wonder of the World</option>
          <option value="other">Other</option>
        </select>
      </div>
      {hasPreset ? (
        <div className="flex items-center justify-between rounded-md border border-border/40 bg-muted/30 px-3 py-2">
          <div className="text-xs text-foreground">
            📍 Location chosen on the map{" "}
            <span className="text-muted-foreground">
              ({presetLat!.toFixed(2)}, {presetLng!.toFixed(2)})
            </span>
          </div>
          <button
            type="button"
            onClick={onClearLocation}
            className="ml-2 text-xs text-primary hover:underline shrink-0"
          >
            Pick a different spot
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Latitude (opt.)</label>
              <input
                className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background"
                value={lat}
                onChange={e => setLat(e.target.value)}
                placeholder="e.g. -23.55"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Longitude (opt.)</label>
              <input
                className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background"
                value={lng}
                onChange={e => setLng(e.target.value)}
                placeholder="e.g. -46.63"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Click the map to choose where this memory belongs.
          </p>
        </>
      )}
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Note (opt.)</label>
        <input
          className="w-full border border-border/60 rounded-md px-3 py-2 text-sm bg-background"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="A brief description"
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={createNode.isPending || !label.trim()}
          className="flex-1 bg-primary text-primary-foreground rounded-full py-2 text-sm font-medium hover:bg-primary/90 transition disabled:opacity-50"
        >
          {createNode.isPending ? "Adding…" : "Add to map"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-4 rounded-full py-2 text-sm border border-border/40 hover:bg-muted/40 transition"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

interface ReachNetworkProps {
  slug: string;
}

export function ReachNetwork({ slug }: ReachNetworkProps) {
  const { data, isLoading } = useGetReach(slug);
  const { data: tenant } = useGetTenant(slug, {
    query: { enabled: !!slug, queryKey: getGetTenantQueryKey(slug) },
  });
  const messagesParams = { type: ListMessagesType.all };
  const { data: messages } = useListMessages(slug, messagesParams, {
    query: { enabled: !!slug, queryKey: getListMessagesQueryKey(slug, messagesParams) },
  });
  const { isAuthenticated } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1, h: 600 });
  const [nodes, setNodes] = useState<PositionedNode[]>([]);
  const [selected, setSelected] = useState<{ id: number; x: number; y: number; radius: number } | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [view, setView] = useState<ViewMode>("map");
  const [mapPlotted, setMapPlotted] = useState<PlottedNode[]>([]);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false,
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showAddNode, setShowAddNode] = useState(false);
  const [addPanelMode, setAddPanelMode] = useState<AddPanelMode>("node");
  const [pickedLocation, setPickedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const animationRef = useRef<number | null>(null);
  const nodesRef = useRef<PositionedNode[]>([]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Fullscreen handling
  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  function toggleFullscreen() {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {/* ignore */});
    } else {
      document.exitFullscreen().catch(() => {/* ignore */});
    }
  }

  // Force map view when adding a new place so the map is clickable
  useEffect(() => {
    if (showAddNode && addPanelMode === "node") {
      setView("map");
    }
  }, [showAddNode, addPanelMode]);

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

  // Gentle, slow drift animation. Pauses when a node is selected.
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

  // The "live" position of the selected node
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
      .map((e) => ({ source: byId.get(e.sourceNodeId), target: byId.get(e.targetNodeId) }))
      .filter(
        (e): e is { source: PositionedNode; target: PositionedNode } =>
          !!e.source && !!e.target,
      );
  }, [data, nodes]);

  if (isLoading || !data) {
    return (
      <div className="h-[640px] w-full flex items-center justify-center text-muted-foreground font-serif italic">
        Loading the network of their impact...
      </div>
    );
  }

  const summary = data.summary as Record<string, unknown>;
  const numFromSummary = (k: string) =>
    typeof summary[k] === "number" ? (summary[k] as number) : undefined;
  const derivedValue = (key?: string): string => {
    switch (key) {
      case "nodeCount": return String(numFromSummary("nodeCount") ?? data.nodes.length);
      case "placeCount": return String(numFromSummary("placeCount") ?? 0);
      case "contributorCount": return String(numFromSummary("contributorCount") ?? 0);
      case "countryCount": return String(numFromSummary("countryCount") ?? 0);
      default: return "";
    }
  };
  // Owner-configured callouts (page_config.reachSummary), else fall back to counts.
  const pc = (tenant?.pageConfig ?? {}) as Record<string, unknown>;
  const reachSummaryCfg = Array.isArray(pc.reachSummary)
    ? (pc.reachSummary as Array<{ label: string; value?: string | number; derived?: string }>)
    : [];
  const summaryItems =
    reachSummaryCfg.length > 0
      ? reachSummaryCfg.map((it) => ({
          label: it.label,
          value: it.value != null ? String(it.value) : derivedValue(it.derived),
        }))
      : [
          { label: "Total nodes", value: String(data.nodes.length) },
          { label: "Connections", value: String(data.edges.length) },
        ];

  // Build unique categories present in the data
  const presentCategories = Array.from(new Set(data.nodes.map((n) => n.category)));

  return (
    <div className="space-y-8">
      {/* Summary callouts from page_config.reachSummary (fallback to counts) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6 md:gap-6 text-center">
        {summaryItems.map((s, i) => (
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
        {/* Fullscreen + Add buttons */}
        <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
          {isAuthenticated ? (
            <button
              type="button"
              onClick={() => {
                setAddPanelMode("node");
                setPickedLocation(null);
                setShowAddNode(true);
              }}
              title="Add a place to the map"
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border border-primary/30 bg-card/80 backdrop-blur-sm text-primary hover:bg-primary/10 transition"
            >
              <Plus size={12} /> Add to map
            </button>
          ) : (
            <Link
              href={`/sign-in?slug=${slug}&intent=map`}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border border-border/30 bg-card/80 backdrop-blur-sm text-muted-foreground hover:text-foreground transition"
            >
              <Plus size={12} /> Add to map
            </Link>
          )}
          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            className="p-1.5 rounded-full border border-border/30 bg-card/80 backdrop-blur-sm text-muted-foreground hover:text-foreground transition"
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>

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
                    stroke={isActive ? categoryColor(selectedLive!.category) : "#B47C34"}
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
                const color = categoryColor(n.category);
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
                      (!isMobile && (n.category === "project" || n.category === "team"))) && (
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
            addMode={showAddNode && addPanelMode === "node"}
            onHover={setHovered}
            onSelect={(id) => {
              const p = mapPlotted.find((m) => m.node.id === id);
              if (p) setSelected({ id, x: p.x, y: p.y, radius: p.radius });
            }}
            onLayout={setMapPlotted}
            onPickLocation={(lat, lng) => {
              setPickedLocation({ lat, lng });
            }}
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
              ? "Click any place to explore"
              : "Click any point to explore"}
          </div>
        )}

        {/* Legend */}
        <div className="absolute top-3 left-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] md:text-xs" style={{ maxWidth: "60%" }}>
          {(view === "map"
            ? Array.from(new Set(mapPlotted.map((p) => p.node.category)))
            : presentCategories
          ).map((k) => (
            <div key={k} className="flex items-center gap-1.5 text-muted-foreground">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: categoryColor(k) }}
              />
              <span className="capitalize">{categoryLabel(k)}</span>
            </div>
          ))}
        </div>

        {/* Marker popover */}
        <AnimatePresence>
          {selectedLive && (
            <NodeMarker
              key={`${view}-${selectedLive.id}`}
              node={selectedLive}
              slug={slug}
              size={size}
              nodeTributes={(messages ?? []).filter((m) => m.nodeId === selectedLive.id)}
              onClose={() => setSelected(null)}
            />
          )}
        </AnimatePresence>

        {/* Add panel (place or connection) */}
        <AnimatePresence>
          {showAddNode && (
            <AddPanel
              slug={slug}
              nodes={data.nodes}
              onClose={() => {
                setShowAddNode(false);
                setPickedLocation(null);
                setAddPanelMode("node");
              }}
              presetLat={pickedLocation?.lat}
              presetLng={pickedLocation?.lng}
              onClearLocation={() => setPickedLocation(null)}
              onModeChange={setAddPanelMode}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function NodeMarker({
  node,
  slug,
  size,
  nodeTributes,
  onClose,
}: {
  node: PositionedNode;
  slug: string;
  size: { w: number; h: number };
  nodeTributes: Message[];
  onClose: () => void;
}) {
  const [recording, setRecording] = useState(false);
  const hasTributes = nodeTributes.length > 0;
  const cardW = recording ? 360 : 320;
  const cardH = recording ? 460 : hasTributes ? 300 + nodeTributes.length * 36 : 240;
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
            {categoryLabel(node.category)}
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
      <div className="px-4 py-3">
        {recording ? (
          <InlineVideoRecorder
            slug={slug}
            defaultLocation={defaultLocation}
            contextLabel={node.label}
            onCancel={() => setRecording(false)}
            onSaved={() => {
              setRecording(false);
            }}
          />
        ) : (
          <div className="space-y-3">
            {/* Tributes attached to this node */}
            {hasTributes ? (
              <div className="space-y-1.5">
                <div className="text-[10px] tracking-widest uppercase text-muted-foreground">Memories from here</div>
                {nodeTributes.map((t) => (
                  <Link
                    key={t.id}
                    href={`/${slug}/tribute/${t.id}`}
                    className="flex items-center gap-2 text-xs text-foreground hover:text-primary transition truncate"
                  >
                    <Play size={10} className="shrink-0 text-primary/60" />
                    <span className="truncate">{t.authorName}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No memories yet from this place.</p>
            )}
            {/* Add affordances */}
            <div className="pt-1 space-y-2 border-t border-border/30">
              <Link
                href={`/${slug}/compose?node=${node.id}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <Play size={12} /> Share a memory from here →
              </Link>
              <button
                type="button"
                onClick={() => setRecording(true)}
                className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-medium text-primary hover:bg-primary/5 rounded-md py-2 border border-dashed border-primary/30"
              >
                <Plus size={12} /> Record a video tribute here
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
