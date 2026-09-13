import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { InternshipManagement } from "../../components/admin/internships/InternshipManagement";
import { requireAdminPageAccess } from "../../lib/admin/pageAccess";
export const Route = createFileRoute("/admin/internships")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("internshipManagement", context.queryClient);
  },
  component: () => (
    <AdminLayout activeSection="volunteers">
      <InternshipManagement />
    </AdminLayout>
  ),
});
