import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "../../../components/admin/AdminLayout";
import { VolunteerPolicySources } from "../../../components/admin/volunteers/VolunteerPolicySources";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";
export const Route = createFileRoute("/admin/volunteers/sources")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("volunteerPolicyManagement", context.queryClient);
  },
  component: Page,
});
function Page() {
  return (
    <AdminLayout activeSection="volunteers">
      <VolunteerPolicySources />
    </AdminLayout>
  );
}
