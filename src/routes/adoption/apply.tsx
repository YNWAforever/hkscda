import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/pageHead";

import { PublicFormFrame } from "../../components/site/PublicFormFrame";
import { ApplicationWizard } from "../../components/site/adoption/ApplicationWizard";

export const Route = createFileRoute("/adoption/apply")({
  head: () =>
    pageHead({
      title: "領養申請",
      description:
        "開始前請準備聯絡及住屋資料、照顧安排、可探望日期，以及家居安全相片；相片請勿包含證件或門牌。",
      path: "/adoption/apply",
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
