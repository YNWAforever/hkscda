import { createFileRoute } from "@tanstack/react-router";

import { AdminLayout } from "../../../components/admin/AdminLayout";
import { ManualCaseIntake } from "../../../components/admin/adoptions/ManualCaseIntake";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/coordinator/intake")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("manualIntake", context.queryClient);
  },
  component: CoordinatorIntakePage,
});

function CoordinatorIntakePage() {
  return (
    <AdminLayout activeSection="applications">
      <ManualCaseIntake />
    </AdminLayout>
  );
}
