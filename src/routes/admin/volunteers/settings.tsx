import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "../../../components/admin/AdminLayout";
import { VolunteerPolicySettings } from "../../../components/admin/volunteers/VolunteerPolicySettings";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";
export const Route = createFileRoute("/admin/volunteers/settings")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("volunteerPolicyManagement", context.queryClient);
  },
  component: Page,
});
function Page() {
  return (
    <AdminLayout activeSection="volunteers">
      <VolunteerPolicySettings />
    </AdminLayout>
  );
}
