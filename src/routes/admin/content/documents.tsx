import { createFileRoute } from "@tanstack/react-router";

import { AdminLayout } from "../../../components/admin/AdminLayout";
import { DocumentManagement } from "../../../components/admin/content/DocumentManagement";

export const Route = createFileRoute("/admin/content/documents")({
  component: AdminDocumentManagementPage,
});

function AdminDocumentManagementPage() {
  return (
    <AdminLayout activeSection="content">
      <DocumentManagement />
    </AdminLayout>
  );
}
