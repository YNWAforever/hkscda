import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";

import { AdminLayout } from "../../../components/admin/AdminLayout";
import { AdopterList } from "../../../components/admin/adoptions/AdopterList";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/coordinator/adopters")({
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("adopters", context.queryClient);
  },
  component: CoordinatorAdoptersPage,
});

function CoordinatorAdoptersPage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (pathname !== "/admin/coordinator/adopters") return <Outlet />;

  return (
    <AdminLayout activeSection="applications">
      <AdopterList />
    </AdminLayout>
  );
}
