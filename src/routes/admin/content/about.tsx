import { createFileRoute } from "@tanstack/react-router";

import { AdminLayout } from "../../../components/admin/AdminLayout";
import { AboutPagesManagement } from "../../../components/admin/content/AboutPagesManagement";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/content/about")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("contentManagement", context.queryClient);
  },
  component: AdminAboutPagesPage,
});

export function AdminAboutPagesPage() {
  return (
    <AdminLayout activeSection="content">
      <AboutPagesManagement />
    </AdminLayout>
  );
}
