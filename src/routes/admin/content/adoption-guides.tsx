import { createFileRoute } from "@tanstack/react-router";

import { AdoptionGuideReleaseManagement } from "../../../components/admin/content/AdoptionGuideReleaseManagement";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/content/adoption-guides")({
  beforeLoad: () => requireAdminPageAccess("contentManagement"),
  component: AdminAdoptionGuideReleasesPage,
});

function AdminAdoptionGuideReleasesPage() {
  return <AdoptionGuideReleaseManagement />;
}
