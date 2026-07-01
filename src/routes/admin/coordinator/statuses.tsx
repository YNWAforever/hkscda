import { createFileRoute } from "@tanstack/react-router";

import { AdminLayout } from "../../../components/admin/AdminLayout";
import { StatusAdmin } from "../../../components/admin/adoptions/StatusAdmin";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/coordinator/statuses")({
  beforeLoad: async () => {
    await requireAdminPageAccess("coordinatorStatuses");
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
