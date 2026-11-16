import { NextResponse, type NextRequest } from "next/server";
import { isAppConfigured, isProtectedPath } from "@/lib/env";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/demo" || pathname === "/demo/applications") {
    return NextResponse.next();
  }

  if (!isAppConfigured()) {
    if (pathname.startsWith("/login")) {
      return NextResponse.next();
    }

    if (isProtectedPath(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("error", "missing_env");
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  }

  const { updateSession } = await import("@/lib/supabase/middleware");
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
