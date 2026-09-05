import { createFileRoute } from "@tanstack/react-router";

import { AdminLayout } from "../../../components/admin/AdminLayout";
import { TaskCenter } from "../../../components/admin/adoptions/TaskCenter";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/coordinator/tasks")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("coordinatorTasks", context.queryClient);
  },
  component: CoordinatorTasksPage,
});

function CoordinatorTasksPage() {
  return (
    <AdminLayout activeSection="applications">
      <TaskCenter />
    </AdminLayout>
  );
}
