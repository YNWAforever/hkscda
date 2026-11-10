import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { searchValidator } from "../../../lib/searchValidator";

import { AdminLayout } from "../../../components/admin/AdminLayout";
import { AdoptionGuideReleaseManagement } from "../../../components/admin/content/AdoptionGuideReleaseManagement";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";

const searchSchema = z.object({
  releaseId: z.string().uuid().optional(),
});

export const Route = createFileRoute("/admin/content/adoption-guides")({
  validateSearch: searchValidator(searchSchema),
  ssr: false,
  beforeLoad: ({ context }) => requireAdminPageAccess("contentManagement", context.queryClient),
  component: AdminAdoptionGuideReleasesPage,
});

function AdminAdoptionGuideReleasesPage() {
  const { releaseId } = Route.useSearch();
  return (
    <AdminLayout activeSection="content">
      <AdoptionGuideReleaseManagement initialReleaseId={releaseId} />
    </AdminLayout>
  );
}
