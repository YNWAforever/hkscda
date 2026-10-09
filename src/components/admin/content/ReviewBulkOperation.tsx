import { useAdminCopy } from "../i18n/copy";
import { BulkReview } from "../bulk/BulkReview";
import { reviewCopy } from "./reviewCopy";

/** A bulk source review as the server describes it; the CMS and animal routes send this shape. */
export type ReviewBulkOperationData = {
  operationId: string;
  evidence: string;
  expiresAt: string;
  items: Array<{
    entityId: string;
    status: "pending" | "succeeded" | "skipped" | "conflict" | "failed";
    reasonCode: string | null;
    beforeClassification: string | null;
    afterClassification: string | null;
  }>;
};

type States = (typeof reviewCopy)["zh"]["bulk"]["states"];

function stateLabel(value: string | null, states: States): string {
  if (value === "needs_review" || value === "approved" || value === "demo") return states[value];
  return states.other;
}

/** The reason given for a bulk source review, and the preview or result of the review. */
export function ReviewBulkOperation({
  kind,
  operation,
  busy,
  onApply,
}: {
  kind: "cms" | "animal";
  operation: ReviewBulkOperationData;
  busy: boolean;
  onApply: () => void;
}) {
  const copy = useAdminCopy(reviewCopy).bulk;
  return (
    <>
      <p className="break-words text-sm">{copy.reason(operation.evidence)}</p>
      <BulkReview
        key={operation.operationId}
        title={copy[kind].title(operation.items.length)}
        operationId={operation.operationId}
        expiresAt={operation.expiresAt}
        items={operation.items.map((item) => ({
          entityId: item.entityId,
          status: item.status,
          reasonCode: item.reasonCode,
          before: stateLabel(item.beforeClassification, copy.states),
          after: stateLabel(item.afterClassification, copy.states),
        }))}
        busy={busy}
        onApply={onApply}
      />
    </>
  );
}
