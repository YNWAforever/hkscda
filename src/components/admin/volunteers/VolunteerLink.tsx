import { Link, useRouter } from "@tanstack/react-router";
import type { AnchorHTMLAttributes } from "react";
/** Router navigation in the app, native anchors in isolated/server previews without a router. */
export function VolunteerLink({
  href = "/admin/volunteers",
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const router = useRouter({ warn: false });
  const target = href.startsWith("?") && router ? router.state.location.pathname + href : href;
  if (
    router &&
    (target === "/admin/volunteers" ||
      target.startsWith("/admin/volunteers/") ||
      target.startsWith("/admin/volunteers?")) &&
    !props.download
  ) {
    const destination = new URL(target, "http://volunteer.invalid");
    return (
      <Link
        to={destination.pathname}
        search={router.options.parseSearch(destination.search) as never}
        hash={destination.hash.slice(1)}
        {...props}
      />
    );
  }
  return <a href={href} {...props} />;
}
