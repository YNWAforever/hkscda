import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { VolunteerAdminShell } from "../../../components/admin/VolunteerAdminShell";
import { VolunteerTasks } from "../../../components/admin/volunteers/VolunteerTasks";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";
import { readPendingActivityReturnState } from "../../../components/admin/volunteers/activityReturnState";
export const Route = createFileRoute("/admin/volunteers/tasks")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("volunteerManagement", context.queryClient);
  },
  component: VolunteerTasksPage,
});
function VolunteerTasksPage() {
  const search = useRouterState({ select: (state) => state.location.searchStr });
  return (
    <VolunteerAdminShell>
      <VolunteerTasks returnState={readPendingActivityReturnState(new URLSearchParams(search))} />
    </VolunteerAdminShell>
  );
}
