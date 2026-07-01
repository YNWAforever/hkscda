import { createFileRoute, redirect } from "@tanstack/react-router";

import { AdminLayout } from "../../../components/admin/AdminLayout";
import { IntakeInbox } from "../../../components/admin/adoptions/IntakeInbox";
import { supabase } from "../../../lib/supabase";

export const Route = createFileRoute("/admin/coordinator/inbox")({
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/admin/login" });
  },
  component: CoordinatorInboxPage,
});

function CoordinatorInboxPage() {
  return (
    <AdminLayout activeSection="applications">
      <IntakeInbox />
    </AdminLayout>
  );
}
