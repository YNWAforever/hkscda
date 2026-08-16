import { createFileRoute } from "@tanstack/react-router";

import { AdminLayout } from "../../../../components/admin/AdminLayout";
import { VolunteerRegistrationDetail } from "../../../../components/admin/volunteers/VolunteerRegistrationDetail";
import { requireAdminPageAccess } from "../../../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/volunteers/registrations/$id")({
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("volunteerManagement", context.queryClient);
  },
  component: AdminVolunteerRegistrationDetailPage,
});

function AdminVolunteerRegistrationDetailPage() {
  const { id } = Route.useParams();

  return (
    <AdminLayout activeSection="volunteers">
      <VolunteerRegistrationDetail registrationId={id} />
    </AdminLayout>
  );
}
