import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

/**
 * Layout for the photo/facts detail pages (animal and sponsor detail), using
 * the .detail-* classes ported from hkscdagpt-source's animal detail page
 * (src/styles/public.css) but never previously wired to markup. Distinct from
 * PublicPageFrame's hero/chapters/CTA shape, which doesn't fit a page whose
 * point is one photo and one fact panel.
 */
export function PublicDetailFrame({
  breadcrumbHref,
  breadcrumbLabel,
  panel,
  children,
}: {
  breadcrumbHref: string;
  breadcrumbLabel: string;
  panel: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="detail-page">
      <div className="public-container detail-breadcrumb">
        <Link to={breadcrumbHref}>← {breadcrumbLabel}</Link>
      </div>
      <section className="public-container detail-grid">
        <aside className="detail-panel" aria-label="重點資料及行動">
          {panel}
        </aside>
        <div className="detail-main">{children}</div>
      </section>
    </main>
  );
}
