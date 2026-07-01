import { createFileRoute } from "@tanstack/react-router";

import { AdminLayout } from "../../../components/admin/AdminLayout";
import { ManualCaseIntake } from "../../../components/admin/adoptions/ManualCaseIntake";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/coordinator/intake")({
  beforeLoad: async () => {
    await requireAdminPageAccess("manualIntake");
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
