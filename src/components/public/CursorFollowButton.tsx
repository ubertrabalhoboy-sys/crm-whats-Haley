"use client";

import React from "react";

type Props = {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
  variant?: "primary" | "glass";
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
};

export default function CursorFollowButton({
  children,
  href,
  onClick,
  className = "",
  variant = "primary",
  type = "button",
  disabled = false,
}: Props) {
  const ref = React.useRef<HTMLAnchorElement | HTMLButtonElement | null>(null);

  function setVars(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty("--cursor-x", `${x}%`);
    el.style.setProperty("--cursor-y", `${y}%`);
  }

  const variantClass = variant === "glass" ? "cf-variant-glass" : "cf-variant-primary";
  const baseClass = `cursor-follow-cta ${variantClass} ${disabled ? "opacity-60 pointer-events-none" : ""} ${className}`.trim();

  const content = (
    <>
      <span className="relative z-10 inline-flex items-center justify-center gap-2">{children}</span>
      <span className="cf-glow" aria-hidden="true" />
    </>
  );

  if (href) {
    return (
      <a
        ref={ref as React.RefObject<HTMLAnchorElement>}
        href={href}
        onMouseMove={setVars}
        className={baseClass}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      ref={ref as React.RefObject<HTMLButtonElement>}
      type={type}
      onClick={onClick}
      onMouseMove={setVars}
      disabled={disabled}
      className={baseClass}
    >
      {content}
    </button>
  );
}
