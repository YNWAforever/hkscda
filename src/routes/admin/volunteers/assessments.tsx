import { VolunteerAssessments } from "../../../components/admin/volunteers/VolunteerAssessments";
import { VolunteerAdminShell } from "../../../components/admin/VolunteerAdminShell";
import { createFileRoute } from "@tanstack/react-router";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";
export const Route = createFileRoute("/admin/volunteers/assessments")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("volunteerPolicyManagement", context.queryClient);
  },
  component: AssessmentWorkspace,
});
function AssessmentWorkspace() {
  return (
    <VolunteerAdminShell>
      <VolunteerAssessments />
    </VolunteerAdminShell>
  );
}
