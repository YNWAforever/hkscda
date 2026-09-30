import { createFileRoute } from "@tanstack/react-router";

import { AdminLayout } from "../../components/admin/AdminLayout";
import { TaskOverview } from "../../components/admin/operations/TaskOverview";
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
      <main className="space-y-5 p-4 sm:p-6">
        <h1 className="text-2xl font-bold">待辦總覽</h1>
        <p className="text-[var(--color-text-muted)]">
          按你目前的職員權限顯示工作量。未能讀取的來源會顯示未知，請到工作區核對及處理。
        </p>
        <TaskOverview />
      </main>
    </AdminLayout>
  );
}
