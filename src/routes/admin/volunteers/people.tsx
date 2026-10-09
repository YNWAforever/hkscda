import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { VolunteerAdminShell } from "../../../components/admin/VolunteerAdminShell";
import { VolunteerDirectory } from "../../../components/admin/volunteers/VolunteerDirectory";
import { parseDirectorySearch } from "../../../components/admin/volunteers/directorySearch";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";
export const Route = createFileRoute("/admin/volunteers/people")({
  ssr: false,
  validateSearch: parseDirectorySearch,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("volunteerManagement", context.queryClient);
  },
  component: PeoplePage,
});
function PeoplePage() {
  const search = Route.useSearch();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (pathname.replace(/\/$/, "") !== "/admin/volunteers/people") return <Outlet />;
  return (
    <VolunteerAdminShell intro="people">
      <VolunteerDirectory search={search} />
    </VolunteerAdminShell>
  );
}
