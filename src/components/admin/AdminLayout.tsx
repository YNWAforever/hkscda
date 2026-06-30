import { Link, useNavigate } from "@tanstack/react-router";
import { Cat, ClipboardList, Dog, HeartHandshake, LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "../../lib/supabase";
import { AdminLanguageProvider, AdminLanguageToggle, useAdminLanguage } from "./adminI18n";

type AdminSection = "cat" | "dog" | "sponsor" | "applications";

interface AdminLayoutProps {
  children: ReactNode;
  activeSection: AdminSection;
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
  const { copy } = useAdminLanguage();

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/admin/login" });
  }

  const navItems = [
    { section: "cat", label: copy.nav.cat, to: "/admin?section=cat", Icon: Cat },
    { section: "dog", label: copy.nav.dog, to: "/admin?section=dog", Icon: Dog },
    {
      section: "sponsor",
      label: copy.nav.sponsor,
      to: "/admin?section=sponsor",
      Icon: HeartHandshake,
    },
    {
      section: "applications",
      label: copy.nav.applications,
      to: "/admin?section=applications",
      Icon: ClipboardList,
    },
  ];

  return (
    <div className="flex min-h-screen">
      <aside className="w-52 bg-slate-900 text-slate-100 flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-slate-700">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            {copy.common.appTitle}
          </div>
          <div className="mt-3">
            <AdminLanguageToggle />
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.section}
              to={item.to}
              className={`flex min-h-11 items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                activeSection === item.section
                  ? "bg-slate-700 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              }`}
            >
              <item.Icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-700">
          <button
            onClick={handleLogout}
            className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 text-left transition-colors"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {copy.common.logout}
          </button>
        </div>
      </aside>
      <main className="flex-1 bg-gray-50 overflow-auto">{children}</main>
    </div>
  );
}
