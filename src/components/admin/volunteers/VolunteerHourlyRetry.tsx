import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminIdentityQueryOptions } from "../../../lib/admin/identity";
import { fetchAdminJson } from "../../../lib/admin/http";
import { AdminApiError, AdminSessionError } from "../../../lib/admin/session";
import { volunteerAdminErrorMessage } from "../../../lib/volunteers/adminErrors";
import { volunteerQueryKeys } from "../../../lib/volunteers/queryKeys";
import type { VolunteerJobHealth } from "../../../lib/volunteers/jobs/health";
import type { RuntimeSummary } from "../../../lib/volunteers/jobs/service";
import { ConfirmActionDialog } from "../ConfirmActionDialog";
import { requiredReasonDialog } from "../confirmActionState";
import { useAdminLanguage } from "../adminI18n";
import { pickAdminCopy } from "../i18n/copy";
import { volunteerFormatCopy } from "./volunteerFormatCopy";
import { volunteerHourlyRetryCopy } from "./volunteerHourlyRetryCopy";

type Candidate = NonNullable<VolunteerJobHealth["retryCandidate"]>;
export function VolunteerHourlyRetry({ candidate }: { candidate?: Candidate }) {
  const { language } = useAdminLanguage();
  const copy = pickAdminCopy(volunteerHourlyRetryCopy, language);
  const format = pickAdminCopy(volunteerFormatCopy, language);
  const [selected, setSelected] = useState<(Candidate & { actorId: string }) | null>(null);
  const [notice, setNotice] = useState<"complete" | "refreshFailed" | null>(null);
  const [completed, setCompleted] = useState<Candidate | null>(null);
  const identity = useQuery({
    ...adminIdentityQueryOptions(),
    enabled: !!candidate || !!selected,
  });
  const cache = useQueryClient();
  const retry = useMutation({
    retry: false,
    mutationFn: async (command: Candidate & { actorId: string; reason: string }) => {
      try {
        const result = await fetchAdminJson<RuntimeSummary>(
          "/api/admin/volunteers/runtime/retry",
          {
            method: "POST",
            body: JSON.stringify({
              bucket: command.bucket,
              expectedUpdatedAt: command.expectedUpdatedAt,
              confirmed: true,
              reason: command.reason,
            }),
          },
          command.actorId,
        );
        if (result.kind !== "complete") throw new Error(copy.failed);
      } catch (error) {
        if (error instanceof AdminSessionError)
          throw new Error(volunteerAdminErrorMessage(error, language) ?? copy.forbidden);
        const status = error instanceof AdminApiError ? error.status : null;
        throw new Error(
          status === 409
            ? copy.conflict
            : status === 503
              ? copy.unavailable
              : status === 403 || status === 401
                ? copy.forbidden
                : status === 400 || status === 413
                  ? copy.invalid
                  : copy.failed,
        );
      }
    },
  });
  const admin = identity.data?.admin;
  if (admin?.role !== "admin") return null;
  return (
    <div className="mt-3 space-y-2">
      {candidate && (
        <button
          className="min-h-11 rounded border px-3 py-2"
          disabled={
            retry.isPending ||
            !!selected ||
            (completed?.bucket === candidate.bucket &&
              completed.expectedUpdatedAt === candidate.expectedUpdatedAt)
          }
          onClick={() => {
            setNotice(null);
            // Retain exactly what was shown, even if a background read changes it.
            setSelected({ ...candidate, actorId: admin.authUserId });
          }}
        >
          {copy.open}
        </button>
      )}
      {notice && <p role="status">{copy[notice]}</p>}
      {/* required-reason: volunteer_runtime_job.retry */}
      <ConfirmActionDialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title={copy.title}
        consequence={copy.consequence(selected ? format.sessionTime(selected.bucket) : "")}
        confirmLabel={copy.confirm}
        reason={requiredReasonDialog}
        onConfirm={async (reason) => {
          if (!selected || !reason) throw new Error(copy.invalid);
          await retry.mutateAsync({ ...selected, reason });
          setCompleted(selected);
          try {
            await cache.invalidateQueries(
              { queryKey: volunteerQueryKeys.prefixes.overview },
              { throwOnError: true },
            );
            setNotice("complete");
          } catch {
            // Work completed; do not ask the admin to repeat a successful mutation.
            setNotice("refreshFailed");
          }
        }}
      />
    </div>
  );
}
