import { createFileRoute } from "@tanstack/react-router";
import { VolunteerAdminShell } from "../../../components/admin/VolunteerAdminShell";
import { VolunteerPolicySimulation } from "../../../components/admin/volunteers/VolunteerPolicySimulation";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";
export const Route = createFileRoute("/admin/volunteers/simulation")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("volunteerPolicyManagement", context.queryClient);
  },
  component: Page,
});
function Page() {
  return (
    <VolunteerAdminShell>
      <VolunteerPolicySimulation />
    </VolunteerAdminShell>
  );
}
