import { createFileRoute } from "@tanstack/react-router";
import { VolunteerAdminShell } from "../../../components/admin/VolunteerAdminShell";
import { VolunteerCalendar } from "../../../components/admin/volunteers/VolunteerCalendar";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";
export const Route = createFileRoute("/admin/volunteers/calendar")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("volunteerManagement", context.queryClient);
  },
  component: () => (
    <VolunteerAdminShell>
      <VolunteerCalendar />
    </VolunteerAdminShell>
  ),
});
