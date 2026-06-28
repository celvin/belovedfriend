import { useEffect, useMemo, useRef, useState } from "react";
import { geoNaturalEarth1, geoPath, type GeoPermissibleObjects } from "d3-geo";
import { feature } from "topojson-client";
import type { ReachNode } from "@workspace/api-client-react";

const WORLD_TOPOJSON_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

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
  width: number;
  height: number;
  selectedId?: number | null;
  hoveredId?: number | null;
  compact?: boolean;
  onHover?: (id: number | null) => void;
  onSelect?: (id: number) => void;
  onLayout?: (plotted: PlottedNode[]) => void;
}

export function WorldMap({
  nodes,
  width,
  height,
  selectedId,
  hoveredId,
  compact = false,
  onHover,
  onSelect,
  onLayout,
}: Props) {
  const [features, setFeatures] = useState<AnyFeature[] | null>(cachedFeatures);
  const [loadError, setLoadError] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const onLayoutRef = useRef(onLayout);
  onLayoutRef.current = onLayout;

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

  const isReady = !!features;

  return (
    <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${width} ${height}`}>
      {/* Ocean / background */}
      <rect x={0} y={0} width={width} height={height} fill="transparent" />

      {/* Graticule-like subtle equator */}
      <line
        x1={0}
        y1={height / 2 - 10}
        x2={width}
        y2={height / 2 - 10}
        stroke="#B47C34"
        strokeOpacity={0.08}
        strokeDasharray="2 4"
      />

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
                strokeWidth={0.5}
              />
            );
          })}
        </g>
      )}

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
                  strokeWidth={0.8}
                  strokeDasharray="3 3"
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
                <circle r={p.radius + 8} fill={color} opacity={isSel ? 0.2 : isHov ? 0.14 : 0.06} />
                <circle r={p.radius + 4} fill={color} opacity={isSel ? 0.3 : 0.14} />
                <circle r={p.radius} fill={color} stroke="#fffaf0" strokeWidth={isSel ? 2 : 1} />
                {(isHov || isSel || (!compact && p.node.category === "wonder")) && (
                  <text
                    x={p.radius + 6}
                    y={4}
                    fontSize={isSel ? 12 : 10}
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
    </svg>
  );
}
