import { createFileRoute } from "@tanstack/react-router";

import { AdminLayout } from "../../../components/admin/AdminLayout";
import { ContentEditor } from "../../../components/admin/content/ContentEditor";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/content/$id")({
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("contentManagement", context.queryClient);
  },
  component: AdminContentEditorPage,
});

function AdminContentEditorPage() {
  const { id } = Route.useParams();

  return (
    <AdminLayout activeSection="content">
      <ContentEditor contentId={id} />
    </AdminLayout>
  );
}
