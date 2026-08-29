import { createFileRoute } from "@tanstack/react-router";

import { AdminLayout } from "../../components/admin/AdminLayout";
import { GovernanceManagement } from "../../components/admin/content/GovernanceManagement";
import { requireAdminPageAccess } from "../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/governance")({
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("governanceManagement", context.queryClient);
  },
  component: AdminGovernancePage,
});

export function AdminGovernancePage() {
  return (
    <AdminLayout activeSection="content">
      <GovernanceManagement />
    </AdminLayout>
  );
}
