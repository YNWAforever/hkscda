import { useMutation } from "@tanstack/react-query";

import { centsToHkd } from "../../../lib/donations/domain";
import type { ReminderDraftResult } from "../../../lib/sponsorshipAdmin/reminderDraft";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { fetchCoordinatorJson } from "../adoptions/api";

const unavailableCopy: Record<
  Extract<ReminderDraftResult, { kind: "unavailable" }>["reason"],
  string
> = {
  status: "這項助養尚未處於進行中；請先核實目前狀態。",
  recipient: "沒有有效收件電郵或姓名；請先核實支持者資料。",
  proof_pending: "付款憑證待核實；請先完成審核，避免誤發提醒。",
  invalid_ledger: "月份紀錄不完整；請交由財務核對。",
  no_past_open_period: "沒有已過月份的未核對承諾；目前無需建立草稿。",
  adjustment_review: "月份紀錄包含退款或沖銷；請先由財務核對。",
};

export function ReminderDraftPreview({ result }: { result: ReminderDraftResult }) {
  if (result.kind === "unavailable") {
    return (
      <p role="status" className="text-sm text-[var(--color-text-muted)]">
        {unavailableCopy[result.reason]}
      </p>
    );
  }
  return (
    <div className="space-y-3 text-sm text-[var(--color-panel)]">
      <p>
        收件人：{result.recipient.name} &lt;{result.recipient.email}&gt;
      </p>
      <p>
        待核對月份：{result.periodMonth.slice(0, 7)}；內部紀錄未核對承諾：
        {centsToHkd(result.outstandingCents)}。此數字不是欠款認定，亦不會寫入電郵草稿。
      </p>
      <p className="text-[var(--color-text-muted)]">
        只供內部審閱。草稿於 {result.generatedAt} 產生；資料或憑證變動後須重新核對。發送需另行審批。
      </p>
      <div className="space-y-1">
        <Label htmlFor="sponsorship-reminder-subject">主旨草稿</Label>
        <Input id="sponsorship-reminder-subject" readOnly value={result.subject} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="sponsorship-reminder-body">內容草稿</Label>
        <textarea
          id="sponsorship-reminder-body"
          readOnly
          value={result.body}
          rows={8}
          className="w-full rounded-md border border-[var(--color-border)] bg-transparent p-3"
        />
      </div>
    </div>
  );
}

export function ReminderDraftPanel({ pledgeId }: { pledgeId: string }) {
  const { data, error, isPending, mutate } = useMutation<ReminderDraftResult, Error, void>({
    mutationFn: () =>
      fetchCoordinatorJson<ReminderDraftResult>(
        `/api/admin/sponsorships/pledges/${encodeURIComponent(pledgeId)}/reminder-draft`,
      ),
  });
  return (
    <section className="space-y-3 rounded-lg border border-[var(--color-border)] p-4">
      <h3 className="text-sm font-semibold text-[var(--color-panel)]">助養月份跟進草稿</h3>
      <p className="text-sm text-[var(--color-text-muted)]">
        只檢視已過月份及已核實付款紀錄；此處不會發送通知。
      </p>
      <Button type="button" variant="outline" disabled={isPending} onClick={() => mutate()}>
        {isPending ? "正在重新核對…" : data ? "重新核對草稿" : "核對並產生草稿"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          無法產生草稿；請稍後重試。
        </p>
      )}
      {data && <ReminderDraftPreview result={data} />}
    </section>
  );
}
