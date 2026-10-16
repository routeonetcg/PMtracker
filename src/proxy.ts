import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth", "/api/cron"];

/**
 * Refreshes the Supabase session cookie on every request and sends signed-out
 * visitors to /login. Real authorization happens in the database (RLS).
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (!data?.claims && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = path === "/" ? "" : `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png|icon|apple-icon|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
