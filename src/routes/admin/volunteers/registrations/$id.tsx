import { createFileRoute } from "@tanstack/react-router";

import { VolunteerAdminShell } from "../../../../components/admin/VolunteerAdminShell";
import { VolunteerRegistrationDetail } from "../../../../components/admin/volunteers/VolunteerRegistrationDetail";
import {
  registrationRouterSearch,
  readRegistrationReturnState,
} from "../../../../components/admin/volunteers/registrationReturnState";
import { requireAdminPageAccess } from "../../../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/volunteers/registrations/$id")({
  ssr: false,
  validateSearch: (
    search: Record<string, unknown>,
  ): Record<string, string | number | boolean | undefined> => {
    const state = readRegistrationReturnState(
      new URLSearchParams(
        Object.entries(search)
          .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
          .map(([key, value]) => [key, String(value)]),
      ),
    );
    return { ...registrationRouterSearch(state), return_from: state.from };
  },
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("volunteerManagement", context.queryClient);
  },
  component: AdminVolunteerRegistrationDetailPage,
});

function AdminVolunteerRegistrationDetailPage() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const returnState = readRegistrationReturnState(
    new URLSearchParams(Object.entries(search).map(([key, value]) => [key, String(value)])),
  );

  return (
    <VolunteerAdminShell>
      <VolunteerRegistrationDetail registrationId={id} returnState={returnState} />
    </VolunteerAdminShell>
  );
}
