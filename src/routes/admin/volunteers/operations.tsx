import { createFileRoute } from "@tanstack/react-router";
import { VolunteerAdminShell } from "../../../components/admin/VolunteerAdminShell";
import { VolunteerOperations } from "../../../components/admin/volunteers/VolunteerOperations";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";
export const Route = createFileRoute("/admin/volunteers/operations")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("volunteerManagement", context.queryClient);
  },
  component: () => (
    <VolunteerAdminShell>
      <VolunteerOperations />
    </VolunteerAdminShell>
  ),
});
