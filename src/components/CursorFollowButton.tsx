"use client";

import React from "react";

type Props = {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
  variant?: "gradient" | "glass";
};

export default function CursorFollowButton({
  children,
  href,
  onClick,
  className = "",
  variant = "gradient",
}: Props) {
  const ref = React.useRef<HTMLAnchorElement | HTMLButtonElement | null>(null);

  function setVars(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    el.style.setProperty("--cursor-x", `${x}%`);
    el.style.setProperty("--cursor-y", `${y}%`);
  }

  const base = `cursor-follow-cta ${variant === "glass" ? "glass" : ""} ${className}`;

  const content = (
    <>
      <span className="relative z-10 inline-flex items-center gap-2">
        {children}
      </span>
      <div className="cf-left" />
      <div className="cf-right" />
    </>
  );

  if (href) {
    return (
      <a
        ref={ref as React.RefObject<HTMLAnchorElement>}
        href={href}
        onMouseMove={setVars}
        className={base}
        style={{ padding: "0.9rem 1.5rem", fontWeight: 800, fontSize: "0.95rem" }}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      ref={ref as React.RefObject<HTMLButtonElement>}
      type="button"
      onClick={onClick}
      onMouseMove={setVars}
      className={base}
      style={{ padding: "0.9rem 1.5rem", fontWeight: 800, fontSize: "0.95rem" }}
    >
      {content}
    </button>
  );
}