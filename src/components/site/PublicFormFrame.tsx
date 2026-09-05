import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

/** Shared navigation and trust landmarks around public forms and status pages. */
export function PublicFormFrame({
  breadcrumbHref,
  breadcrumbLabel,
  trustNote,
  children,
}: {
  breadcrumbHref?: string;
  breadcrumbLabel?: string;
  trustNote?: string;
  children: ReactNode;
}) {
  return (
    <>
      {breadcrumbHref && breadcrumbLabel ? (
        <nav aria-label="頁面路徑" className="public-container detail-breadcrumb">
          <Link to={breadcrumbHref}>← {breadcrumbLabel}</Link>
        </nav>
      ) : null}
      {children}
      {trustNote ? (
        <aside aria-label="私隱提示" className="public-container">
          <p className="trust-cue">{trustNote}</p>
        </aside>
      ) : null}
    </>
  );
}
