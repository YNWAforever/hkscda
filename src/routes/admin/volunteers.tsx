import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";

import { AdminLayout } from "../../components/admin/AdminLayout";
import { VolunteerManagement } from "../../components/admin/volunteers/VolunteerManagement";
import { requireAdminPageAccess } from "../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/volunteers")({
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("volunteerManagement", context.queryClient);
  },
  component: AdminVolunteersPage,
});

function AdminVolunteersPage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (pathname !== "/admin/volunteers" && pathname !== "/admin/volunteers/") return <Outlet />;

  return (
    <AdminLayout activeSection="volunteers">
      <VolunteerManagement />
    </AdminLayout>
  );
}
