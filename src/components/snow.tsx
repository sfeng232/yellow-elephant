import type { CSSProperties } from "react";

const FLAKE_COUNT = 50;
const SHAPES = ["❄", "❅", "❆", "•"];

/** Deterministic 0–1 "random" from an index, so server and client render identical snow. */
const noise = (i: number, salt: number) => {
  // Integer hash: gives bit-identical results in every JS engine (unlike Math.sin).
  let h = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 13;
  return Math.round(((h >>> 0) / 4294967296) * 1000) / 1000;
};

/** A gentle snowfall behind everything. Pure CSS, and hidden for reduced-motion users. */
export function Snow() {
  const flakes = Array.from({ length: FLAKE_COUNT }, (_, i) => {
    const duration = 9 + noise(i, 3) * 16; // 9–25s to fall
    return {
      shape: SHAPES[Math.floor(noise(i, 1) * SHAPES.length)],
      // One flake per slice of the screen width (jittered), so the whole width gets snow.
      left: ((i + noise(i, 2)) / FLAKE_COUNT) * 100,
      size: 8 + noise(i, 4) * 18, // 8–26px
      duration,
      delay: -noise(i, 5) * duration, // start mid-fall so the screen is snowy straight away
      drift: (noise(i, 6) - 0.5) * 80, // sway up to ±40px
      opacity: 0.1 + noise(i, 7) * 0.18,
    };
  });

  return (
    <div aria-hidden>
      {flakes.map((f, i) => (
        <span
          key={i}
          className="snowflake"
          style={
            {
              left: `${f.left}%`,
              fontSize: f.size,
              opacity: f.opacity,
              animationDuration: `${f.duration}s`,
              animationDelay: `${f.delay}s`,
              "--drift": `${f.drift}px`,
            } as CSSProperties
          }
        >
          {f.shape}
        </span>
      ))}
    </div>
  );
}
