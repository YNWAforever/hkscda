import { createFileRoute } from "@tanstack/react-router";
import { VolunteerAdminShell } from "../../../components/admin/VolunteerAdminShell";
import { VolunteerCalendar } from "../../../components/admin/volunteers/VolunteerCalendar";
export const Route = createFileRoute("/admin/volunteers/calendar")({
  ssr: false,
  // The /admin/volunteers parent checks this same area on every navigation.
  component: () => (
    <VolunteerAdminShell>
      <VolunteerCalendar />
    </VolunteerAdminShell>
  ),
});
