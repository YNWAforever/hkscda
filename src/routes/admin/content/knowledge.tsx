import { createFileRoute } from "@tanstack/react-router";

import { AdminLayout } from "../../../components/admin/AdminLayout";
import { KnowledgeManagement } from "../../../components/admin/content/KnowledgeManagement";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/content/knowledge")({
  beforeLoad: async () => {
    await requireAdminPageAccess("contentManagement");
  },
  component: AdminKnowledgeContentPage,
});

export function AdminKnowledgeContentPage() {
  return (
    <AdminLayout activeSection="content">
      <KnowledgeManagement />
    </AdminLayout>
  );
}
