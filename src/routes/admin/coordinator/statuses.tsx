import { createFileRoute, redirect } from "@tanstack/react-router";

import { AdminLayout } from "../../../components/admin/AdminLayout";
import { StatusAdmin } from "../../../components/admin/adoptions/StatusAdmin";
import { supabase } from "../../../lib/supabase";

export const Route = createFileRoute("/admin/coordinator/statuses")({
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/admin/login" });
  },
  component: CoordinatorStatusesPage,
});

function CoordinatorStatusesPage() {
  return (
    <AdminLayout activeSection="applications">
      <StatusAdmin />
    </AdminLayout>
  );
}
