import { TaskPageHeader } from "../../components/site/TaskPageHeader";
import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/pageHead";

import { PublicFormFrame } from "../../components/site/PublicFormFrame";
import { GroupEnquiryForm } from "../../components/site/volunteer/GroupEnquiryForm";

export const Route = createFileRoute("/volunteer/group")({
  head: () =>
    pageHead({
      title: "團體活動查詢",
      description: "本頁僅供註冊團體使用。提交團體義工工作坊、入校講座或貓狗舍教育參觀活動查詢。",
      path: "/volunteer/group",
    }),
  component: VolunteerGroupPage,
});

export function VolunteerGroupPage() {
  return (
    <PublicFormFrame
      breadcrumbHref="/volunteer"
      breadcrumbLabel="返回個人義工報名"
      trustNote="你的個人資料只會用於處理團體活動查詢及聯絡，不會作其他用途。"
    >
      <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <TaskPageHeader kicker="企業及團體參與" title="團體活動查詢">
          <p>本頁僅供註冊團體使用。</p>
          <p>
            如學校、企業或機構希望安排義工工作坊、入校講座或教育參觀，請填寫以下資料，我們會按查詢內容回覆。
          </p>
        </TaskPageHeader>
        <GroupEnquiryForm />
      </main>
    </PublicFormFrame>
  );
}
