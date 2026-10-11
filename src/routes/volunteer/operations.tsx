import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/pageHead";
import { VolunteerOperations } from "../../components/admin/volunteers/VolunteerOperations";
export const Route = createFileRoute("/volunteer/operations")({
  ssr: false,
  head: () =>
    pageHead({
      title: "團體申請及義工改期",
      description: "提交團體義工申請，或為已確認的義工時段申請改期。",
      path: "/volunteer/operations",
    }),
  // The workspace is shared with the admin calendar; on the public site it sits
  // on the page grid and takes the public task-page heading size.
  component: () => (
    <main className="public-container volunteer-operations-public">
      <VolunteerOperations publicMode />
    </main>
  ),
});
