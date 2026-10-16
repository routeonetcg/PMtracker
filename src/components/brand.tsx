"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Shows /public/logo.png when it exists; otherwise a gold "R1" monogram.
 * Drop your logo file at public/logo.png — no code change needed.
 */
export function Logo({ className, showText = true }: { className?: string; showText?: boolean }) {
  const [hasLogo, setHasLogo] = useState(false);
  useEffect(() => {
    const img = new Image();
    img.onload = () => setHasLogo(true);
    img.src = "/logo.png";
  }, []);
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      {hasLogo ? (
        <img src="/logo.png" alt="Route One TCG" className="size-9 rounded-lg object-contain" />
      ) : (
        <span
          aria-hidden
          className="grid size-9 place-items-center rounded-lg bg-primary text-sm font-black tracking-tighter text-primary-foreground"
        >
          R1
        </span>
      )}
      {showText ? (
        <span className="leading-tight">
          <span className="block text-[15px] font-bold tracking-tight">Route One TCG</span>
          <span className="block text-[11px] font-semibold tracking-[0.2em] text-gold uppercase">HQ</span>
        </span>
      ) : null}
    </span>
  );
}
