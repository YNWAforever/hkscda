import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "../../../components/admin/AdminLayout";
import { VolunteerCalendar } from "../../../components/admin/volunteers/VolunteerCalendar";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";
export const Route = createFileRoute("/admin/volunteers/calendar")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("volunteerManagement", context.queryClient);
  },
  component: () => (
    <AdminLayout activeSection="volunteers">
      <VolunteerCalendar />
    </AdminLayout>
  ),
});
