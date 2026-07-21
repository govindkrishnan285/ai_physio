import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Next 16 renamed the `middleware` file convention to `proxy`. See
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
//
// This only reads the non-sensitive marker cookie set by lib/authStore.ts, so
// an unauthenticated visitor is redirected before any protected page is sent.
// It is NOT an authorization check: the cookie is client-set and trivially
// forged. Real enforcement is the backend rejecting untokened requests, with
// RequireAuth handling role routing once the app has hydrated.

const SESSION_COOKIE = "physio.session";

const PUBLIC_ROUTES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const signedIn = request.cookies.get(SESSION_COOKIE)?.value === "1";
  const isPublic = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  if (!signedIn && !isPublic) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  // Already signed in and looking at the login page: send them inward. The
  // destination depends on role, which this layer cannot see, so "/" handles
  // the final routing.
  if (signedIn && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Skip static assets and Next internals; matching them would redirect the
  // login page's own CSS and lock the user out of a working page.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm)$).*)"],
};
