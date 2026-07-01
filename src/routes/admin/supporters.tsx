import { createFileRoute } from "@tanstack/react-router";

import { AdminLayout } from "../../components/admin/AdminLayout";
import { SupporterList } from "../../components/admin/crm/SupporterList";
import { requireAdminPageAccess } from "../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/supporters")({
  beforeLoad: async () => {
    await requireAdminPageAccess("supporters");
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
