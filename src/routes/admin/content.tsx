import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";

import { AdminLayout } from "../../components/admin/AdminLayout";
import { ContentManagement } from "../../components/admin/content/ContentManagement";
import { requireAdminPageAccess } from "../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/content")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("contentManagement", context.queryClient);
  },
  component: AdminContentPage,
});

function AdminContentPage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (pathname !== "/admin/content" && pathname !== "/admin/content/") return <Outlet />;

  return (
    <AdminLayout activeSection="content">
      <AdminContentPlaceholder />
    </AdminLayout>
  );
}

function AdminContentPlaceholder() {
  return <ContentManagement />;
}
