import { createFileRoute } from "@tanstack/react-router";

import { AccessManagement } from "../../components/admin/access/AccessManagement";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { requireAdminPageAccess } from "../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/access")({
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("accessManagement", context.queryClient);
  },
  component: AdminAccessPage,
});

function AdminAccessPage() {
  return (
    <AdminLayout activeSection="access">
      <AccessManagement />
    </AdminLayout>
  );
}
