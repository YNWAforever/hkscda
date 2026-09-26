import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { AdoptionInstructionsContent } from "../../adoption/instructions";
import { fetchAdminJson } from "../../../lib/admin/session";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";
import { getPublicAdoptionPage } from "../../../lib/adoptionInformation/publicPage.functions";
import type { PublicAdoptionPageData } from "../../../lib/adoptionInformation/publicPage.server";
import { loadAdoptionInstructionPreview } from "../../../lib/adoptionInstructions/preview";
import type { AdoptionInstructionRevision } from "../../../lib/adoptionInstructions/types";

export const Route = createFileRoute("/admin/content/adoption-preview")({
  ssr: false,
  beforeLoad: ({ context }) => requireAdminPageAccess("contentManagement", context.queryClient),
  component: AdoptionInstructionsPreviewPage,
});

export function AdoptionInstructionsPreviewPage() {
  const preview = useQuery({
    queryKey: ["adoption-instructions", "preview"],
    async queryFn(): Promise<PublicAdoptionPageData> {
      return loadAdoptionInstructionPreview(getPublicAdoptionPage, () =>
        fetchAdminJson<AdoptionInstructionRevision>("/api/admin/adoption-instructions/preview"),
      );
    },
  });

  if (preview.isPending) {
    return <p className="p-6 text-[var(--color-text-muted)]">正在載入領養頁面預覽…</p>;
  }

  if (preview.error || !preview.data) {
    return <p className="p-6 text-[var(--color-danger)]">未能載入領養頁面預覽。</p>;
  }

  return <AdoptionInstructionsContent data={preview.data} />;
}
