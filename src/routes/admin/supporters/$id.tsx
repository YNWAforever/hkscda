import { createFileRoute } from "@tanstack/react-router";

import { AdminLayout } from "../../../components/admin/AdminLayout";
import { SupporterDetail } from "../../../components/admin/crm/SupporterDetail";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/supporters/$id")({
  beforeLoad: async () => {
    await requireAdminPageAccess("supporters");
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
