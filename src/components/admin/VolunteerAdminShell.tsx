import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, HeartHandshake } from "lucide-react";
import { useState, type ReactNode } from "react";
import { adminIdentityQueryOptions } from "../../lib/admin/pageAccess";
import { AdminLayout } from "./AdminLayout";
import { getVolunteerNavigation, getVolunteerWorkspacePage } from "./volunteerWorkspace";
import "./volunteer-workspace.css";

export function VolunteerAdminShell({
  children,
  title,
  description,
  actions,
}: {
  children: ReactNode;
  title?: string;
  description?: string;
  actions?: ReactNode;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { data: identity } = useQuery(adminIdentityQueryOptions());
  const [navigationOpen, setNavigationOpen] = useState(false);
  const page = getVolunteerWorkspacePage(pathname);
  const items = getVolunteerNavigation(identity?.admin.role ?? null);
  const isDetail = Boolean(page && pathname.replace(/\/+$/, "") !== page.to);
  const pageTitle =
    title ??
    (isDetail ? (page?.id === "people" ? "義工個人詳情" : "報名詳情") : page?.label) ??
    "義工營運中心";

  return (
    <AdminLayout activeSection="volunteers">
      <div className="volunteer-workspace">
        <a className="vw-skip" href="#volunteer-page-content">
          跳至頁面內容
        </a>
        <div className="vw-masthead">
          <div className="vw-brand">
            <HeartHandshake size={22} aria-hidden="true" />
            <span>義工營運中心</span>
          </div>
          <span className="vw-role">
            {identity?.admin.role === "admin" ? "管理員工作區" : "職員工作區"}
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
              <span>工作區導覽 · {page?.label ?? "目前頁面"}</span>
              <ChevronDown size={18} aria-hidden="true" />
            </button>
            <nav
              id="volunteer-navigation"
              className="vw-navigation"
              data-open={navigationOpen}
              aria-label="義工工作區"
            >
              {(["operations", "settings"] as const).map((group) => {
                const groupItems = items.filter((item) => item.group === group);
                if (!groupItems.length) return null;
                return (
                  <div className="vw-nav-group" key={group}>
                    <p className="vw-nav-label">
                      {group === "operations" ? "日常營運" : "管理員設定"}
                    </p>
                    {groupItems.map((item) => (
                      <Link
                        key={item.id}
                        to={item.to}
                        activeOptions={{ exact: true }}
                        aria-current={item.id === page?.id ? "page" : undefined}
                        onClick={() => setNavigationOpen(false)}
                        className="vw-nav-link"
                      >
                        <span>{item.label}</span>
                        {item.id === page?.id && <ChevronRight size={16} aria-hidden="true" />}
                      </Link>
                    ))}
                  </div>
                );
              })}
            </nav>
          </aside>
          <div className="vw-page">
            <nav aria-label="麵包屑" className="vw-breadcrumb">
              <Link to="/admin/volunteers">義工營運中心</Link>
              {page?.id !== "overview" && (
                <>
                  <ChevronRight size={14} aria-hidden="true" />
                  {isDetail && page ? (
                    <Link to={page.to}>{page.label}</Link>
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
            {(title || description || actions) && (
              <header className="vw-page-header">
                <div>
                  {title && <h1>{title}</h1>}
                  {description && <p>{description}</p>}
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
    </AdminLayout>
  );
}
