import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";

import { VolunteerAdminShell } from "../../components/admin/VolunteerAdminShell";
import { VolunteerOverview } from "../../components/admin/volunteers/VolunteerOverview";
import { requireAdminPageAccess } from "../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/volunteers")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("volunteerManagement", context.queryClient);
  },
  component: AdminVolunteersPage,
});

function AdminVolunteersPage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (pathname !== "/admin/volunteers" && pathname !== "/admin/volunteers/") return <Outlet />;

  return (
    <VolunteerAdminShell>
      <VolunteerOverview />
    </VolunteerAdminShell>
  );
}
