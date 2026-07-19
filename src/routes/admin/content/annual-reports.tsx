import { createFileRoute } from "@tanstack/react-router";

import { AdminLayout } from "../../../components/admin/AdminLayout";
import { AnnualReportManagement } from "../../../components/admin/content/AnnualReportManagement";

export const Route = createFileRoute("/admin/content/annual-reports")({
  component: AdminAnnualReportManagementPage,
});

function AdminAnnualReportManagementPage() {
  return (
    <AdminLayout activeSection="content">
      <AnnualReportManagement />
    </AdminLayout>
  );
}
