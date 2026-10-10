import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { useAdminLanguage } from "../../components/admin/adminI18n";
import { PledgeReviewLane } from "../../components/admin/sponsorship/PledgeReviewLane";
import { requireAdminPageAccess } from "../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/sponsorships")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("sponsorshipRead", context.queryClient);
  },
  component: () => (
    <AdminLayout activeSection="payments">
      <SponsorshipsContent />
    </AdminLayout>
  ),
});

/** The page title is the navigation label, so the two always read the same. */
export function SponsorshipsContent() {
  const { copy } = useAdminLanguage();
  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold">{copy.navItems["sponsorship-pledges"]}</h1>
      <PledgeReviewLane />
    </div>
  );
}
