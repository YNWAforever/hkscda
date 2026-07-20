export function hasLocalDonationAction(pathname: string) {
  return pathname === "/stories" || pathname.startsWith("/stories/");
}
