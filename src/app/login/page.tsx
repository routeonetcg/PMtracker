import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand";
import { getClaims } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : undefined;
  const next = typeof sp.next === "string" && sp.next.startsWith("/") ? sp.next : "/";
  if (!error && (await getClaims())) redirect(next);

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_30rem_at_50%_-10%,rgba(245,183,0,.16),transparent),radial-gradient(40rem_30rem_at_100%_100%,rgba(11,27,58,.9),transparent)]" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo className="scale-125" />
        </div>
        <div className="rounded-2xl border bg-card/90 p-6 shadow-2xl backdrop-blur">
          <h1 className="text-xl font-bold">Partner sign in</h1>
          <p className="mt-1 mb-5 text-sm text-muted-foreground">Private dashboard for Route One TCG partners.</p>
          <LoginForm next={next} initialError={error === "not-a-partner" ? "That account isn't set up as a Route One partner." : undefined} />
        </div>
      </div>
    </main>
  );
}
