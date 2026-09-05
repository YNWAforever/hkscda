import { createFileRoute } from "@tanstack/react-router";

import { AdminLayout } from "../../../components/admin/AdminLayout";
import { CoordinatorReports } from "../../../components/admin/adoptions/CoordinatorReports";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/coordinator/reports")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("coordinatorReports", context.queryClient);
  },
  component: CoordinatorReportsPage,
});

function CoordinatorReportsPage() {
  return (
    <AdminLayout activeSection="applications">
      <CoordinatorReports />
    </AdminLayout>
  );
}
