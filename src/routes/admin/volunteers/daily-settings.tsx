import { createFileRoute } from "@tanstack/react-router";
import { VolunteerAdminShell } from "../../../components/admin/VolunteerAdminShell";
import { VolunteerDailySettings } from "../../../components/admin/volunteers/VolunteerDailySettings";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";
export const Route = createFileRoute("/admin/volunteers/daily-settings")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("volunteerPolicyManagement", context.queryClient);
  },
  component: Page,
});
function Page() {
  return (
    <VolunteerAdminShell>
      <VolunteerDailySettings />
    </VolunteerAdminShell>
  );
}
