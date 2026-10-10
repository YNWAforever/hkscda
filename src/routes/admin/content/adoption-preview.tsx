import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { AdminLanguageProvider } from "../../../components/admin/adminI18n";
import { useAdminCopy } from "../../../components/admin/i18n/copy";
import { AdoptionInstructionsContent } from "../../adoption/instructions";
import { fetchAdminJson } from "../../../lib/admin/session";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";
import { getPublicAdoptionPage } from "../../../lib/adoptionInformation/publicPage.functions";
import type { PublicAdoptionPageData } from "../../../lib/adoptionInformation/publicPage.server";
import { loadAdoptionInstructionPreview } from "../../../lib/adoptionInstructions/preview";
import type { AdoptionInstructionRevision } from "../../../lib/adoptionInstructions/types";
import { adoptionPreviewCopy } from "./-adoptionPreviewCopy";
import { LoadFailure } from "../../../components/admin/LoadFailure";

export const Route = createFileRoute("/admin/content/adoption-preview")({
  ssr: false,
  beforeLoad: ({ context }) => requireAdminPageAccess("contentManagement", context.queryClient),
  component: AdoptionInstructionsPreviewPage,
});

/**
 * The preview opens in a tab of its own, outside the admin layout, so it mounts its own language
 * provider to follow the language the admin chose.
 */
export function AdoptionInstructionsPreviewPage() {
  return (
    <AdminLanguageProvider>
      <AdoptionInstructionsPreview />
    </AdminLanguageProvider>
  );
}

function AdoptionInstructionsPreview() {
  const copy = useAdminCopy(adoptionPreviewCopy);
  const preview = useQuery({
    queryKey: ["adoption-instructions", "preview"],
    async queryFn(): Promise<PublicAdoptionPageData> {
      return loadAdoptionInstructionPreview(getPublicAdoptionPage, () =>
        fetchAdminJson<AdoptionInstructionRevision>("/api/admin/adoption-instructions/preview"),
      );
    },
  });

  if (preview.isPending) {
    return <p className="p-6 text-[var(--color-text-muted)]">{copy.loading}</p>;
  }

  if (preview.error) {
    return (
      <LoadFailure
        error={preview.error}
        onRetry={() => void preview.refetch()}
        title={copy.failed}
        className="m-6"
      />
    );
  }

  if (!preview.data) {
    return (
      <p role="alert" className="p-6 text-[var(--color-error)]">
        {copy.failed}
      </p>
    );
  }

  return <AdoptionInstructionsContent data={preview.data} />;
}
