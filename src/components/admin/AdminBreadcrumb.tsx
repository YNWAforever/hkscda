import { Link } from "@tanstack/react-router";

import { useAdminLanguage } from "./adminI18n";
import { breadcrumbTrail, type BreadcrumbOptions } from "./breadcrumbTrail";

/**
 * The one breadcrumb of an admin page: group, destination and, on a record page, the record.
 * `AdminLayout` renders it; a page never draws its own. It renders nothing for a page that has no
 * destination in the navigation (such as the access-denied page).
 */
export function AdminBreadcrumb({
  pathname,
  recordName,
  ...options
}: {
  pathname: string;
  recordName?: string | null;
} & BreadcrumbOptions) {
  const { copy, language } = useAdminLanguage();
  const trail = breadcrumbTrail(pathname, language, recordName, options);
  if (trail.length === 0) return null;

  return (
    <nav aria-label={copy.layout.breadcrumb} className="text-xs text-[var(--color-text-muted)]">
      <ol className="flex flex-wrap items-center gap-2">
        {trail.map((crumb, index) => {
          const last = index === trail.length - 1;
          return (
            <li key={`${index}-${crumb.label}`} aria-current={last ? "page" : undefined}>
              {index > 0 && <span aria-hidden> / </span>}
              {crumb.to && !last ? (
                <Link to={crumb.to} className="underline underline-offset-4">
                  {crumb.label}
                </Link>
              ) : (
                <span className="break-words">{crumb.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
