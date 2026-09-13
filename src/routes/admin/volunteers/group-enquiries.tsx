import { createFileRoute } from "@tanstack/react-router";

import { VolunteerAdminShell } from "../../../components/admin/VolunteerAdminShell";
import { GroupEnquiryManagement } from "../../../components/admin/volunteers/GroupEnquiryManagement";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/volunteers/group-enquiries")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("volunteerManagement", context.queryClient);
  },
  component: AdminVolunteerGroupEnquiriesPage,
});

function AdminVolunteerGroupEnquiriesPage() {
  return (
    <VolunteerAdminShell>
      <GroupEnquiryManagement />
    </VolunteerAdminShell>
  );
}
