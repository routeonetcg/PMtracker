"use client";

import { ImageOff } from "lucide-react";
import { useState } from "react";

/** <img> that swaps to a placeholder if the image can't load (offline, expired link, bad URL). */
export function ImgWithFallback({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="flex size-full items-center justify-center bg-gradient-to-br from-navy to-[#14284f]" role="img" aria-label={alt}>
        <ImageOff className="size-4 text-white/30" />
      </div>
    );
  }
  return <img src={src} alt={alt} loading="lazy" decoding="async" className={className} onError={() => setFailed(true)} />;
}
