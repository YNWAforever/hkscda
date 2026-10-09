import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, HeartHandshake } from "lucide-react";
import { useState, type ReactNode } from "react";
import { adminIdentityQueryOptions } from "../../lib/admin/pageAccess";
import { AdminLayout } from "./AdminLayout";
import { useAdminCopy } from "./i18n/copy";
import { getVolunteerNavigation, getVolunteerWorkspacePage } from "./volunteerWorkspace";
import { volunteerWorkspaceCopy } from "./volunteerWorkspaceCopy";
import "./volunteer-workspace.css";

type ShellProps = {
  children: ReactNode;
  /** A heading and a line under it written by the page itself (data, not interface text). */
  title?: string;
  description?: string;
  /** A page whose heading and line the shell writes in the admin's language. */
  intro?: "people" | "person";
  actions?: ReactNode;
};

export function VolunteerAdminShell(props: ShellProps) {
  return (
    <AdminLayout activeSection="volunteers">
      <VolunteerWorkspaceFrame {...props} />
    </AdminLayout>
  );
}

function VolunteerWorkspaceFrame({ children, title, description, intro, actions }: ShellProps) {
  const copy = useAdminCopy(volunteerWorkspaceCopy);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { data: identity } = useQuery(adminIdentityQueryOptions());
  const [navigationOpen, setNavigationOpen] = useState(false);
  const page = getVolunteerWorkspacePage(pathname);
  const items = getVolunteerNavigation(identity?.admin.role ?? null);
  const isDetail = Boolean(page && pathname.replace(/\/+$/, "") !== page.to);
  const pageLabel = page ? copy.pages[page.id].label : undefined;
  const detailTitle =
    page?.id === "people" ? copy.detailTitles.person : copy.detailTitles.registration;
  const heading = title ?? (intro ? copy.intros[intro].title : undefined);
  const lead = description ?? (intro ? copy.intros[intro].description : undefined);
  const pageTitle = heading ?? (isDetail ? detailTitle : pageLabel) ?? copy.brand;

  return (
    <div className="volunteer-workspace">
      <a className="vw-skip" href="#volunteer-page-content">
        {copy.skipLink}
      </a>
      <div className="vw-masthead">
        <div className="vw-brand">
          <HeartHandshake size={22} aria-hidden="true" />
          <span>{copy.brand}</span>
        </div>
        <span className="vw-role">
          {identity?.admin.role === "admin" ? copy.roleAdmin : copy.roleStaff}
        </span>
      </div>
      <div className="vw-layout">
        <aside className="vw-sidebar">
          <button
            className="vw-nav-toggle"
            type="button"
            aria-expanded={navigationOpen}
            aria-controls="volunteer-navigation"
            onClick={() => setNavigationOpen(!navigationOpen)}
          >
            <span>{copy.navigationToggle(pageLabel ?? copy.currentPage)}</span>
            <ChevronDown size={18} aria-hidden="true" />
          </button>
          <nav
            id="volunteer-navigation"
            className="vw-navigation"
            data-open={navigationOpen}
            aria-label={copy.navigationLabel}
          >
            {(["operations", "settings"] as const).map((group) => {
              const groupItems = items.filter((item) => item.group === group);
              if (!groupItems.length) return null;
              return (
                <div className="vw-nav-group" key={group}>
                  <p className="vw-nav-label">{copy.groups[group]}</p>
                  {groupItems.map((item) => (
                    <Link
                      key={item.id}
                      to={item.to}
                      activeOptions={{ exact: true }}
                      aria-current={item.id === page?.id ? "page" : undefined}
                      onClick={() => setNavigationOpen(false)}
                      className="vw-nav-link"
                    >
                      <span>{copy.pages[item.id].label}</span>
                      {item.id === page?.id && <ChevronRight size={16} aria-hidden="true" />}
                    </Link>
                  ))}
                </div>
              );
            })}
          </nav>
        </aside>
        <div className="vw-page">
          <nav aria-label={copy.breadcrumb} className="vw-breadcrumb">
            <Link to="/admin/volunteers">{copy.brand}</Link>
            {page?.id !== "overview" && (
              <>
                <ChevronRight size={14} aria-hidden="true" />
                {isDetail && page ? (
                  <Link to={page.to}>{copy.pages[page.id].label}</Link>
                ) : (
                  <span aria-current="page">{pageTitle}</span>
                )}
              </>
            )}
            {isDetail && (
              <>
                <ChevronRight size={14} aria-hidden="true" />
                <span aria-current="page">{pageTitle}</span>
              </>
            )}
          </nav>
          {(heading || lead || actions) && (
            <header className="vw-page-header">
              <div>
                {heading && <h1>{heading}</h1>}
                {lead && <p>{lead}</p>}
              </div>
              {actions && <div className="vw-page-actions">{actions}</div>}
            </header>
          )}
          <div id="volunteer-page-content" className="vw-content" tabIndex={-1}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
