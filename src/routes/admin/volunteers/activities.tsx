import { createFileRoute, redirect } from "@tanstack/react-router";
import { VolunteerAdminShell } from "../../../components/admin/VolunteerAdminShell";
import { VolunteerActivityWorkspace } from "../../../components/admin/volunteers/VolunteerActivityWorkspace";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";
export const Route = createFileRoute("/admin/volunteers/activities")({
  ssr: false,
  beforeLoad: async ({ context, location }) => {
    await requireAdminPageAccess("volunteerManagement", context.queryClient);
    if (new URLSearchParams(location.searchStr).get("registration_status") === "pending")
      throw redirect({ href: "/admin/volunteers/tasks?pending_scope=all" });
  },
  component: () => (
    <VolunteerAdminShell>
      <VolunteerActivityWorkspace />
    </VolunteerAdminShell>
  ),
});
