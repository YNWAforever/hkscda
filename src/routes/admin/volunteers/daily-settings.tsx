import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "../../../components/admin/AdminLayout";
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
    <AdminLayout activeSection="volunteers">
      <VolunteerDailySettings />
    </AdminLayout>
  );
}
