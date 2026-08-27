import { createFileRoute } from "@tanstack/react-router";
import { publicUrl } from "@/lib/publicOrigin";

import { GroupEnquiryForm } from "../../components/site/volunteer/GroupEnquiryForm";

export const Route = createFileRoute("/volunteer/group")({
  head: () => ({
    meta: [
      { title: "團體活動查詢 · 香港拯救貓狗協會 HKSCDA" },
      {
        name: "description",
        content: "本頁僅供註冊團體使用。提交團體義工工作坊、入校講座或貓狗舍教育參觀活動查詢。",
      },
    ],
    links: [{ rel: "canonical", href: publicUrl("/volunteer/group") }],
  }),
  component: VolunteerGroupPage,
});

function VolunteerGroupPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div className="space-y-3">
        <a
          href="/volunteer"
          className="text-sm font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
        >
          返回個人義工報名
        </a>
        <h1 className="font-display text-3xl font-bold lg:text-5xl">團體活動查詢</h1>
        <p className="text-[var(--color-text-muted)]">本頁僅供註冊團體使用。</p>
        <p className="text-sm text-[var(--color-text-muted)]">
          如學校、企業或機構希望安排義工工作坊、入校講座或教育參觀，請填寫以下資料，我們會按查詢內容回覆。
        </p>
      </div>
      <GroupEnquiryForm />
    </main>
  );
}
