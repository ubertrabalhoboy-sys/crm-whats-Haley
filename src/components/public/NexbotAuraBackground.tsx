"use client";

import { useEffect, useRef } from "react";

export default function NexbotAuraBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", { alpha: true, antialias: true });
    if (!gl) return;

    const vsSource = `
      attribute vec2 position;
      void main() { gl_Position = vec4(position, 0.0, 1.0); }
    `;

    const fsSource = `
      precision highp float;
      uniform float iTime;
      uniform vec2 iResolution;

      mat2 rotate2d(float a){ return mat2(cos(a), -sin(a), sin(a), cos(a)); }

      float var(vec2 v1, vec2 v2, float s, float sp) {
          return sin(dot(normalize(v1), normalize(v2)) * s + iTime * sp) / 100.0;
      }

      vec3 circle(vec2 uv, vec2 c, float r, float w) {
          vec2 d = c - uv;
          float l = length(d);
          l += var(d, vec2(0.0, 1.0), 5.0, 2.0);
          l -= var(d, vec2(1.0, 0.0), 5.0, 2.0);
          float e = smoothstep(r - w, r, l) - smoothstep(r, r + w, l);
          return vec3(e);
      }

      void main() {
          vec2 uv = gl_FragCoord.xy / iResolution.xy;
          float aspect = iResolution.x / iResolution.y;
          uv.x *= aspect;

          vec2 center = vec2(0.5 * aspect, 0.5);

          vec3 col = vec3(0.0);
          float rad = 0.42;

          col += circle(uv, center, rad, 0.05);
          col += circle(uv, center, rad, 0.02);
          col += circle(uv, center, rad - 0.04, 0.01);

          vec2 v = rotate2d(iTime * 0.4) * (uv - center);
          vec3 auraColor = vec3(v.x + 0.6, v.y + 0.4, 0.8 - v.y * v.x);

          col *= auraColor * 1.5;
          col += circle(uv, center, rad, 0.005) * 2.0;

          gl_FragColor = vec4(col, 1.0);
      }
    `;

    const createShader = (type: number, source: string) => {
      const s = gl.createShader(type);
      if (!s) throw new Error("createShader failed");
      gl.shaderSource(s, source);
      gl.compileShader(s);
      return s;
    };

    const program = gl.createProgram();
    if (!program) return;

    const vs = createShader(gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl.FRAGMENT_SHADER, fsSource);

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const posLoc = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const tLoc = gl.getUniformLocation(program, "iTime");
    const rLoc = gl.getUniformLocation(program, "iResolution");

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = "100vw";
      canvas.style.height = "100vh";
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    let raf = 0;
    const render = (time: number) => {
      gl.uniform1f(tLoc, time * 0.001);
      gl.uniform2f(rLoc, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      raf = requestAnimationFrame(render);
    };

    window.addEventListener("resize", resize);
    resize();
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buffer);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10">
      {/* fundo base escuro pra ficar igual seu exemplo */}
      <div className="absolute inset-0 bg-black" />

      {/* shader */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* spline na frente do shader */}
      <div
        className="absolute inset-0 z-10"
        style={{
          mixBlendMode: "screen",
          pointerEvents: "none",
        }}
      >
        <iframe
          title="Nexbot"
          src="https://my.spline.design/nexbotrobotcharacterconcept-FDt7cww2KDcL0RxmRfz1cZG7/"
          className="h-full w-full border-0"
        />
      </div>

      {/* overlay pra dar contraste nos cards */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-black/25 to-black/45" />
    </div>
  );
}