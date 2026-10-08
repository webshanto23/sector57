import { cn } from "cn";
import type { ReactNode } from "react";

// Port of the mockup's `art()` illustrations: flat SVG scenes coloured by the
// --art-* tokens, so they follow light and dark mode. Only the scenes in use are ported.

/** The mockup's seeded random numbers, so a scene always draws the same skyline. */
function seeded(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function Buildings({ random, x0, x1, base, maxHeight }: { random: () => number; x0: number; x1: number; base: number; maxHeight: number }) {
  const shapes: ReactNode[] = [];
  let x = x0;
  while (x < x1) {
    const w = 26 + random() * 30;
    const h = 40 + random() * maxHeight;
    const fill = random() > 0.5 ? "var(--art-b1)" : "var(--art-b2)";
    shapes.push(<rect key={`b${x}`} x={x} y={base - h} width={w} height={h} fill={fill} />);
    for (let wy = base - h + 8; wy < base - 10; wy += 12) {
      for (let wx = x + 5; wx < x + w - 7; wx += 9) {
        shapes.push(<rect key={`w${wx}-${wy}`} x={wx} y={wy} width={4} height={6} fill="var(--art-win)" opacity={0.9} />);
      }
    }
    x += w + 3;
  }
  return <>{shapes}</>;
}

function Tree({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <>
      <rect x={x - 1.5 * s} y={y} width={3 * s} height={12 * s} fill="var(--art-ink)" opacity={0.6} />
      <circle cx={x} cy={y - 2 * s} r={11 * s} fill="var(--art-tree)" />
      <circle cx={x + 7 * s} cy={y + 3 * s} r={7 * s} fill="var(--art-tree)" opacity={0.85} />
    </>
  );
}

/** Mockup `art('lake', seed, ratio)`: skyline across the lake with a boat. */
export function LakeArt({
  seed = 7,
  ratio = [4, 3],
  label,
  className,
}: {
  seed?: number;
  ratio?: [number, number];
  label: string;
  className?: string;
}) {
  const W = 320;
  const H = Math.round((W * ratio[1]) / ratio[0]);
  const g = H - 34;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMid slice"
      className={cn("block h-auto w-full max-w-full bg-[var(--art-sky)]", className)}
    >
      <rect width={W} height={H} fill="var(--art-sky)" />
      <circle cx={240} cy={52} r={22} fill="var(--sun)" opacity={0.9} />
      <Buildings random={seeded(seed)} x0={0} x1={W} base={g - 14} maxHeight={70} />
      <rect y={g - 14} width={W} height={H - g + 14} fill="var(--art-water)" />
      {Array.from({ length: 6 }, (_, i) => (
        <path
          key={i}
          d={`M${20 + i * 52} ${g + 4 + (i % 2) * 10}h22`}
          stroke="var(--art-win)"
          strokeWidth={2}
          strokeLinecap="round"
          opacity={0.7}
        />
      ))}
      <path d={`M120 ${g + 14}h64l-10 10h-44z`} fill="var(--terra)" />
      <path d={`M152 ${g + 14}v-30l22 26z`} fill="var(--art-win)" stroke="var(--art-ink)" strokeWidth={1} />
      <path d={`M128 ${g + 24}q24 6 48 0`} stroke="var(--art-ink)" strokeWidth={1.2} fill="none" opacity={0.5} />
      <Tree x={14} y={g - 24} s={1.1} />
      <Tree x={300} y={g - 26} s={1.2} />
    </svg>
  );
}
