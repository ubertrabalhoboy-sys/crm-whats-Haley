"use client";

type Particle = {
  left: string;
  top: string;
  size: string;
  opacity: number;
  duration: string;
  delay: string;
};

const PARTICLES: Particle[] = Array.from({ length: 28 }).map((_, i) => {
  // determinístico (sem Math.random) → evita mismatch de hidratação
  const left = `${(i * 37) % 100}%`;
  const top = `${(i * 23) % 100}%`;
  const size = `${8 + ((i * 7) % 14)}px`;
  const opacity = 0.18 + ((i % 6) * 0.06);
  const duration = `${7 + (i % 8)}s`;
  const delay = `${(i % 10) * 0.35}s`;

  return { left, top, size, opacity, duration, delay };
});

export default function PublicFx() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Light beams */}
      <div className="absolute inset-0">
        <div
          className="absolute -top-20 left-[-30%] h-[140%] w-[60%] opacity-0"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(255,255,255,0.22), rgba(249,115,22,0.15), transparent)",
            filter: "blur(18px)",
            transform: "rotate(-18deg)",
            animation: "beamSweep 9.5s ease-in-out infinite",
          }}
        />
        <div
          className="absolute -top-24 right-[-35%] h-[150%] w-[65%] opacity-0"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(255,255,255,0.16), rgba(59,130,246,0.10), transparent)",
            filter: "blur(20px)",
            transform: "rotate(14deg)",
            animation: "beamSweep2 12s ease-in-out infinite",
          }}
        />
      </div>

      {/* Particles */}
      <div className="absolute inset-0">
        {PARTICLES.map((p, idx) => (
          <span
            key={idx}
            className="absolute rounded-full"
            style={{
              left: p.left,
              top: p.top,
              width: p.size,
              height: p.size,
              background:
                "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.95), rgba(255,255,255,0.15))",
              opacity: p.opacity,
              filter: "blur(0.2px)",
              animation: `particleFloat ${p.duration} ease-in-out infinite`,
              animationDelay: p.delay,
            }}
          />
        ))}
      </div>

      {/* Subtle vignette */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/0 to-black/45" />
    </div>
  );
}