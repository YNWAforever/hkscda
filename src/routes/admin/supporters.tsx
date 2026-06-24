import { createFileRoute, redirect } from "@tanstack/react-router";

import { AdminLayout } from "../../components/admin/AdminLayout";
import { SupporterList } from "../../components/admin/crm/SupporterList";
import { supabase } from "../../lib/supabase";

export const Route = createFileRoute("/admin/supporters")({
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/admin/login" });
  },
  component: AdminSupportersPage,
});

function AdminSupportersPage() {
  return (
    <AdminLayout activeSection="supporters">
      <SupporterList />
    </AdminLayout>
  );
}
