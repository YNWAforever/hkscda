import { createFileRoute } from "@tanstack/react-router";

import { VolunteerAdminShell } from "../../../../components/admin/VolunteerAdminShell";
import { VolunteerRegistrationDetail } from "../../../../components/admin/volunteers/VolunteerRegistrationDetail";
import { requireAdminPageAccess } from "../../../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/volunteers/registrations/$id")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("volunteerManagement", context.queryClient);
  },
  component: AdminVolunteerRegistrationDetailPage,
});

function AdminVolunteerRegistrationDetailPage() {
  const { id } = Route.useParams();

  return (
    <VolunteerAdminShell>
      <VolunteerRegistrationDetail registrationId={id} />
    </VolunteerAdminShell>
  );
}
