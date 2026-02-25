"use client";

import { useEffect, useRef } from "react";

export default function ParticleBg() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let particles: Array<{ x: number; y: number; r: number; vx: number; vy: number; a: number }> = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = "100vw";
      canvas.style.height = "100vh";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.max(18, Math.min(42, Math.floor(window.innerWidth / 42)));
      particles = Array.from({ length: count }).map(() => ({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: Math.random() * 2.4 + 0.8,
        vx: (Math.random() - 0.5) * 0.18,
        vy: -(Math.random() * 0.22 + 0.04),
        a: Math.random() * 0.35 + 0.08,
      }));
    };

    const render = () => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      const g1 = ctx.createRadialGradient(180, 120, 0, 180, 120, 520);
      g1.addColorStop(0, "rgba(18,140,126,0.10)");
      g1.addColorStop(1, "rgba(18,140,126,0)");
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

      const g2 = ctx.createRadialGradient(window.innerWidth - 120, 180, 0, window.innerWidth - 120, 180, 420);
      g2.addColorStop(0, "rgba(6,182,212,0.07)");
      g2.addColorStop(1, "rgba(6,182,212,0)");
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y < -8) {
          p.y = window.innerHeight + 8;
          p.x = Math.random() * window.innerWidth;
        }
        if (p.x < -8) p.x = window.innerWidth + 8;
        if (p.x > window.innerWidth + 8) p.x = -8;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(18,140,126,${p.a})`;
        ctx.fill();
      }

      raf = window.requestAnimationFrame(render);
    };

    const onResize = () => resize();
    resize();
    raf = window.requestAnimationFrame(render);
    window.addEventListener("resize", onResize);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 -z-20 overflow-hidden">
      <div className="absolute inset-0 wa-bg" />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full opacity-70" />
      <div className="absolute inset-0 wa-particle-overlay opacity-60" />
    </div>
  );
}
