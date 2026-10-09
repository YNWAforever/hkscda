import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ListTodo, LogOut, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type MouseEvent } from "react";

import { supabase } from "../../lib/supabase";
import { getFirstAllowedAdminRoute } from "../../lib/admin/access";
import { signOutAndLeave } from "../../lib/admin/signInFlow";
import { adminIdentityQueryOptions } from "../../lib/admin/pageAccess";
import { cn } from "../../lib/utils";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "../ui/sheet";
import { AdminLanguageProvider, AdminLanguageToggle, useAdminLanguage } from "./adminI18n";
import { AdminHomeRouteContext } from "./adminHomeRoute";
import { getAdminNavigation, getActiveAdminNavItemIds } from "./adminNav";
import type { AdminNavigationGroup, AdminSection } from "./adminNav";
import { adminLanguageTag } from "./i18n/pageLanguage";
import { useSessionExpiryRedirect } from "./useSessionExpiryRedirect";

const COLLAPSE_KEY = "hkscda-admin-sidebar-collapsed";

interface AdminLayoutProps {
  children: ReactNode;
  activeSection: AdminSection;
}

function NavList({
  groups,
  activeGroupId,
  collapsed,
  onNavigate,
}: {
  groups: AdminNavigationGroup[];
  activeGroupId: string | null;
  collapsed: boolean;
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>, to: string) => void;
}) {
  const { copy } = useAdminLanguage();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <nav
      aria-label={copy.layout.primaryNavigation}
      className="flex-1 space-y-1 overflow-y-auto p-2"
    >
      <Link
        to="/admin/tasks"
        onClick={onNavigate ? (event) => onNavigate(event, "/admin/tasks") : undefined}
        aria-label={copy.layout.taskOverview}
        aria-current={pathname === "/admin/tasks" ? "page" : undefined}
        className={cn(
          "mb-2 flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm text-[var(--color-text-inverse)] hover:bg-[var(--color-panel-2)]",
          collapsed && "md:justify-center md:px-0",
        )}
      >
        <ListTodo className="h-[18px] w-[18px] shrink-0" aria-hidden />
        <span className={cn(collapsed && "md:hidden")}>{copy.layout.taskOverview}</span>
      </Link>
      {groups.map((group) => {
        const Icon = group.icon;
        const label = copy.navGroups[group.id];
        return (
          <Link
            key={group.id}
            to={group.to}
            onClick={onNavigate ? (event) => onNavigate(event, group.to) : undefined}
            title={collapsed ? label : undefined}
            aria-label={label}
            aria-current={activeGroupId === group.id ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-text-inverse)]",
              collapsed && "md:justify-center md:px-0",
              activeGroupId === group.id
                ? "bg-[var(--color-panel-2)] text-[var(--color-text-inverse)]"
                : "text-[var(--color-text-inverse)] hover:bg-[var(--color-panel-2)]",
            )}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
            <span className={cn(collapsed && "md:hidden")}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function WorkspaceNavigation({
  group,
  activeIds,
}: {
  group: AdminNavigationGroup;
  activeIds: Set<string>;
}) {
  const { copy } = useAdminLanguage();
  // The volunteer workspace already owns its internal destinations and draft guard.
  const items =
    group.id === "volunteers"
      ? group.items.filter((item) => item.id === "volunteers" || item.id === "internships")
      : group.items;
  const activeItem = group.items.find((item) => activeIds.has(item.id));
  return (
    <div className="min-w-0 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 md:px-8">
      <nav aria-label={copy.layout.breadcrumb} className="text-xs text-[var(--color-text-muted)]">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link to={group.to} className="underline underline-offset-4">
              {copy.navGroups[group.id]}
            </Link>
          </li>
          {activeItem && (
            <li aria-current="page">
              <span aria-hidden> / </span>
              {copy.navItems[activeItem.id]}
            </li>
          )}
        </ol>
      </nav>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        {copy.navDescriptions[group.id]}
      </p>
      <nav
        aria-label={copy.layout.workspaceNavigation}
        className="mt-3 flex max-w-full gap-2 overflow-x-auto pb-1"
      >
        {items.map((item) => {
          const active =
            activeIds.has(item.id) ||
            (group.id === "volunteers" &&
              item.id === "volunteers" &&
              activeItem?.id !== "internships");
          return (
            <Link
              key={item.id}
              to={item.to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center rounded-lg border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]",
                active
                  ? "border-[var(--color-primary)] bg-[var(--color-primary-highlight)] text-[var(--color-primary)]"
                  : "border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-offset)]",
              )}
            >
              {copy.navItems[item.id]}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function AccountFooter({
  email,
  collapsed,
  onLogout,
}: {
  email: string | null;
  collapsed: boolean;
  onLogout: () => void;
}) {
  const { copy } = useAdminLanguage();

  return (
    <div className="border-t border-[var(--color-panel-2)] p-2">
      {!collapsed && email && (
        <p className="truncate px-3 pb-1.5 text-xs text-[var(--color-text-inverse)]" title={email}>
          {email}
        </p>
      )}
      <button
        type="button"
        onClick={onLogout}
        title={collapsed ? copy.common.logout : undefined}
        className={cn(
          "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm text-[var(--color-text-inverse)] transition-colors hover:bg-[var(--color-panel-2)] hover:text-[var(--color-text-inverse)] md:min-h-0 md:py-2",
          collapsed && "md:justify-center md:px-0",
        )}
      >
        <LogOut className="h-[18px] w-[18px] shrink-0" aria-hidden />
        <span className={cn(collapsed && "md:hidden")}>{copy.common.logout}</span>
      </button>
    </div>
  );
}

export function AdminLayout({ children, activeSection }: AdminLayoutProps) {
  return (
    <AdminLanguageProvider>
      <AdminLayoutShell activeSection={activeSection}>{children}</AdminLayoutShell>
    </AdminLanguageProvider>
  );
}

function AdminLayoutShell({ children, activeSection }: AdminLayoutProps) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { copy, language } = useAdminLanguage();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const focusPageOnClose = useRef(false);
  const queryClient = useQueryClient();
  // A lapsed session sends staff to sign-in and back to this page; a deliberate logout must not.
  const suppressSessionExpiry = useSessionExpiryRedirect(queryClient);
  // beforeLoad already primed this entry for the current navigation, so this is
  // a cache hit with no request. It used to be a second GET /api/admin/me.
  const { data: identity } = useQuery(adminIdentityQueryOptions());
  const email = identity?.admin.email ?? null;
  const adminRole = identity?.admin.role ?? null;

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  }

  async function handleLogout() {
    await signOutAndLeave({
      suppressSessionExpiry,
      signOut: () => supabase.auth.signOut(),
      queryClient,
      push: () => {
        void navigate({ to: "/admin/login" });
      },
    });
  }

  const { groups, activeGroupId } = getAdminNavigation(adminRole, pathname, activeSection);
  const activeGroup = groups.find((group) => group.id === activeGroupId);
  const activeIds = new Set(
    getActiveAdminNavItemIds(
      groups.flatMap((group) => group.items),
      pathname,
      activeSection,
    ),
  );
  const animalRoot =
    (pathname === "/admin" || pathname === "/admin/") && activeGroupId === "animals";

  async function handleMobileNavigate(event: MouseEvent<HTMLAnchorElement>, to: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    const before = window.location.href;
    await navigate({ to });
    // A cancelled draft blocker must leave the drawer and current page intact.
    if (window.location.href === before && new URL(to, before).href !== before) return;
    focusPageOnClose.current = true;
    setMobileOpen(false);
    requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>("main h1");
      if (heading) {
        heading.tabIndex = -1;
        heading.focus();
      }
    });
  }

  return (
    <div className="flex min-h-dvh" lang={adminLanguageTag(language)}>
      <aside
        className={cn(
          "hidden flex-shrink-0 flex-col bg-[var(--color-panel)] text-[var(--color-text-inverse)] transition-[width] duration-200 md:flex",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <div className="border-b border-[var(--color-panel-2)] p-3">
          <div className="flex items-center justify-between">
            {!collapsed && (
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-inverse)]">
                {copy.common.appTitle}
              </span>
            )}
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={collapsed ? copy.layout.expandSidebar : copy.layout.collapseSidebar}
              className="rounded-md p-1.5 text-[var(--color-text-inverse)] transition-colors hover:bg-[var(--color-panel-2)] hover:text-[var(--color-text-inverse)]"
            >
              {collapsed ? (
                <PanelLeftOpen className="h-5 w-5" />
              ) : (
                <PanelLeftClose className="h-5 w-5" />
              )}
            </button>
          </div>
          {!collapsed && (
            <div className="mt-3">
              <AdminLanguageToggle />
            </div>
          )}
        </div>
        <NavList groups={groups} activeGroupId={activeGroupId} collapsed={collapsed} />
        <AccountFooter email={email} collapsed={collapsed} onLogout={handleLogout} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-2 md:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              aria-label={copy.layout.openMenu}
              className="flex h-11 w-11 items-center justify-center rounded-md text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-offset)]"
            >
              <Menu className="h-6 w-6" />
            </SheetTrigger>
            <SheetContent
              side="left"
              aria-describedby={undefined}
              onCloseAutoFocus={(event) => {
                if (focusPageOnClose.current) {
                  event.preventDefault();
                  focusPageOnClose.current = false;
                }
              }}
              className="flex w-64 flex-col gap-0 border-[var(--color-panel-2)] bg-[var(--color-panel)] p-0 text-[var(--color-text-inverse)]"
            >
              <div className="border-b border-[var(--color-panel-2)] px-4 py-4">
                <SheetTitle className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-inverse)]">
                  {copy.common.appTitle}
                </SheetTitle>
                <div className="mt-3">
                  <AdminLanguageToggle />
                </div>
              </div>
              <NavList
                groups={groups}
                activeGroupId={activeGroupId}
                collapsed={false}
                onNavigate={handleMobileNavigate}
              />
              <AccountFooter email={email} collapsed={false} onLogout={handleLogout} />
            </SheetContent>
          </Sheet>
          <span className="text-sm font-bold uppercase tracking-wider text-[var(--color-text)]">
            {copy.common.appTitle}
          </span>
        </header>

        <main className="min-w-0 flex-1 bg-[var(--color-bg)]">
          {activeGroup && !animalRoot && (
            <WorkspaceNavigation group={activeGroup} activeIds={activeIds} />
          )}
          <AdminHomeRouteContext.Provider
            value={identity ? getFirstAllowedAdminRoute(identity.admin.role) : null}
          >
            {children}
          </AdminHomeRouteContext.Provider>
        </main>
      </div>
    </div>
  );
}
