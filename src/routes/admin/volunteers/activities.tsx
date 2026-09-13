import { createFileRoute } from "@tanstack/react-router";
import { VolunteerAdminShell } from "../../../components/admin/VolunteerAdminShell";
import { VolunteerManagement } from "../../../components/admin/volunteers/VolunteerManagement";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/volunteers/activities")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("volunteerManagement", context.queryClient);
  },
  component: () => (
    <VolunteerAdminShell>
      <VolunteerManagement />
    </VolunteerAdminShell>
  ),
});
