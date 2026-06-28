import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";

import { AdminLayout } from "../../../components/admin/AdminLayout";
import { AdopterList } from "../../../components/admin/adoptions/AdopterList";
import { supabase } from "../../../lib/supabase";

export const Route = createFileRoute("/admin/coordinator/adopters")({
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/admin/login" });
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
