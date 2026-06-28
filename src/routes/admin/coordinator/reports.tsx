import { createFileRoute, redirect } from "@tanstack/react-router";

import { AdminLayout } from "../../../components/admin/AdminLayout";
import { CoordinatorReports } from "../../../components/admin/adoptions/CoordinatorReports";
import { supabase } from "../../../lib/supabase";

export const Route = createFileRoute("/admin/coordinator/reports")({
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/admin/login" });
  },
  component: CoordinatorReportsPage,
});

function CoordinatorReportsPage() {
  return (
    <AdminLayout activeSection="applications">
      <CoordinatorReports />
    </AdminLayout>
  );
}
