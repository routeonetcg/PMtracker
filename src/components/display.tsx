import { ImageOff } from "lucide-react";
import { formatBps, formatUSD } from "@/lib/money";
import { STATUS_BADGE, STATUSES, type ItemStatus } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/misc";

/** USD amount. `pl` colors it green/red (profit/loss) and adds a sign. */
export function Money({
  cents,
  pl = false,
  whole = false,
  className,
}: {
  cents: number | null | undefined;
  pl?: boolean;
  whole?: boolean;
  className?: string;
}) {
  const tone = pl && cents ? (cents > 0 ? "text-profit" : "text-loss") : "";
  return (
    <span className={cn("num whitespace-nowrap", tone, className)}>{formatUSD(cents, { signed: pl, whole })}</span>
  );
}

export function Pct({ bps, pl = false, className }: { bps: number | null | undefined; pl?: boolean; className?: string }) {
  const tone = pl && bps ? (bps > 0 ? "text-profit" : "text-loss") : "";
  const text = bps === null || bps === undefined ? "—" : `${pl && bps > 0 ? "+" : ""}${formatBps(bps)}`;
  return <span className={cn("num whitespace-nowrap", tone, className)}>{text}</span>;
}

export function StatusBadge({ status }: { status: ItemStatus }) {
  return <Badge variant={STATUS_BADGE[status]}>{STATUSES[status]}</Badge>;
}

/**
 * Card thumbnail: our own photo first, then the catalog image, then a placeholder.
 * Card images are 63×88mm, so we keep that ratio.
 */
export function CardThumb({
  photoId,
  imageUrl,
  name,
  size = "md",
  className,
}: {
  photoId?: string | null;
  imageUrl?: string | null;
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const src = photoId ? `/api/photo/${photoId}` : imageUrl;
  const dims = { sm: "w-8", md: "w-11", lg: "w-20", xl: "w-full max-w-64" }[size];
  return (
    <div className={cn("relative aspect-[63/88] shrink-0 overflow-hidden rounded-[6%/4.3%] bg-muted ring-1 ring-border", dims, className)}>
      {src ? (
        <img src={src} alt={name} loading="lazy" decoding="async" className="size-full object-cover" />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-navy to-[#14284f] p-[8%] text-center">
          {size === "sm" ? (
            <span className="text-[9px] font-black text-primary/80">{initials(name)}</span>
          ) : size === "md" ? (
            <span className="text-xs font-black text-primary/80">{initials(name)}</span>
          ) : (
            <>
              <span className="text-sm font-bold text-white/90">{name}</span>
              <span className="flex items-center gap-1 text-[11px] text-white/40">
                <ImageOff className="size-3.5" /> no photo yet
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/[\s&-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

/** "Ancient Origins · 98/98 · JP" */
export function cardSubtitle(c: { setName: string; number: string | null; language: string }) {
  return [c.setName, c.number, c.language === "JP" ? "JP" : null].filter(Boolean).join(" · ");
}
