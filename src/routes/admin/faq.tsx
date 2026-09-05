import { createFileRoute } from "@tanstack/react-router";

import { AdminLayout } from "../../components/admin/AdminLayout";
import { FaqManagement } from "../../components/admin/content/FaqManagement";
import { requireAdminPageAccess } from "../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/faq")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("faqManagement", context.queryClient);
  },
  component: AdminFaqPage,
});

export function AdminFaqPage() {
  return (
    <AdminLayout activeSection="content">
      <FaqManagement />
    </AdminLayout>
  );
}
