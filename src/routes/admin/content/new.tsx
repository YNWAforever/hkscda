import { createFileRoute } from "@tanstack/react-router";

import { AdminLayout } from "../../../components/admin/AdminLayout";
import { ContentCreateForm } from "../../../components/admin/content/ContentCreateForm";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/content/new")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("contentManagement", context.queryClient);
  },
  component: AdminContentNewPage,
});

function AdminContentNewPage() {
  return (
    <AdminLayout activeSection="content">
      <ContentCreateForm />
    </AdminLayout>
  );
}
