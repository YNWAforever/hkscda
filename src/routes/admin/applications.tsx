import { createFileRoute, Outlet } from "@tanstack/react-router";

import { AdminLayout } from "../../components/admin/AdminLayout";
import { requireAdminPageAccess } from "../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/applications")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("adoptionCases", context.queryClient);
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
