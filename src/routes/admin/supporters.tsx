import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";

import { AdminLayout } from "../../components/admin/AdminLayout";
import { SupporterList } from "../../components/admin/crm/SupporterList";
import { requireAdminPageAccess } from "../../lib/admin/pageAccess";
import { isSupportersListPath } from "./-supportersRouteLogic";

export const Route = createFileRoute("/admin/supporters")({
  beforeLoad: async () => {
    await requireAdminPageAccess("supporters");
  },
  component: AdminSupportersPage,
});

function AdminSupportersPage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (!isSupportersListPath(pathname)) return <Outlet />;

  return (
    <AdminLayout activeSection="supporters">
      <SupporterList />
    </AdminLayout>
  );
}
