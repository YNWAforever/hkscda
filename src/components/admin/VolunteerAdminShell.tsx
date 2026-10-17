import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, HeartHandshake } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { subscribeToAdminAuth } from "../../lib/admin/supabaseAuthEvents";
import {
  clearVolunteerIdentityQueries,
  clearVolunteerSessionSearch,
} from "../../lib/volunteers/queryKeys";
import {
  adminIdentityQueryOptions,
  firstAllowedAdminRouteForIdentity,
} from "../../lib/admin/pageAccess";
import { ADMIN_IDENTITY_QUERY_KEY } from "../../lib/admin/identity";
import { AdminLayout } from "./AdminLayout";
import { useAdminCopy } from "./i18n/copy";
import {
  getVolunteerNavigation,
  getVolunteerWorkspacePage,
  VOLUNTEER_WORKSPACE_GROUPS,
} from "./volunteerWorkspace";
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

export function VolunteerWorkspaceFrame({
  children,
  title,
  description,
  intro,
  actions,
}: ShellProps) {
  const copy = useAdminCopy(volunteerWorkspaceCopy);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { data: identity } = useQuery(adminIdentityQueryOptions());
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [identityChanging, setIdentityChanging] = useState(false);
  const [identityGeneration, setIdentityGeneration] = useState(0);
  useEffect(() => {
    let active = true;
    let generation = 0;
    let previous = identityRef.current?.admin.authUserId ?? null;
    const stopAuth = subscribeToAdminAuth((_event, session) => {
      const next = session?.user.id ?? null;
      if (next === previous) return;
      previous = next;
      const current = ++generation;
      setIdentityChanging(true);
      try {
        clearVolunteerSessionSearch(window.sessionStorage);
      } catch {
        /* Storage is optional. */
      }
      window.dispatchEvent(new Event("hkscda-admin-identity-cleared"));
      void clearVolunteerIdentityQueries(queryClient)
        .then(async () => {
          if (!active || current !== generation) return;
          await queryClient.cancelQueries({ queryKey: ADMIN_IDENTITY_QUERY_KEY });
          queryClient.removeQueries({ queryKey: ADMIN_IDENTITY_QUERY_KEY });
          if (!next) {
            await router.navigate({ to: "/admin/login" });
            return;
          }
          const refreshed = await queryClient.fetchQuery(adminIdentityQueryOptions());
          if (!active || current !== generation) return;
          const currentPage = getVolunteerWorkspacePage(router.state.location.pathname);
          if (currentPage && !currentPage.roles.includes(refreshed.admin.role)) {
            await router.navigate({
              to: getVolunteerNavigation(refreshed.admin.role).length
                ? "/admin/volunteers"
                : firstAllowedAdminRouteForIdentity(refreshed.admin),
            });
          } else {
            await router.invalidate();
          }
          if (active && current === generation) {
            setIdentityGeneration((value) => value + 1);
            setIdentityChanging(false);
          }
        })
        .catch(() => {
          /* Keep private children hidden until a valid identity is loaded. */
        });
    });
    return () => {
      active = false;
      stopAuth();
    };
  }, [queryClient, router]);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const page = getVolunteerWorkspacePage(pathname);
  const items = getVolunteerNavigation(identity?.admin.role ?? null);
  const pageLabel = page ? copy.pages[page.id].label : undefined;
  // The shell writes the one `h1` only for a page that asks for it (`title` or `intro`); every
  // other page draws its own. The breadcrumb is `AdminLayout`'s, so it is not repeated here.
  const heading = title ?? (intro ? copy.intros[intro].title : undefined);
  const lead = description ?? (intro ? copy.intros[intro].description : undefined);

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
            {VOLUNTEER_WORKSPACE_GROUPS.map((group) => {
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
            {identityChanging ? (
              <p role="status">{copy.identityChanging}</p>
            ) : (
              <div key={identityGeneration}>{children}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
