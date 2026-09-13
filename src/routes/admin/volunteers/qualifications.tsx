import { createFileRoute } from "@tanstack/react-router";
import { VolunteerAdminShell } from "../../../components/admin/VolunteerAdminShell";
import { VolunteerQualifications } from "../../../components/admin/volunteers/VolunteerQualifications";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";
export const Route = createFileRoute("/admin/volunteers/qualifications")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("volunteerManagement", context.queryClient);
  },
  component: () => (
    <VolunteerAdminShell>
      <VolunteerQualifications />
    </VolunteerAdminShell>
  ),
});
