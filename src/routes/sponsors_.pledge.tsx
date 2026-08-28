import { createFileRoute } from "@tanstack/react-router";
import { publicUrl } from "@/lib/publicOrigin";

import { PublicFormFrame } from "../components/site/PublicFormFrame";
import { PledgeWizard } from "../components/site/sponsorship/PledgeWizard";

export const Route = createFileRoute("/sponsors_/pledge")({
  head: () => ({
    links: [{ rel: "canonical", href: publicUrl("/sponsors/pledge") }],
  }),
  component: PledgePage,
});

export function PledgePage() {
  return (
    <PublicFormFrame
      breadcrumbHref="/sponsors"
      breadcrumbLabel="返回助養區"
      trustNote="你的個人資料只會用於處理助養承諾及聯絡，不會作其他用途。"
    >
      <PledgeWizard />
    </PublicFormFrame>
  );
}
