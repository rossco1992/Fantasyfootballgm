import { type NextRequest, NextResponse } from "next/server";

import { createServerClient } from "@supabase/ssr";

import { isGuestOnlyRoute, isProtectedRoute } from "@/lib/auth/routes";
import { getPublicEnv } from "@/lib/env";

function copyResponseCookies(source: NextResponse, target: NextResponse) {
  for (const cookie of source.cookies.getAll()) target.cookies.set(cookie);
}

export async function updateSession(request: NextRequest) {
  const env = getPublicEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [name, value] of Object.entries(headers)) {
            response.headers.set(name, value);
          }
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const authenticatedUserId = data?.claims.sub;

  if (isProtectedRoute(request.nextUrl.pathname) && !authenticatedUserId) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    const redirectResponse = NextResponse.redirect(loginUrl);
    copyResponseCookies(response, redirectResponse);
    return redirectResponse;
  }

  if (isGuestOnlyRoute(request.nextUrl.pathname) && authenticatedUserId) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    const redirectResponse = NextResponse.redirect(dashboardUrl);
    copyResponseCookies(response, redirectResponse);
    return redirectResponse;
  }

  return response;
}
