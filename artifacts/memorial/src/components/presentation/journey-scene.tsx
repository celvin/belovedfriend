import { useEffect, useMemo, useRef, useState } from "react";
import { geoNaturalEarth1, geoPath, type GeoPermissibleObjects } from "d3-geo";
import { feature } from "topojson-client";
import { motion } from "framer-motion";
import { Starfield } from "@/components/starfield";

type AnyFeature = { type: "Feature"; geometry: unknown };
let cachedFeatures: AnyFeature[] | null = null;
function loadWorld(): Promise<AnyFeature[]> {
  if (cachedFeatures) return Promise.resolve(cachedFeatures);
  return fetch("/countries-110m.json")
    .then((r) => r.json())
    .then((topo: { objects?: { countries?: unknown } }) => {
      const fc = feature(topo as never, (topo.objects as { countries: never }).countries) as unknown as {
        features: AnyFeature[];
      };
      cachedFeatures = fc.features;
      return fc.features;
    });
}

interface NodeLite { id: number; label: string; lat?: number | null; lng?: number | null }
interface EdgeLite { sourceNodeId: number; targetNodeId: number }
interface Segment { sx: number; sy: number; tx: number; ty: number; label: string }

interface Props {
  nodes: NodeLite[];
  edges: EdgeLite[];
  width: number;
  height: number;
  accent: string;
  /** Total time the journey scene is on screen — the plane is paced to fit it. */
  durationMs?: number;
  reduceMotion?: boolean;
}

const MAX_FALLBACK_SEGMENTS = 14;

export function JourneyScene({ nodes, edges, width, height, accent, durationMs = 13000, reduceMotion = false }: Props) {
  const [features, setFeatures] = useState<AnyFeature[] | null>(cachedFeatures);
  useEffect(() => {
    if (!features) loadWorld().then(setFeatures).catch(() => {});
  }, [features]);

  const projection = useMemo(
    () => geoNaturalEarth1().scale((width / 6.4) * 1.05).translate([width / 2, height / 2 - 10]),
    [width, height],
  );
  const pathGen = useMemo(() => geoPath(projection), [projection]);

  const plotted = useMemo(() => {
    const m = new Map<number, { x: number; y: number; label: string }>();
    for (const n of nodes) {
      if (typeof n.lat === "number" && typeof n.lng === "number") {
        const p = projection([n.lng, n.lat]);
        if (p) m.set(n.id, { x: p[0], y: p[1], label: n.label });
      }
    }
    return m;
  }, [nodes, projection]);

  // Flight path: prefer real edges; fall back to chaining plotted markers.
  const segments = useMemo<Segment[]>(() => {
    const segs: Segment[] = [];
    const valid = edges.filter((e) => plotted.has(e.sourceNodeId) && plotted.has(e.targetNodeId));
    if (valid.length) {
      for (const e of valid) {
        const s = plotted.get(e.sourceNodeId)!;
        const t = plotted.get(e.targetNodeId)!;
        segs.push({ sx: s.x, sy: s.y, tx: t.x, ty: t.y, label: t.label });
      }
    } else {
      const pts = Array.from(plotted.values()).slice(0, MAX_FALLBACK_SEGMENTS + 1);
      for (let i = 0; i < pts.length - 1; i++) {
        segs.push({ sx: pts[i].x, sy: pts[i].y, tx: pts[i + 1].x, ty: pts[i + 1].y, label: pts[i + 1].label });
      }
    }
    return segs;
  }, [edges, plotted]);

  // Pace the plane so the whole tour fits the scene's on-screen time.
  const perSegmentMs = segments.length ? Math.max(700, durationMs / segments.length) : durationMs;

  // Animate the plane across segments via requestAnimationFrame.
  const [seg, setSeg] = useState(0);
  const [t, setT] = useState(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!segments.length) return;
    let startTs: number | null = null;
    let cur = 0;
    setSeg(0);
    setT(0);
    const tick = (now: number) => {
      if (startTs === null) startTs = now;
      let localT = (now - startTs) / perSegmentMs;
      if (localT >= 1) {
        if (cur >= segments.length - 1) {
          setSeg(cur);
          setT(1);
          return; // reached the end; hold
        }
        cur += 1;
        startTs = now;
        localT = 0;
      }
      setSeg(cur);
      setT(Math.min(localT, 1));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [segments, perSegmentMs]);

  const active = segments[seg];
  let plane: { x: number; y: number; angle: number } | null = null;
  if (active) {
    const mx = (active.sx + active.tx) / 2;
    const my = (active.sy + active.ty) / 2 - 40;
    const u = 1 - t;
    const x = u * u * active.sx + 2 * u * t * mx + t * t * active.tx;
    const y = u * u * active.sy + 2 * u * t * my + t * t * active.ty;
    const dx = 2 * u * (mx - active.sx) + 2 * t * (active.tx - mx);
    const dy = 2 * u * (my - active.sy) + 2 * t * (active.ty - my);
    plane = { x, y, angle: (Math.atan2(dy, dx) * 180) / Math.PI };
  }

  return (
    <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, #0d1018, #070809)" }}>
      <Starfield count={70} />
      <motion.svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="absolute inset-0 h-full w-full"
        initial={{ scale: reduceMotion ? 1 : 1.04 }}
        animate={{ scale: reduceMotion ? 1 : 1.14 }}
        transition={{ duration: 16, ease: "linear" }}
        style={{ transformOrigin: "50% 50%" }}
      >
        {features && (
          <g>
            {features.map((f, i) => {
              const d = pathGen(f as GeoPermissibleObjects);
              if (!d) return null;
              return (
                <path key={i} d={d} fill="#4a3a25" fillOpacity={0.92} stroke="#caa05f" strokeOpacity={0.3} strokeWidth={0.5} />
              );
            })}
          </g>
        )}

        {/* Trails up to and including the active segment */}
        <g>
          {segments.map((s, i) => {
            if (i > seg) return null;
            const mx = (s.sx + s.tx) / 2;
            const my = (s.sy + s.ty) / 2 - 40;
            const isActive = i === seg;
            return (
              <path
                key={i}
                d={`M ${s.sx} ${s.sy} Q ${mx} ${my} ${s.tx} ${s.ty}`}
                fill="none"
                stroke={accent}
                strokeOpacity={isActive ? 0.85 : 0.5}
                strokeWidth={1.4}
                strokeDasharray={isActive ? "4 4" : undefined}
              />
            );
          })}
        </g>

        {/* Markers */}
        <g>
          {Array.from(plotted.values()).map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={2.6} fill={accent} opacity={0.85} />
          ))}
        </g>

        {/* The traveling craft */}
        {plane && (
          <g transform={`translate(${plane.x},${plane.y}) rotate(${plane.angle})`}>
            <circle r={7} fill={accent} opacity={0.25} />
            <path d="M 9 0 L -7 -6 L -2 0 L -7 6 Z" fill="#fffaf0" stroke={accent} strokeWidth={0.6} />
          </g>
        )}

        {/* Active destination label */}
        {active && (
          <text x={active.tx} y={active.ty - 10} textAnchor="middle" fontSize={12} fill="#fffaf0" opacity={0.9} fontFamily="Inter, sans-serif">
            {active.label}
          </text>
        )}
      </motion.svg>
    </div>
  );
}
