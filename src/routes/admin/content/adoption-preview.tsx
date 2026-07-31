import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { AdoptionInstructionsContent } from "../../adoption/instructions";
import { fetchAdminJson } from "../../../lib/admin/session";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";
import { getPublicAdoptionPage } from "../../../lib/adoptionInformation/publicPage.functions";
import type { PublicAdoptionPageData } from "../../../lib/adoptionInformation/publicPage.server";
import { adoptionInstructionContentSchema } from "../../../lib/adoptionInstructions/schemas";
import type { AdoptionInstructionRevision } from "../../../lib/adoptionInstructions/types";

export const Route = createFileRoute("/admin/content/adoption-preview")({
  beforeLoad: () => requireAdminPageAccess("contentManagement"),
  component: AdoptionInstructionsPreviewPage,
});

export function AdoptionInstructionsPreviewPage() {
  const preview = useQuery({
    queryKey: ["adoption-instructions", "preview"],
    async queryFn(): Promise<PublicAdoptionPageData> {
      const [page, draft] = await Promise.all([
        getPublicAdoptionPage(),
        fetchAdminJson<AdoptionInstructionRevision>("/api/admin/adoption-instructions/preview"),
      ]);
      return { ...page, copy: adoptionInstructionContentSchema.parse(draft.content) };
    },
  });

  if (preview.isPending) {
    return <p className="p-6 text-[var(--color-text-muted)]">Loading adoption instructions preview…</p>;
  }

  if (preview.error || !preview.data) {
    return <p className="p-6 text-[var(--color-danger)]">Could not load adoption instructions preview.</p>;
  }

  return <AdoptionInstructionsContent data={preview.data} />;
}
