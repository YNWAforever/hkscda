import { createFileRoute } from "@tanstack/react-router";

import { AdminLayout } from "../../../components/admin/AdminLayout";
import { AdoptionInformationManagement } from "../../../components/admin/content/AdoptionInformationManagement";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/content/adoption")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("contentManagement", context.queryClient);
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
