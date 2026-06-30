import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { supabase } from "../../lib/supabase";
import { cn } from "../../lib/utils";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "../ui/sheet";
import { AdminLanguageProvider, AdminLanguageToggle, useAdminLanguage } from "./adminI18n";
import { ADMIN_NAV_GROUPS, ADMIN_NAV_ITEMS, getActiveAdminNavItemIds } from "./adminNav";
import type { AdminNavItem, AdminSection } from "./adminNav";

const COLLAPSE_KEY = "hkscda-admin-sidebar-collapsed";

interface AdminLayoutProps {
  children: ReactNode;
  activeSection: AdminSection;
}

function NavList({
  activeIds,
  collapsed,
  onNavigate,
}: {
  activeIds: Set<string>;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const { copy } = useAdminLanguage();
  const itemLabel = (item: AdminNavItem) => copy.navItems[item.id] ?? item.label;

  return (
    <nav className="flex-1 space-y-4 overflow-y-auto p-2">
      {ADMIN_NAV_GROUPS.map((group) => {
        const items = ADMIN_NAV_ITEMS.filter((item) => item.group === group.id);
        if (items.length === 0) return null;
        return (
          <div key={group.id} className="space-y-1">
            {!collapsed && (
              <p className="px-3 pb-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {copy.navGroups[group.id] ?? group.label}
              </p>
            )}
            {items.map((item) => {
              const Icon = item.icon;
              const active = activeIds.has(item.id);
              const label = itemLabel(item);
              return (
                <Link
                  key={item.id}
                  to={item.to}
                  onClick={onNavigate}
                  title={collapsed ? label : undefined}
                  aria-label={label}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors md:min-h-0 md:py-2",
                    collapsed && "md:justify-center md:px-0",
                    active
                      ? "bg-slate-700 text-white"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white",
                  )}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                  <span className={cn(collapsed && "md:hidden")}>{label}</span>
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
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
    <div className="border-t border-slate-800 p-2">
      {!collapsed && email && (
        <p className="truncate px-3 pb-1.5 text-xs text-slate-400" title={email}>
          {email}
        </p>
      )}
      <button
        type="button"
        onClick={onLogout}
        title={collapsed ? copy.common.logout : undefined}
        className={cn(
          "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm text-slate-300 transition-colors hover:bg-slate-800 hover:text-white md:min-h-0 md:py-2",
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
  const { copy } = useAdminLanguage();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    void supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null));
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/admin/login" });
  }

  const activeIds = new Set(getActiveAdminNavItemIds(ADMIN_NAV_ITEMS, pathname, activeSection));

  return (
    <div className="flex min-h-dvh">
      <aside
        className={cn(
          "hidden flex-shrink-0 flex-col bg-slate-900 text-slate-100 transition-[width] duration-200 md:flex",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <div className="border-b border-slate-800 p-3">
          <div className="flex items-center justify-between">
            {!collapsed && (
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                {copy.common.appTitle}
              </span>
            )}
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={collapsed ? copy.layout.expandSidebar : copy.layout.collapseSidebar}
              className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
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
        <NavList activeIds={activeIds} collapsed={collapsed} />
        <AccountFooter email={email} collapsed={collapsed} onLogout={handleLogout} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-2 border-b border-slate-200 bg-white px-2 md:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              aria-label={copy.layout.openMenu}
              className="flex h-11 w-11 items-center justify-center rounded-md text-slate-700 transition-colors hover:bg-slate-100"
            >
              <Menu className="h-6 w-6" />
            </SheetTrigger>
            <SheetContent
              side="left"
              className="flex w-64 flex-col gap-0 border-slate-800 bg-slate-900 p-0 text-slate-100"
            >
              <div className="border-b border-slate-800 px-4 py-4">
                <SheetTitle className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  {copy.common.appTitle}
                </SheetTitle>
                <div className="mt-3">
                  <AdminLanguageToggle />
                </div>
              </div>
              <NavList
                activeIds={activeIds}
                collapsed={false}
                onNavigate={() => setMobileOpen(false)}
              />
              <AccountFooter email={email} collapsed={false} onLogout={handleLogout} />
            </SheetContent>
          </Sheet>
          <span className="text-sm font-bold uppercase tracking-wider text-slate-700">
            {copy.common.appTitle}
          </span>
        </header>

        <main className="flex-1 overflow-auto bg-gray-50">{children}</main>
      </div>
    </div>
  );
}
