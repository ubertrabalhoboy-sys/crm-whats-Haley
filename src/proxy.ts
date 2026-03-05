import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from "@/lib/shared/env-public";

function isAuthPage(pathname: string) {
  return pathname === "/login" || pathname === "/signup";
}

function isProtectedPath(pathname: string) {
  return (
    pathname === "/inbox" ||
    pathname === "/dashboard" ||
    pathname === "/kanban" ||
    pathname === "/settings/whatsapp" ||
    pathname === "/automations" ||
    pathname === "/verify-email"
  );
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    PUBLIC_SUPABASE_URL,
    PUBLIC_SUPABASE_ANON_KEY,
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
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && isProtectedPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // NOTE: email_verified column does not exist in profiles table.
  // Skipping the email verification gate to avoid SQL errors on every request.
  // This block can be re-enabled once the column is added via migration.
  // if (user && (pathname === "/settings/whatsapp" || pathname === "/automations")) { ... }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)",
  ],
};
