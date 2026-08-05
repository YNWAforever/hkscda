import { createFileRoute } from "@tanstack/react-router";

import { AdminLayout } from "../../../components/admin/AdminLayout";
import { StatusAdmin } from "../../../components/admin/adoptions/StatusAdmin";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/coordinator/statuses")({
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("coordinatorStatuses", context.queryClient);
  },
  component: CoordinatorStatusesPage,
});

function CoordinatorStatusesPage() {
  return (
    <AdminLayout activeSection="applications">
      <StatusAdmin />
    </AdminLayout>
  );
}
