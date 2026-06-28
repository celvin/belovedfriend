import { useEffect, useMemo, useRef, useState } from "react";
import { geoNaturalEarth1, geoPath, type GeoPermissibleObjects } from "d3-geo";
import { select } from "d3-selection";
import { zoom, zoomIdentity, type ZoomTransform } from "d3-zoom";
import { pointer } from "d3-selection";
import { feature } from "topojson-client";
import type { ReachNode } from "@workspace/api-client-react";

// Served from the app's own origin (artifacts/memorial/public/) — no external
// CDN dependency, works offline, and avoids CSP/CDN-availability risk.
const WORLD_TOPOJSON_URL = "/countries-110m.json";

type AnyFeature = { type: "Feature"; geometry: unknown; properties?: unknown };

let cachedFeatures: AnyFeature[] | null = null;
let inFlight: Promise<AnyFeature[]> | null = null;

function loadWorld(): Promise<AnyFeature[]> {
  if (cachedFeatures) return Promise.resolve(cachedFeatures);
  if (inFlight) return inFlight;
  inFlight = fetch(WORLD_TOPOJSON_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`World map fetch failed: ${r.status}`);
      return r.json();
    })
    .then((topo: any) => {
      if (!topo?.objects?.countries) throw new Error("Malformed topojson");
      const fc = feature(topo, topo.objects.countries) as unknown as {
        features: AnyFeature[];
      };
      cachedFeatures = fc.features;
      return fc.features;
    })
    .catch((err) => {
      inFlight = null;
      throw err;
    });
  return inFlight;
}

const DEFAULT_COLOR = "#8A7A5A";
const KNOWN_COLORS: Record<string, string> = {
  project: "#B47C34",
  city: "#7A4A1F",
  agency: "#4A6B4A",
  community: "#9A4B22",
  team: "#2B556B",
  wonder: "#A03A6B",
};

function categoryColor(cat: string): string {
  return KNOWN_COLORS[cat] ?? DEFAULT_COLOR;
}

export interface PlottedNode {
  node: ReachNode;
  x: number;
  y: number;
  radius: number;
}

interface Props {
  nodes: ReachNode[];
  edges?: { sourceNodeId: number; targetNodeId: number }[];
  width: number;
  height: number;
  selectedId?: number | null;
  hoveredId?: number | null;
  compact?: boolean;
  addMode?: boolean;
  onHover?: (id: number | null) => void;
  onSelect?: (id: number) => void;
  onLayout?: (plotted: PlottedNode[]) => void;
  onPickLocation?: (lat: number, lng: number) => void;
}

export function WorldMap({
  nodes,
  edges = [],
  width,
  height,
  selectedId,
  hoveredId,
  compact = false,
  addMode = false,
  onHover,
  onSelect,
  onLayout,
  onPickLocation,
}: Props) {
  const [features, setFeatures] = useState<AnyFeature[] | null>(cachedFeatures);
  const [loadError, setLoadError] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const onLayoutRef = useRef(onLayout);
  onLayoutRef.current = onLayout;
  const svgRef = useRef<SVGSVGElement>(null);
  // Keep a stable ref to the zoom behavior so buttons can call it
  const zoomBehaviorRef = useRef<ReturnType<typeof zoom> | null>(null);

  useEffect(() => {
    if (features) return;
    let cancelled = false;
    setLoadError(false);
    loadWorld()
      .then((f) => {
        if (!cancelled) setFeatures(f);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [features, retryNonce]);

  // Wire d3-zoom onto the SVG element
  useEffect(() => {
    if (!svgRef.current) return;
    const svgEl = svgRef.current;

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 12])
      // Allow a little finger jitter so a tap still registers as a click
      // (without this, d3-zoom's default clickDistance of 0 swallows touch taps).
      .clickDistance(10)
      .on("zoom", (e) => {
        setTransform(e.transform);
      });

    zoomBehaviorRef.current = zoomBehavior;
    select(svgEl).call(zoomBehavior);

    return () => {
      select(svgEl).on(".zoom", null);
    };
  }, []);

  // While placing a pin, turn off double-click/tap zoom so a tap drops a pin
  // instead of zooming. Re-enable it when leaving placing mode.
  useEffect(() => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    const sel = select(svgRef.current);
    if (addMode) {
      sel.on("dblclick.zoom", null);
    } else {
      sel.call(zoomBehaviorRef.current);
    }
  }, [addMode]);

  const projection = useMemo(() => {
    return geoNaturalEarth1()
      .scale((width / 6.4) * 1.05)
      .translate([width / 2, height / 2 - 10]);
  }, [width, height]);

  const pathGen = useMemo(() => geoPath(projection), [projection]);

  const plotted = useMemo<PlottedNode[]>(() => {
    return nodes
      .filter((n) => typeof n.lat === "number" && typeof n.lng === "number")
      .map((n) => {
        const p = projection([n.lng as number, n.lat as number]);
        if (!p) return null;
        const radius =
          n.category === "wonder" ? 7 : n.category === "city" ? 5 : 4;
        return { node: n, x: p[0], y: p[1], radius };
      })
      .filter((v): v is PlottedNode => v !== null);
  }, [nodes, projection]);

  useEffect(() => {
    onLayoutRef.current?.(plotted);
  }, [plotted]);

  // Plotted position lookup by node id — used to draw connection lines.
  const posById = useMemo(() => {
    const m = new Map<number, PlottedNode>();
    for (const p of plotted) m.set(p.node.id, p);
    return m;
  }, [plotted]);

  const isReady = !!features;

  // Scale factor for point radii/strokes — keeps marks legible when zoomed
  const k = Math.max(1, transform.k);

  // Long-press (touch "hold") support + click-suppression so a hold doesn't
  // also fire the trailing click.
  const longPressTimer = useRef<number | null>(null);
  const suppressClick = useRef(false);

  // Convert an SVG-local point → lat/lng (undoing zoom + projection) and emit.
  function pickFromSvgPoint(px: number, py: number) {
    const [sx, sy] = transform.invert([px, py]);
    const ll = projection.invert?.([sx, sy]);
    if (!ll || !isFinite(ll[0]) || !isFinite(ll[1])) return;
    onPickLocation?.(ll[1], ll[0]);
  }

  // Tap / click to drop a pin.
  function handleBgClick(e: React.MouseEvent<SVGRectElement>) {
    if (!addMode || !svgRef.current) return;
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const [px, py] = pointer(e.nativeEvent, svgRef.current);
    pickFromSvgPoint(px, py);
  }

  // Press-and-hold to drop a pin (intuitive on touch, where a drag pans).
  function handleBgPointerDown(e: React.PointerEvent<SVGRectElement>) {
    if (!addMode || !svgRef.current) return;
    const [px, py] = pointer(e.nativeEvent, svgRef.current);
    const startX = e.clientX;
    const startY = e.clientY;
    const cancel = () => {
      if (longPressTimer.current != null) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", cancel);
      window.removeEventListener("pointercancel", cancel);
    };
    const onMove = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 10) cancel();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", cancel);
    window.addEventListener("pointercancel", cancel);
    longPressTimer.current = window.setTimeout(() => {
      pickFromSvgPoint(px, py);
      suppressClick.current = true; // swallow the click that follows release
      cancel();
    }, 450);
  }

  // Zoom control helpers
  function zoomIn() {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    select(svgRef.current).call(zoomBehaviorRef.current.scaleBy, 1.5);
  }
  function zoomOut() {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    select(svgRef.current).call(zoomBehaviorRef.current.scaleBy, 1 / 1.5);
  }
  function zoomReset() {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    select(svgRef.current).call(zoomBehaviorRef.current.transform, zoomIdentity);
  }

  return (
    <div className="absolute inset-0">
      <svg
        ref={svgRef}
        className="absolute inset-0 w-full h-full"
        viewBox={`0 0 ${width} ${height}`}
        style={{ cursor: addMode ? "crosshair" : "grab" }}
      >
        {/* Full-size background rect — catches pan gestures + location clicks */}
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="transparent"
          style={{ cursor: addMode ? "crosshair" : "inherit" }}
          onClick={handleBgClick}
          onPointerDown={handleBgPointerDown}
        />

        {/* Graticule-like subtle equator (outside the zoom group — static) */}
        <line
          x1={0}
          y1={height / 2 - 10}
          x2={width}
          y2={height / 2 - 10}
          stroke="#B47C34"
          strokeOpacity={0.08}
          strokeDasharray="2 4"
        />

        {/* All zoomable content. While placing a pin, ignore pointer events so
            clicks on a country fall through to the background rect (which
            converts the click position to lat/lng). */}
        <g
          transform={transform.toString()}
          style={{ pointerEvents: addMode ? "none" : undefined }}
        >
          {/* Countries */}
          {isReady && features && (
            <g>
              {features.map((f, i) => {
                const d = pathGen(f as GeoPermissibleObjects);
                if (!d) return null;
                return (
                  <path
                    key={i}
                    d={d}
                    fill="#E8DCC4"
                    fillOpacity={0.55}
                    stroke="#B47C34"
                    strokeOpacity={0.25}
                    strokeWidth={0.5 / k}
                  />
                );
              })}
            </g>
          )}

          {/* Soft arcs connecting wonders in travel order */}
          {isReady && (
            <g>
              {plotted
                .filter((p) => p.node.category === "wonder")
                .map((p, i, arr) => {
                  const next = arr[(i + 1) % arr.length];
                  if (!next || arr.length < 2) return null;
                  const mx = (p.x + next.x) / 2;
                  const my = (p.y + next.y) / 2 - 20;
                  return (
                    <path
                      key={`arc-${p.node.id}`}
                      d={`M ${p.x} ${p.y} Q ${mx} ${my} ${next.x} ${next.y}`}
                      fill="none"
                      stroke="#A03A6B"
                      strokeOpacity={0.25}
                      strokeWidth={0.8 / k}
                      strokeDasharray={`${3 / k} ${3 / k}`}
                    />
                  );
                })}
            </g>
          )}

          {/* Reach connections — actual edges between two places */}
          {isReady && edges.length > 0 && (
            <g>
              {edges.map((e, i) => {
                const s = posById.get(e.sourceNodeId);
                const t = posById.get(e.targetNodeId);
                if (!s || !t) return null;
                const mx = (s.x + t.x) / 2;
                const my = (s.y + t.y) / 2 - 22;
                return (
                  <path
                    key={`edge-${e.sourceNodeId}-${e.targetNodeId}-${i}`}
                    d={`M ${s.x} ${s.y} Q ${mx} ${my} ${t.x} ${t.y}`}
                    fill="none"
                    stroke="#7A4A1F"
                    strokeOpacity={0.45}
                    strokeWidth={1.1 / k}
                  />
                );
              })}
            </g>
          )}

          {/* Points */}
          {isReady && (
            <g>
              {plotted.map((p) => {
                const color = categoryColor(p.node.category);
                const isSel = selectedId === p.node.id;
                const isHov = hoveredId === p.node.id;
                const r = p.radius / k;
                return (
                  <g
                    key={p.node.id}
                    transform={`translate(${p.x},${p.y})`}
                    className="cursor-pointer focus:outline-none"
                    tabIndex={0}
                    role="button"
                    aria-label={`${p.node.label} — open tributes`}
                    aria-pressed={isSel}
                    onMouseEnter={() => onHover?.(p.node.id)}
                    onMouseLeave={() => onHover?.(null)}
                    onFocus={() => onHover?.(p.node.id)}
                    onBlur={() => onHover?.(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect?.(p.node.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        onSelect?.(p.node.id);
                      }
                    }}
                  >
                    <circle r={r + 8 / k} fill={color} opacity={isSel ? 0.2 : isHov ? 0.14 : 0.06} />
                    <circle r={r + 4 / k} fill={color} opacity={isSel ? 0.3 : 0.14} />
                    <circle r={r} fill={color} stroke="#fffaf0" strokeWidth={(isSel ? 2 : 1) / k} />
                    {(isHov || isSel || (!compact && p.node.category === "wonder")) && (
                      <text
                        x={r + 6 / k}
                        y={4 / k}
                        fontSize={(isSel ? 12 : 10) / k}
                        fontFamily="Inter, sans-serif"
                        fill="#3B2F1E"
                        style={{ pointerEvents: "none" }}
                      >
                        {p.node.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          )}
        </g>

        {/* Loading / error states — rendered outside zoom group so they stay centered */}
        {!isReady && !loadError && (
          <text
            x={width / 2}
            y={height / 2}
            textAnchor="middle"
            fontFamily="serif"
            fontStyle="italic"
            fill="#8a7a5a"
            fontSize={14}
          >
            Drawing the world…
          </text>
        )}

        {loadError && (
          <>
            <text
              x={width / 2}
              y={height / 2 - 10}
              textAnchor="middle"
              fontFamily="serif"
              fontStyle="italic"
              fill="#8a7a5a"
              fontSize={14}
            >
              Map unavailable
            </text>
            <g
              transform={`translate(${width / 2}, ${height / 2 + 14})`}
              className="cursor-pointer"
              tabIndex={0}
              role="button"
              aria-label="Retry loading map"
              onClick={() => setRetryNonce((n) => n + 1)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setRetryNonce((n) => n + 1);
                }
              }}
            >
              <rect x={-32} y={-10} width={64} height={20} rx={10} fill="#B47C34" fillOpacity={0.15} />
              <text textAnchor="middle" y={4} fontSize={11} fill="#7A4A1F">
                Retry
              </text>
            </g>
          </>
        )}

        {/* addMode hint */}
        {addMode && (
          <text
            x={width / 2}
            y={18}
            textAnchor="middle"
            fontFamily="Inter, sans-serif"
            fontSize={12}
            fill="#7A4A1F"
            fillOpacity={0.75}
            style={{ pointerEvents: "none" }}
          >
            Click anywhere to drop a pin
          </text>
        )}
      </svg>

      {/* Zoom controls — absolutely positioned, bottom-right */}
      <div
        style={{
          position: "absolute",
          bottom: 8,
          right: 8,
          display: "flex",
          flexDirection: "column",
          gap: 2,
          zIndex: 10,
        }}
      >
        <button
          type="button"
          aria-label="Zoom in"
          onClick={zoomIn}
          style={{
            width: 24,
            height: 24,
            background: "rgba(248,243,233,0.9)",
            border: "1px solid #B47C34",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 14,
            lineHeight: "22px",
            color: "#7A4A1F",
            padding: 0,
          }}
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          onClick={zoomOut}
          style={{
            width: 24,
            height: 24,
            background: "rgba(248,243,233,0.9)",
            border: "1px solid #B47C34",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 14,
            lineHeight: "22px",
            color: "#7A4A1F",
            padding: 0,
          }}
        >
          −
        </button>
        <button
          type="button"
          aria-label="Reset zoom"
          onClick={zoomReset}
          style={{
            width: 24,
            height: 24,
            background: "rgba(248,243,233,0.9)",
            border: "1px solid #B47C34",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 9,
            lineHeight: "22px",
            color: "#7A4A1F",
            padding: 0,
          }}
        >
          ⌂
        </button>
      </div>
    </div>
  );
}
