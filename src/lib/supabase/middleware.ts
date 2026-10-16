import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/config";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const { url, anonKey } = getSupabaseEnv();

  const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const isAuthRoute = request.nextUrl.pathname.startsWith("/login");
  const { pathname } = request.nextUrl;
  // Cron and the discovery tick authenticate with CRON_SECRET in the route.
  // They must not redirect to /login: pg_net follows the 307 and keeps POST,
  // and the login page then answers 405.
  const isBearerRoute =
    pathname.startsWith("/api/cron") ||
    pathname === "/api/discovery/tick" ||
    pathname.startsWith("/api/discovery/tick/");
  const isPublicRoute =
    isAuthRoute ||
    isBearerRoute ||
    pathname.startsWith("/api/extension");

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/jobs";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
