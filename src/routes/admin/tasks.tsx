import { createFileRoute } from "@tanstack/react-router";

import { AdminLayout } from "../../components/admin/AdminLayout";
import { TaskOverviewPage } from "../../components/admin/operations/TaskOverview";
import { requireAdminPageAccess } from "../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/tasks")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("taskOverview", context.queryClient);
  },
  component: AdminTasksPage,
});

function AdminTasksPage() {
  return (
    <AdminLayout activeSection="tasks">
      <TaskOverviewPage />
    </AdminLayout>
  );
}
