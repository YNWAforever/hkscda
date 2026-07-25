import { createFileRoute } from "@tanstack/react-router";

import { AdminLayout } from "../../../components/admin/AdminLayout";
import { GroupEnquiryManagement } from "../../../components/admin/volunteers/GroupEnquiryManagement";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/volunteers/group-enquiries")({
  beforeLoad: async () => {
    await requireAdminPageAccess("volunteerManagement");
  },
  component: AdminVolunteerGroupEnquiriesPage,
});

function AdminVolunteerGroupEnquiriesPage() {
  return (
    <AdminLayout activeSection="volunteers">
      <GroupEnquiryManagement />
    </AdminLayout>
  );
}
