"use client";

import {
  ArrowLeftRight,
  Boxes,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  PackagePlus,
  Receipt,
  Settings,
  ShoppingBag,
  Sun,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useState } from "react";
import { signOut } from "@/app/login/actions";
import { Logo } from "@/components/brand";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

export const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/inventory", label: "Inventory", icon: Boxes },
  { href: "/buy", label: "Buy cards", icon: PackagePlus },
  { href: "/sales", label: "Sales", icon: ShoppingBag },
  { href: "/trades", label: "Trades", icon: ArrowLeftRight },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground", className)}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      {dark ? "Light mode" : "Dark mode"}
    </button>
  );
}

export function AppShell({
  partner,
  children,
}: {
  partner: { displayName: string; color: string };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-card/40 px-3 py-4 md:flex">
        <Link href="/" className="mb-6 px-2">
          <Logo />
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive(pathname, item.href)
                  ? "bg-primary/12 text-gold"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="space-y-1 border-t pt-3">
          <div className="flex items-center gap-2 px-3 py-1.5 text-sm">
            <span className="size-2.5 rounded-full" style={{ background: partner.color }} />
            <span className="truncate font-medium">{partner.displayName}</span>
          </div>
          <ThemeToggle className="w-full" />
          <form action={signOut}>
            <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
              <LogOut className="size-4" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Phone header */}
        <header className="pt-safe sticky top-0 z-30 border-b bg-background/85 backdrop-blur-md md:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <Link href="/">
              <Logo />
            </Link>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: partner.color }} />
              {partner.displayName}
            </span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 pt-4 pb-28 md:px-8 md:pt-8 md:pb-12">{children}</main>
      </div>

      {/* Phone bottom tab bar */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-background/92 backdrop-blur-md md:hidden">
        <div className="grid h-16 grid-cols-5 items-stretch">
          <TabLink href="/" label="Home" icon={LayoutDashboard} active={isActive(pathname, "/")} />
          <TabLink href="/inventory" label="Inventory" icon={Boxes} active={isActive(pathname, "/inventory")} />
          <Link href="/sales/new" className="flex items-center justify-center" aria-label="Record a sale">
            <span className="-mt-6 grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 ring-4 ring-background">
              <HandCoins className="size-6" />
            </span>
          </Link>
          <TabLink href="/sales" label="Sales" icon={Wallet} active={isActive(pathname, "/sales") && pathname !== "/sales/new"} />
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground"
          >
            <Menu className="size-5" />
            More
          </button>
        </div>
      </nav>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent title="More">
          <div className="grid grid-cols-3 gap-2">
            {NAV.filter((n) => !["/", "/inventory", "/sales"].includes(n.href)).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className="flex flex-col items-center gap-2 rounded-xl border bg-card p-4 text-center text-sm font-medium hover:bg-accent"
              >
                <item.icon className="size-6 text-gold" />
                {item.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center justify-between border-t pt-3">
            <ThemeToggle />
            <form action={signOut}>
              <button className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent">
                <LogOut className="size-4" /> Sign out
              </button>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TabLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
        active ? "text-gold" : "text-muted-foreground",
      )}
    >
      <Icon className="size-5" />
      {label}
    </Link>
  );
}
