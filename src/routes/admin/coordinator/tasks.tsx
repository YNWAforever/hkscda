import { createFileRoute, redirect } from "@tanstack/react-router";

import { AdminLayout } from "../../../components/admin/AdminLayout";
import { TaskCenter } from "../../../components/admin/adoptions/TaskCenter";
import { supabase } from "../../../lib/supabase";

export const Route = createFileRoute("/admin/coordinator/tasks")({
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/admin/login" });
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
