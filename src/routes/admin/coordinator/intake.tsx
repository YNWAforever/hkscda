import { createFileRoute, redirect } from "@tanstack/react-router";

import { AdminLayout } from "../../../components/admin/AdminLayout";
import { ManualCaseIntake } from "../../../components/admin/adoptions/ManualCaseIntake";
import { supabase } from "../../../lib/supabase";

export const Route = createFileRoute("/admin/coordinator/intake")({
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/admin/login" });
  },
  component: CoordinatorIntakePage,
});

function CoordinatorIntakePage() {
  return (
    <AdminLayout activeSection="applications">
      <ManualCaseIntake />
    </AdminLayout>
  );
}
