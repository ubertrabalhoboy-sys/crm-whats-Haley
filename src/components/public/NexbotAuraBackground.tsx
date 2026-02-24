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
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    const fsSource = `
      precision highp float;
      uniform float iTime;
      uniform vec2 iResolution;

      mat2 rot(float a) {
        float c = cos(a);
        float s = sin(a);
        return mat2(c, -s, s, c);
      }

      float ring(vec2 p, float r, float w) {
        float d = abs(length(p) - r);
        return smoothstep(w, 0.0, d);
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / iResolution.xy;
        vec2 p = uv * 2.0 - 1.0;
        p.x *= iResolution.x / iResolution.y;

        float t = iTime * 0.55;
        vec2 q = rot(t * 0.7) * p;
        vec2 q2 = rot(-t * 0.4) * p;

        float r1 = ring(q, 0.44 + sin(t * 1.3) * 0.01, 0.03);
        float r2 = ring(q2, 0.36 + cos(t * 1.1) * 0.01, 0.015);
        float core = ring(p, 0.28, 0.007);

        float sweep = smoothstep(0.98, 1.0, cos(atan(q.y, q.x) * 3.0 - t * 2.2));
        vec3 c1 = vec3(1.0, 0.45, 0.12) * r1;
        vec3 c2 = vec3(0.35, 0.55, 1.0) * r2;
        vec3 c3 = vec3(0.95, 0.9, 0.7) * core * 0.9;

        vec3 glow = (c1 + c2 + c3) * (1.0 + sweep * 0.25);
        glow += vec3(0.8, 0.35, 0.12) * ring(p, 0.5, 0.09) * 0.22;

        gl_FragColor = vec4(glow, clamp(length(glow) * 0.6, 0.0, 1.0));
      }
    `;

    const createShader = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("shader_create_failed");
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader) || "shader_compile_failed";
        gl.deleteShader(shader);
        throw new Error(log);
      }
      return shader;
    };

    const program = gl.createProgram();
    if (!program) return;

    let raf = 0;
    let vs: WebGLShader | null = null;
    let fs: WebGLShader | null = null;
    let buffer: WebGLBuffer | null = null;

    try {
      vs = createShader(gl.VERTEX_SHADER, vsSource);
      fs = createShader(gl.FRAGMENT_SHADER, fsSource);
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || "program_link_failed");
      }

      gl.useProgram(program);

      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW
      );

      const posLoc = gl.getAttribLocation(program, "position");
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      const timeLoc = gl.getUniformLocation(program, "iTime");
      const resLoc = gl.getUniformLocation(program, "iResolution");

      const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(window.innerWidth * dpr);
        canvas.height = Math.floor(window.innerHeight * dpr);
        canvas.style.width = "100vw";
        canvas.style.height = "100vh";
        gl.viewport(0, 0, canvas.width, canvas.height);
      };

      const render = (time: number) => {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        if (timeLoc) gl.uniform1f(timeLoc, time * 0.001);
        if (resLoc) gl.uniform2f(resLoc, canvas.width, canvas.height);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        raf = requestAnimationFrame(render);
      };

      window.addEventListener("resize", resize);
      resize();
      raf = requestAnimationFrame(render);

      return () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", resize);
        if (buffer) gl.deleteBuffer(buffer);
        if (vs) gl.deleteShader(vs);
        if (fs) gl.deleteShader(fs);
        gl.deleteProgram(program);
      };
    } catch {
      gl.deleteProgram(program);
      if (buffer) gl.deleteBuffer(buffer);
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      return;
    }
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 -z-20 overflow-hidden">
      <div className="absolute inset-0 bg-[#05060a]" />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full opacity-90" />

      <div className="absolute inset-0">
        <iframe
          title="Nexbot Robot"
          src="https://my.spline.design/nexbotrobotcharacterconcept-FDt7cww2KDcL0RxmRfz1cZG7/"
          className="h-full w-full border-0 opacity-85"
          style={{ pointerEvents: "none" }}
        />
      </div>
    </div>
  );
}
