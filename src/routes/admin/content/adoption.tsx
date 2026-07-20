import { createFileRoute } from "@tanstack/react-router";

import { AdminLayout } from "../../../components/admin/AdminLayout";
import { AdoptionInformationManagement } from "../../../components/admin/content/AdoptionInformationManagement";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/content/adoption")({
  beforeLoad: async () => {
    await requireAdminPageAccess("contentManagement");
  },
  component: AdminAdoptionInformationPage,
});

export function AdminAdoptionInformationPage() {
  return (
    <AdminLayout activeSection="content">
      <AdoptionInformationManagement />
    </AdminLayout>
  );
}
