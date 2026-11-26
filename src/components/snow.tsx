/** A light, deterministic snowfall (no randomness, so it renders the same on server and client). */
export function Snow() {
  const flakes = Array.from({ length: 18 }, (_, i) => ({
    left: (i * 37 + 11) % 100,
    size: 10 + ((i * 7) % 14),
    duration: 14 + ((i * 5) % 12),
    delay: -((i * 3.7) % 20),
  }));
  return (
    <div aria-hidden>
      {flakes.map((f, i) => (
        <span
          key={i}
          className="snowflake"
          style={{ left: `${f.left}%`, fontSize: f.size, animationDuration: `${f.duration}s`, animationDelay: `${f.delay}s` }}
        >
          ❄
        </span>
      ))}
    </div>
  );
}
