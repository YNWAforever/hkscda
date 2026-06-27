import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AdminLayout } from "../../components/admin/AdminLayout";
import { supabase } from "../../lib/supabase";

export const Route = createFileRoute("/admin/applications")({
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/admin/login" });
  },
  component: AdminApplicationsPage,
});

function AdminApplicationsPage() {
  return (
    <AdminLayout activeSection="applications">
      <Outlet />
    </AdminLayout>
  );
}
