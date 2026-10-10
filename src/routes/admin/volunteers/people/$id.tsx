import { createFileRoute } from "@tanstack/react-router";
import { VolunteerAdminShell } from "../../../../components/admin/VolunteerAdminShell";
import { VolunteerPersonDetail } from "../../../../components/admin/volunteers/VolunteerPersonDetail";
import { parseDirectorySearch } from "../../../../components/admin/volunteers/directorySearch";
import { requireAdminPageAccess } from "../../../../lib/admin/pageAccess";
export const Route = createFileRoute("/admin/volunteers/people/$id")({
  ssr: false,
  validateSearch: parseDirectorySearch,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("volunteerManagement", context.queryClient);
  },
  component: PersonPage,
});
function PersonPage() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  return (
    <VolunteerAdminShell intro="person">
      <VolunteerPersonDetail profileId={id} search={search} />
    </VolunteerAdminShell>
  );
}
