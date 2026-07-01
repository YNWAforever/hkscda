import { Info, ShieldCheck } from "lucide-react";

export type GuidanceStepId =
  | "animals"
  | "contact"
  | "home"
  | "readiness"
  | "visit"
  | "photos"
  | "review";

const GUIDANCE_COPY: Record<
  GuidanceStepId,
  {
    zh: string;
    en: string;
    reminder?: string;
  }
> = {
  animals: {
    zh: "排序能幫助義工了解你的首選和可接受的配對範圍。若第一選擇已安排面見，我們仍可按排序跟進其他合適動物。",
    en: "Ranking helps volunteers understand your first choice and nearby matches if one animal is already in progress.",
  },
  contact: {
    zh: "聯絡資料用於核實申請人身份、安排通話，以及確認家庭成員是否已知悉申請。",
    en: "Contact and household details help us verify the applicant, arrange calls, and understand who shares the home.",
  },
  home: {
    zh: "家居資料讓我們預早判斷窗門安全、業主限制和活動空間，減少面見後才發現不可行的情況。",
    en: "Home details let us review safety, restrictions, and space before a visit is arranged.",
  },
  readiness: {
    zh: "照顧準備題目集中在日常時間、預算、突發醫療和家庭共識，幫助我們找出長期穩定的配對。",
    en: "Care readiness questions focus on routine, budget, emergency plans, and household agreement.",
  },
  visit: {
    zh: "探望時段會交給義工協調，日期範圍越清楚，越容易安排最少往返的面見路線。",
    en: "Visit preferences help coordinators group appointments and reduce back-and-forth scheduling.",
  },
  photos: {
    zh: "相片只用於了解安全環境，不需要拍攝身份證、住戶姓名、門牌或其他私隱資料。",
    en: "Photos are only for home-safety review. Do not include IDs, names, door numbers, or private documents.",
    reminder: "相片不會被草稿自動儲存；提交前請保持此分頁開啟。",
  },
  review: {
    zh: "提交前請確認排序、聯絡資料和探望日期。成功提交後才會清除清單和本機草稿。",
    en: "Before submission, confirm the ranking, contact details, and visit dates. Draft data clears only after a successful response.",
  },
};

export function GuidancePanel({ stepId }: { stepId: GuidanceStepId }) {
  const copy = GUIDANCE_COPY[stepId];
  const iconClass = "mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]";

  return (
    <aside className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
      <div className="flex items-start gap-3">
        <Info className={iconClass} />
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-[var(--color-panel)]">
            領養小助手
            <span className="ml-2 font-body text-xs font-medium text-[var(--color-text-muted)]">
              Adoption guide
            </span>
          </h2>
          <p className="text-sm leading-6 text-[var(--color-text)]">{copy.zh}</p>
          <p className="text-xs leading-5 text-[var(--color-text-muted)]">{copy.en}</p>
        </div>
      </div>

      {copy.reminder ? (
        <div className="mt-4 flex items-start gap-3 rounded-md bg-[var(--color-primary-highlight)] px-3 py-2 text-sm text-[var(--color-panel)]">
          <ShieldCheck className={iconClass} />
          <p>{copy.reminder}</p>
        </div>
      ) : null}
    </aside>
  );
}
