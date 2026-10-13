import { Link, useRouter } from "@tanstack/react-router";
import type { AnchorHTMLAttributes } from "react";
/** Router navigation in the app, native anchors in isolated/server previews without a router. */
export function VolunteerLink({
  href = "/admin/volunteers",
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const router = useRouter({ warn: false });
  const target = href.startsWith("?") && router ? router.state.location.pathname + href : href;
  return router &&
    (target === "/admin/volunteers" ||
      target.startsWith("/admin/volunteers/") ||
      target.startsWith("/admin/volunteers?")) &&
    !props.download ? (
    <Link to={target} {...props} />
  ) : (
    <a href={href} {...props} />
  );
}
