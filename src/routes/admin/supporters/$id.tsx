import { createFileRoute, redirect } from "@tanstack/react-router";

import { AdminLayout } from "../../../components/admin/AdminLayout";
import { SupporterDetail } from "../../../components/admin/crm/SupporterDetail";
import { supabase } from "../../../lib/supabase";

export const Route = createFileRoute("/admin/supporters/$id")({
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/admin/login" });
  },
  component: AdminSupporterDetailPage,
});

function AdminSupporterDetailPage() {
  const { id } = Route.useParams();

  return (
    <AdminLayout activeSection="supporters">
      <SupporterDetail supporterId={id} />
    </AdminLayout>
  );
}
