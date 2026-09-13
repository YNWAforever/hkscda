import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { PledgeReviewLane } from "../../components/admin/sponsorship/PledgeReviewLane";
import { requireAdminPageAccess } from "../../lib/admin/pageAccess";
export const Route = createFileRoute("/admin/sponsorships")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("sponsorshipRead", context.queryClient);
  },
  component: () => (
    <AdminLayout activeSection="payments">
      <div className="p-6">
        <h1 className="mb-4 text-xl font-semibold">助養收款及配對</h1>
        <PledgeReviewLane />
      </div>
    </AdminLayout>
  ),
});
