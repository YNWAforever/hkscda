import { createFileRoute } from "@tanstack/react-router";
import { VolunteerAdminShell } from "../../../components/admin/VolunteerAdminShell";
import { VolunteerTasks } from "../../../components/admin/volunteers/VolunteerTasks";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";
export const Route = createFileRoute("/admin/volunteers/tasks")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("volunteerManagement", context.queryClient);
  },
  component: () => (
    <VolunteerAdminShell>
      <VolunteerTasks />
    </VolunteerAdminShell>
  ),
});
