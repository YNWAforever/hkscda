import { volunteerAdminErrorMessage } from "../../../lib/volunteers/adminErrors";
import { useAdminLanguage } from "../adminI18n";
import { pickAdminCopy } from "../i18n/copy";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../../ui/sheet";
import { activityOperationCopy } from "./activityOperationCopy";
import type { ActivityDetail } from "./activityWorkspaceTypes";
import { volunteerFormatCopy } from "./volunteerFormatCopy";
import { LoadFailure } from "../LoadFailure";

const button =
  "min-h-11 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm " +
  "cursor-pointer disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]";

/** What the panel needs of the query that reads one activity. */
export type ActivityDetailQuery = {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  data: ActivityDetail | undefined;
  refetch: () => unknown;
};

/** The body of the activity panel: its details, registrations and operation history. */
export function ActivityDetailBody({
  detail,
  detailPage,
  historyPage,
  onDetailPage,
  onHistoryPage,
  onEdit,
}: {
  detail: ActivityDetailQuery;
  detailPage: number;
  historyPage: number;
  onDetailPage: (page: number) => void;
  onHistoryPage: (page: number) => void;
  onEdit: (activity: ActivityDetail["activity"]) => void;
}) {
  const { language } = useAdminLanguage();
  const text = pickAdminCopy(activityOperationCopy, language).detail;
  const format = pickAdminCopy(volunteerFormatCopy, language);
  if (detail.isPending) return <p role="status">{text.loading}</p>;
  if (detail.isError)
    return (
      <LoadFailure
        error={detail.error}
        onRetry={() => void detail.refetch()}
        title={volunteerAdminErrorMessage(detail.error, language) ?? undefined}
        retryLabel={text.retry}
      />
    );
  if (!detail.data) return null;
  const { activity, registrations, total, history, history_total } = detail.data;
  return (
    <div className="space-y-4">
      <p>
        {format.sessionTime(activity.starts_at)} · {activity.location}
      </p>
      <p>{activity.description}</p>
      <button className={button} onClick={() => onEdit(activity)}>
        {text.edit}
      </button>
      <h3 className="font-bold">{text.registrations(total)}</h3>
      {registrations.map((r) => (
        <p key={r.id}>
          {text.registrationLine(
            r.contact_name,
            text.registrationStatus(r.status),
            text.attendanceStatus(r.attendance_status),
          )}
        </p>
      ))}
      <button
        className={button}
        disabled={detailPage === 1}
        onClick={() => onDetailPage(detailPage - 1)}
      >
        {text.previousRegistrations}
      </button>
      <button
        className={button}
        disabled={detailPage * 25 >= total}
        onClick={() => onDetailPage(detailPage + 1)}
      >
        {text.nextRegistrations}
      </button>
      <h3 className="font-bold">{text.history(history_total)}</h3>
      {history.map((h) => (
        <p key={h.id}>
          {text.historyLine(format.sessionTime(h.created_at), text.historyAction(h.action))}
        </p>
      ))}
      <div className="flex gap-2">
        <button
          className={button}
          disabled={historyPage === 1}
          onClick={() => onHistoryPage(historyPage - 1)}
        >
          {text.previousHistory}
        </button>
        <span>{text.historyPage(historyPage)}</span>
        <button
          className={button}
          disabled={historyPage * 25 >= history_total}
          onClick={() => onHistoryPage(historyPage + 1)}
        >
          {text.nextHistory}
        </button>
      </div>
    </div>
  );
}

/** The side panel that opens on one activity. Closing it keeps the filters and the page. */
export function ActivityDetailSheet({
  open,
  onClose,
  detail,
  ...body
}: {
  open: boolean;
  onClose: () => void;
  detail: ActivityDetailQuery;
  detailPage: number;
  historyPage: number;
  onDetailPage: (page: number) => void;
  onHistoryPage: (page: number) => void;
  onEdit: (activity: ActivityDetail["activity"]) => void;
}) {
  const { language } = useAdminLanguage();
  const text = pickAdminCopy(activityOperationCopy, language).detail;
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{detail.data?.activity.title ?? text.fallbackTitle}</SheetTitle>
          <SheetDescription>{text.description}</SheetDescription>
        </SheetHeader>
        <ActivityDetailBody detail={detail} {...body} />
      </SheetContent>
    </Sheet>
  );
}
