import type { ReactNode } from "react";
import { pickAdminCopy } from "./i18n/copy";
import { useAdminLanguageOrDefault } from "./i18n/languageContext";
import { volunteerWorkspaceCopy, type VolunteerWorkspacePageId } from "./volunteerWorkspaceCopy";
/** Shared heading geometry; children retain established workflow anchors and page-specific actions. */
export function VolunteerPageHeading({
  pageId,
  actions,
  description,
  title,
  children,
}: {
  pageId: VolunteerWorkspacePageId;
  actions?: ReactNode;
  description?: string;
  title?: string;
  children?: ReactNode;
}) {
  const copy = pickAdminCopy(volunteerWorkspaceCopy, useAdminLanguageOrDefault()).pages[pageId];
  return (
    <header className="vw-page-header">
      {children ?? (
        <>
          <div>
            <h1>{title ?? copy.label}</h1>
            <p>{description ?? copy.description}</p>
          </div>
          {actions && <div className="vw-page-actions">{actions}</div>}
        </>
      )}
    </header>
  );
}
