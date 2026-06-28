import { PALETTE } from "@/components/presentation/constants";

interface Props {
  count?: number;
  className?: string;
  color?: string;
}

/**
 * A faint, slowly twinkling star field. Positions are derived deterministically
 * from the index (no Math.random) so renders are stable. Scales to fill its
 * positioned parent via an SVG viewBox + slice.
 */
export function Starfield({ count = 90, className = "", color = PALETTE.star }: Props) {
  const stars = Array.from({ length: count }, (_, i) => ({
    i,
    x: (i * 73 + 13) % 100,
    y: (i * 137 + 31) % 100,
    r: 0.4 + ((i * 29) % 10) / 10, // 0.4..1.3
    delay: ((i * 53) % 60) / 10, // 0..6s
    dur: 2.5 + ((i * 41) % 40) / 10, // 2.5..6.4s
  }));
  return (
    <svg
      className={`absolute inset-0 h-full w-full pointer-events-none ${className}`}
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {stars.map((s) => (
        <circle
          key={s.i}
          cx={s.x}
          cy={s.y}
          r={s.r / 10}
          fill={color}
          style={{ animation: `twinkle ${s.dur}s ease-in-out ${s.delay}s infinite` }}
        />
      ))}
    </svg>
  );
}
