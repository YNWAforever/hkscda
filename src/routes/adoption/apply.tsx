import { createFileRoute } from "@tanstack/react-router";
import { publicUrl } from "@/lib/publicOrigin";

import { PublicFormFrame } from "../../components/site/PublicFormFrame";
import { ApplicationWizard } from "../../components/site/adoption/ApplicationWizard";

export const Route = createFileRoute("/adoption/apply")({
  head: () => ({
    links: [{ rel: "canonical", href: publicUrl("/adoption/apply") }],
  }),
  component: ApplyPage,
});

export function ApplyPage() {
  return (
    <PublicFormFrame
      breadcrumbHref="/adoption/instructions"
      breadcrumbLabel="返回領養須知"
      trustNote="你的個人資料只會用於處理領養申請及聯絡，不會作其他用途。"
    >
      <ApplicationWizard />
    </PublicFormFrame>
  );
}
