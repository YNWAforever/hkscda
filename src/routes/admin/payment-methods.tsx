import { createFileRoute } from "@tanstack/react-router";

import { AdminLayout } from "../../components/admin/AdminLayout";
import { PaymentMethodsManagement } from "../../components/admin/content/PaymentMethodsManagement";
import { requireAdminPageAccess } from "../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/payment-methods")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("payments", context.queryClient);
  },
  component: AdminPaymentMethodsPage,
});

export function AdminPaymentMethodsPage() {
  return (
    <AdminLayout activeSection="payments">
      <PaymentMethodsManagement />
    </AdminLayout>
  );
}
