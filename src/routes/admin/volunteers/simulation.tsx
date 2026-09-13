import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "../../../components/admin/AdminLayout";
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
    <AdminLayout activeSection="volunteers">
      <VolunteerPolicySimulation />
    </AdminLayout>
  );
}
