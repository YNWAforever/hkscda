import { createFileRoute } from "@tanstack/react-router";

import { AdminLayout } from "../../../components/admin/AdminLayout";
import { IntakeInbox } from "../../../components/admin/adoptions/IntakeInbox";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/coordinator/inbox")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    // manualIntake, matching the sibling /admin/coordinator/intake route: this
    // page reads /api/admin/adoptions/intake/items, which the server gates with
    // requireCoordinator (staff + admin). The raw getSession() check this
    // replaced admitted any signed-in admin, so a treasurer reached the page and
    // then watched its only request fail with a 403.
    await requireAdminPageAccess("manualIntake", context.queryClient);
  },
  component: CoordinatorInboxPage,
});

function CoordinatorInboxPage() {
  return (
    <AdminLayout activeSection="applications">
      <IntakeInbox />
    </AdminLayout>
  );
}
