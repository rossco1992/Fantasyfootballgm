const protectedPrefixes = ["/dashboard", "/auth/update-password"];
const guestOnlyPaths = ["/", "/login", "/register"];

export function isProtectedRoute(pathname: string): boolean {
  return protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isGuestOnlyRoute(pathname: string): boolean {
  return guestOnlyPaths.includes(pathname);
}

export function safeNextPath(value: string | null, fallback = "/dashboard") {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return fallback;
  }
  return value;
}
