import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

/**
 * Thin wrapper for conversion and status pages (wizards, forms, the private
 * status/token routes, /donate). Deliberately does not own a <main> or a
 * heading: every page it wraps already has its own <main> and <h1> (e.g.
 * StatusPage's StatusContent), so a frame that supplied a second copy of
 * either would produce a duplicate <main> landmark or a duplicate <h1> —
 * the exact defect class PublicStateShell's headingLevel doc comment warns
 * about. Reuses the same .detail-breadcrumb chrome as PublicDetailFrame and
 * the .trust-cue pill already used on the home page's trust line.
 */
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
        <div className="public-container detail-breadcrumb">
          <Link to={breadcrumbHref}>← {breadcrumbLabel}</Link>
        </div>
      ) : null}
      {children}
      {trustNote ? (
        <div className="public-container">
          <p className="trust-cue">{trustNote}</p>
        </div>
      ) : null}
    </>
  );
}
