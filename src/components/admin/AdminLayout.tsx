import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "../../lib/supabase";
import { ADMIN_NAV_ITEMS, getActiveAdminNavItemIds } from "./adminNav";
import type { AdminSection } from "./adminNav";

interface AdminLayoutProps {
  children: React.ReactNode;
  activeSection: AdminSection;
}

export function AdminLayout({ children, activeSection }: AdminLayoutProps) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/admin/login" });
  }

  const activeNavItemIds = new Set(
    getActiveAdminNavItemIds(ADMIN_NAV_ITEMS, pathname, activeSection),
  );

  return (
    <div className="flex min-h-screen">
      <aside className="w-52 bg-slate-900 text-slate-100 flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-slate-700">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            HKSCDA Admin
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {ADMIN_NAV_ITEMS.map((item) => (
            <Link
              key={item.id}
              to={item.to}
              className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                activeNavItemIds.has(item.id)
                  ? "bg-slate-700 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-700">
          <button
            onClick={handleLogout}
            className="w-full px-3 py-2 text-sm text-red-400 hover:text-red-300 text-left"
          >
            登出
          </button>
        </div>
      </aside>
      <main className="flex-1 bg-gray-50 overflow-auto">{children}</main>
    </div>
  );
}
