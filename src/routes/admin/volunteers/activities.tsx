import { createFileRoute, redirect } from "@tanstack/react-router";
import { VolunteerAdminShell } from "../../../components/admin/VolunteerAdminShell";
import { VolunteerActivityWorkspace } from "../../../components/admin/volunteers/VolunteerActivityWorkspace";
import { buildLegacyPendingHref } from "../../../components/admin/volunteers/activityReturnState";
export const Route = createFileRoute("/admin/volunteers/activities")({
  ssr: false,
  // The /admin/volunteers parent checks this same area on every navigation.
  beforeLoad: ({ location }) => {
    if (new URLSearchParams(location.searchStr).get("registration_status") === "pending")
      throw redirect({ href: buildLegacyPendingHref(new URLSearchParams(location.searchStr)) });
  },
  component: () => (
    <VolunteerAdminShell>
      <VolunteerActivityWorkspace />
    </VolunteerAdminShell>
  ),
});
