import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/pageHead";

import { PublicFormFrame } from "../components/site/PublicFormFrame";
import { PledgeWizard } from "../components/site/sponsorship/PledgeWizard";

export const Route = createFileRoute("/sponsors_/pledge")({
  head: () =>
    pageHead({
      title: "確認助養承諾",
      description: "選擇想助養的動物及每月金額並提交承諾；本會職員會再聯絡你確認正式付款安排。",
      path: "/sponsors/pledge",
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
