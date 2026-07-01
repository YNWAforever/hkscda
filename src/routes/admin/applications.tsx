import { createFileRoute, Outlet } from "@tanstack/react-router";

import { AdminLayout } from "../../components/admin/AdminLayout";
import { requireAdminPageAccess } from "../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/applications")({
  beforeLoad: async () => {
    await requireAdminPageAccess("adoptionCases");
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
