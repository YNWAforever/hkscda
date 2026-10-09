import { useMutation } from "@tanstack/react-query";

import type { ReminderDraftResult } from "../../../lib/sponsorshipAdmin/reminderDraft";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { fetchCoordinatorJson } from "../adoptions/api";
import { useAdminCopy } from "../i18n/copy";
import { reminderDraftCopy } from "./bulkCopy";
import { sponsorshipFormatCopy } from "./formatCopy";

export function ReminderDraftPreview({ result }: { result: ReminderDraftResult }) {
  const copy = useAdminCopy(reminderDraftCopy);
  const format = useAdminCopy(sponsorshipFormatCopy);
  if (result.kind === "unavailable") {
    return (
      <p role="status" className="text-sm text-[var(--color-text-muted)]">
        {copy.unavailable[result.reason]}
      </p>
    );
  }
  return (
    <div className="space-y-3 text-sm text-[var(--color-panel)]">
      <p>{copy.recipient(result.recipient.name, result.recipient.email)}</p>
      <p>{copy.ledger(format.month(result.periodMonth), format.money(result.outstandingCents))}</p>
      <p className="text-[var(--color-text-muted)]">
        {copy.internalOnly(format.dateTime(result.generatedAt))}
      </p>
      <div className="space-y-1">
        <Label htmlFor="sponsorship-reminder-subject">{copy.subjectLabel}</Label>
        <Input id="sponsorship-reminder-subject" readOnly value={result.subject} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="sponsorship-reminder-body">{copy.bodyLabel}</Label>
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
  const copy = useAdminCopy(reminderDraftCopy);
  const { data, error, isPending, mutate } = useMutation<ReminderDraftResult, Error, void>({
    mutationFn: () =>
      fetchCoordinatorJson<ReminderDraftResult>(
        `/api/admin/sponsorships/pledges/${encodeURIComponent(pledgeId)}/reminder-draft`,
      ),
  });
  return (
    <section className="space-y-3 rounded-lg border border-[var(--color-border)] p-4">
      <h3 className="text-sm font-semibold text-[var(--color-panel)]">{copy.title}</h3>
      <p className="text-sm text-[var(--color-text-muted)]">{copy.intro}</p>
      <Button type="button" variant="outline" disabled={isPending} onClick={() => mutate()}>
        {isPending ? copy.checking : data ? copy.checkAgain : copy.create}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {copy.failed}
        </p>
      )}
      {data && <ReminderDraftPreview result={data} />}
    </section>
  );
}
