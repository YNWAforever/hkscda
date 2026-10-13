import { createFileRoute, redirect } from "@tanstack/react-router";
import { VolunteerAdminShell } from "../../../components/admin/VolunteerAdminShell";
import { VolunteerActivityWorkspace } from "../../../components/admin/volunteers/VolunteerActivityWorkspace";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";
import { buildLegacyPendingHref } from "../../../components/admin/volunteers/activityReturnState";
export const Route = createFileRoute("/admin/volunteers/activities")({
  ssr: false,
  beforeLoad: async ({ context, location }) => {
    await requireAdminPageAccess("volunteerManagement", context.queryClient);
    if (new URLSearchParams(location.searchStr).get("registration_status") === "pending")
      throw redirect({ href: buildLegacyPendingHref(new URLSearchParams(location.searchStr)) });
  },
  component: () => (
    <VolunteerAdminShell>
      <VolunteerActivityWorkspace />
    </VolunteerAdminShell>
  ),
});
