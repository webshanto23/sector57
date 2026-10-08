import type { ArtScene } from "@s57/shared";
import { cn } from "cn";
import type { ReactNode } from "react";

// Port of the mockup's `art()` illustrations: flat SVG scenes coloured by the
// --art-* tokens, so they follow light and dark mode. They stand in for photos
// until uploads exist. The mockup's `--accent` is our `--accent-brand`.

const W = 320;
const ACCENT = "var(--accent-brand)";

/** The mockup's seeded random numbers, so a scene always draws the same way. */
function seeded(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function buildings(random: () => number, x0: number, x1: number, base: number, maxHeight: number): ReactNode[] {
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
  return shapes;
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

const Sun = ({ x, y, r = 18 }: { x: number; y: number; r?: number }) => (
  <circle cx={x} cy={y} r={r} fill="var(--sun)" opacity={0.9} />
);

function scene(kind: ArtScene, random: () => number, H: number): ReactNode {
  const g = H - 34;
  const ground = <rect y={g} width={W} height={H - g} fill="var(--art-ground)" />;

  switch (kind) {
    case "lake":
      return (
        <>
          <Sun x={240} y={52} r={22} />
          {buildings(random, 0, W, g - 14, 70)}
          <rect y={g - 14} width={W} height={H - g + 14} fill="var(--art-water)" />
          {Array.from({ length: 6 }, (_, i) => (
            <path key={i} d={`M${20 + i * 52} ${g + 4 + (i % 2) * 10}h22`} stroke="var(--art-win)" strokeWidth={2} strokeLinecap="round" opacity={0.7} />
          ))}
          <path d={`M120 ${g + 14}h64l-10 10h-44z`} fill="var(--terra)" />
          <path d={`M152 ${g + 14}v-30l22 26z`} fill="var(--art-win)" stroke="var(--art-ink)" strokeWidth={1} />
          <path d={`M128 ${g + 24}q24 6 48 0`} stroke="var(--art-ink)" strokeWidth={1.2} fill="none" opacity={0.5} />
          <Tree x={14} y={g - 24} s={1.1} />
          <Tree x={300} y={g - 26} s={1.2} />
        </>
      );
    case "road":
      return (
        <>
          {buildings(random, 0, W, g, 50)}
          {ground}
          <path d={`M110 ${H}L150 ${g}h20L210 ${H}z`} fill="var(--art-ink)" opacity={0.75} />
          {Array.from({ length: 4 }, (_, i) => (
            <rect key={i} x={158} y={g + 4 + i * 9} width={4} height={4 + i} fill="var(--art-win)" />
          ))}
          <Tree x={50} y={g + 2} />
          <Tree x={270} y={g + 4} s={1.1} />
          <rect x={226} y={g + 6} width={34} height={14} rx={3} fill="var(--warn)" />
          <circle cx={234} cy={g + 22} r={4} fill="var(--art-ink)" />
          <circle cx={252} cy={g + 22} r={4} fill="var(--art-ink)" />
        </>
      );
    case "cctv":
      return (
        <>
          {buildings(random, 0, W, g, 60)}
          {ground}
          <rect x={200} y={g - 90} width={5} height={90} fill="var(--art-ink)" />
          <path d={`M203 ${g - 86}h34`} stroke="var(--art-ink)" strokeWidth={4} />
          <rect x={226} y={g - 84} width={30} height={14} rx={3} fill="var(--art-win)" stroke="var(--art-ink)" strokeWidth={2} />
          <circle cx={252} cy={g - 77} r={3} fill="var(--sun)" />
          <path d={`M256 ${g - 74}l40 50h-60z`} fill="var(--warn)" opacity={0.18} />
          <Tree x={60} y={g + 2} />
        </>
      );
    case "field":
    case "sports":
      return (
        <>
          <Sun x={60} y={46} r={16} />
          {buildings(random, 120, W, g - 20, 40)}
          <rect y={g - 20} width={W} height={H - g + 20} fill="var(--art-tree)" opacity={0.55} />
          <ellipse cx={160} cy={g + 6} rx={120} ry={20} fill="none" stroke="var(--art-win)" strokeWidth={3} opacity={0.8} />
          <path d={`M40 ${g + 6}v-26h30v26`} fill="none" stroke="var(--art-win)" strokeWidth={3} />
          {kind === "sports" ? (
            <>
              <path d={`M250 ${g - 50}v50`} stroke="var(--art-ink)" strokeWidth={2} />
              <rect x={251} y={g - 50} width={34} height={21} fill={ACCENT} />
              <circle cx={266} cy={g - 39.5} r={6.5} fill="var(--sun)" />
            </>
          ) : null}
        </>
      );
    case "mosque":
      return (
        <>
          <Sun x={70} y={50} r={16} />
          {ground}
          <rect x={100} y={g - 60} width={120} height={60} fill="var(--art-win)" stroke="var(--art-b2)" strokeWidth={2} />
          <path d={`M125 ${g - 60}a35 35 0 0 1 70 0z`} fill={ACCENT} />
          <rect x={157} y={g - 108} width={6} height={16} fill="var(--warn)" />
          <rect x={82} y={g - 100} width={14} height={100} fill="var(--art-b2)" />
          <path d={`M82 ${g - 100}l7 -16 7 16z`} fill={ACCENT} />
          <rect x={224} y={g - 100} width={14} height={100} fill="var(--art-b2)" />
          <path d={`M224 ${g - 100}l7 -16 7 16z`} fill={ACCENT} />
          {Array.from({ length: 3 }, (_, i) => (
            <path key={i} d={`M${128 + i * 26} ${g}v-22a8 8 0 0 1 16 0v22z`} fill="var(--art-b1)" />
          ))}
          <Tree x={30} y={g + 2} />
          <Tree x={290} y={g + 2} s={1.1} />
        </>
      );
    case "trees":
      return (
        <>
          <Sun x={250} y={48} r={16} />
          {ground}
          {Array.from({ length: 7 }, (_, i) => (
            <Tree key={i} x={26 + i * 45} y={g - 6 + (i % 2) * 10} s={0.7 + random() * 0.5} />
          ))}
          <path d={`M0 ${g + 22}h${W}`} stroke="var(--terra)" strokeWidth={3} strokeDasharray="6 6" opacity={0.6} />
        </>
      );
    case "boishakh": {
      const colours = ["var(--sun)", "var(--art-win)", "var(--warn)", ACCENT];
      return (
        <>
          <Sun x={160} y={70} r={30} />
          {ground}
          {[0, 1].map((row) => {
            const y = 18 + row * 30;
            return (
              <g key={row}>
                <path d={`M0 ${y}q160 22 ${W} 0`} stroke="var(--art-ink)" fill="none" strokeWidth={1} />
                {Array.from({ length: 14 }, (_, i) => {
                  const x = 6 + i * 23;
                  const yy = y + Math.sin((i / 13) * Math.PI) * 11;
                  return <path key={i} d={`M${x} ${yy}h16l-8 13z`} fill={colours[(i + row) % 4]} />;
                })}
              </g>
            );
          })}
          <g transform={`translate(160 ${g + 16})`} fill="none" stroke="var(--art-win)" strokeWidth={2}>
            <ellipse rx={70} ry={12} />
            <ellipse rx={46} ry={8} />
            <ellipse rx={22} ry={4} stroke="var(--sun)" />
          </g>
        </>
      );
    }
    case "meeting":
      return (
        <>
          {ground}
          <rect x={40} y={26} width={240} height={g - 40} rx={4} fill="var(--art-b1)" />
          <rect x={120} y={40} width={80} height={40} rx={3} fill={ACCENT} />
          <path d="M130 52h60M130 62h40" stroke="var(--on-accent)" strokeWidth={3} strokeLinecap="round" />
          {[0, 1, 2].flatMap((row) =>
            Array.from({ length: 9 }, (_, i) => (
              <circle
                key={`${row}-${i}`}
                cx={50 + i * 28 + (row % 2) * 14}
                cy={g - 10 + row * 12}
                r={6}
                fill="var(--art-ink)"
                opacity={0.45 + row * 0.2}
              />
            )),
          )}
        </>
      );
    case "art":
      return (
        <>
          {ground}
          <Sun x={60} y={50} r={14} />
          <path d={`M150 ${g + 10}l20 -110 20 110M170 ${g - 100}v120`} stroke="var(--terra)" strokeWidth={4} fill="none" />
          <rect x={128} y={g - 96} width={84} height={62} fill="var(--art-win)" stroke="var(--art-ink)" strokeWidth={2} />
          <circle cx={152} cy={g - 70} r={10} fill="var(--sun)" />
          <path d={`M134 ${g - 40}q30 -26 72 -8`} stroke={ACCENT} strokeWidth={5} fill="none" />
          <Tree x={260} y={g + 2} />
          <Tree x={40} y={g + 4} s={0.8} />
        </>
      );
    case "drain":
      return (
        <>
          {buildings(random, 0, W, g, 40)}
          {ground}
          <rect x={40} y={g + 6} width={240} height={18} rx={9} fill="var(--art-water)" stroke="var(--art-ink)" strokeWidth={1.5} />
          {Array.from({ length: 7 }, (_, i) => (
            <path key={i} d={`M${60 + i * 32} ${g + 10}v10`} stroke="var(--art-ink)" strokeWidth={2} />
          ))}
        </>
      );
    case "hall":
      return (
        <>
          {ground}
          <rect x={60} y={g - 80} width={200} height={80} fill="var(--art-b1)" />
          <path d={`M50 ${g - 80}h220l-110 -34z`} fill="var(--terra)" />
          {Array.from({ length: 5 }, (_, i) => (
            <rect key={i} x={78 + i * 36} y={g - 62} width={16} height={62} fill="var(--art-win)" />
          ))}
          <Tree x={28} y={g + 2} />
          <Tree x={292} y={g + 2} />
        </>
      );
  }
}

/** Mockup `art(kind, seed, ratio)`: a placeholder illustration in the given aspect ratio. */
export function Art({
  scene: kind,
  seed = 3,
  ratio = [16, 10],
  label,
  className,
}: {
  scene: ArtScene;
  seed?: number;
  ratio?: [number, number];
  /** Accessible description; omit when the picture is decorative. */
  label?: string;
  className?: string;
}) {
  const H = Math.round((W * ratio[1]) / ratio[0]);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      className={cn("block h-auto w-full max-w-full bg-[var(--art-sky)]", className)}
    >
      <rect width={W} height={H} fill="var(--art-sky)" />
      {scene(kind, seeded(seed), H)}
    </svg>
  );
}

/** Scenes that suit gallery placeholders, picked by a stable hash so an album always gets the same one. */
const GALLERY_SCENES: ArtScene[] = ["boishakh", "sports", "meeting", "trees", "mosque", "art", "lake", "hall"];

export function sceneFor(id: string): { scene: ArtScene; seed: number } {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return { scene: GALLERY_SCENES[hash % GALLERY_SCENES.length]!, seed: (hash % 9) + 2 };
}
