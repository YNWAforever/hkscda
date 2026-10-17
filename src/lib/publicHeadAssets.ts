export function resolveHeadPathname(
  matches: readonly { pathname: string }[],
  fallbackPathname: string,
) {
  return matches.at(-1)?.pathname ?? fallbackPathname;
}

export function shouldIncludePublicStyles(pathname: string) {
  return pathname !== "/admin" && !pathname.startsWith("/admin/");
}
