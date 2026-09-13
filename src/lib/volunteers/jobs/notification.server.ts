export type ClaimedNotification = {
  id: string;
  dedupKey: string;
  attempts: number;
  payload: {
    assessment_id?: string;
    profile_id?: string;
    type?: string;
    channels?: unknown;
    dry_run?: boolean;
  };
};
export type ResolvedNotification = { to: string; name: string; subject: string; body: string };
export function confirmedAuthEmail(
  user: { email?: string | null; email_confirmed_at?: string | null } | null | undefined,
) {
  return user?.email && user.email_confirmed_at ? user.email : null;
}
export type NotificationDispatchResult = "provider_accepted" | "queued" | "failed";
export function createVolunteerNotificationDispatcher(deps: {
  resolve: (job: ClaimedNotification) => Promise<ResolvedNotification | null>;
  send: (
    message: ResolvedNotification,
    idempotencyKey: string,
  ) => Promise<
    | { kind: "accepted"; providerMessageId: string }
    | { kind: "rejected"; code: string; retryable: boolean }
  >;
  accepted: (job: ClaimedNotification, providerMessageId: string) => Promise<void>;
  reject: (job: ClaimedNotification, code: string, retryable: boolean) => Promise<void>;
  defer: (job: ClaimedNotification, reason: string) => Promise<void>;
}) {
  return async (job: ClaimedNotification): Promise<NotificationDispatchResult> => {
    if (job.payload.dry_run !== false) {
      await deps.defer(job, "dry_run_no_provider_delivery");
      return "queued";
    }
    if (!Array.isArray(job.payload.channels) || !job.payload.channels.includes("email")) {
      await deps.defer(job, "email_channel_not_configured");
      return "queued";
    }
    const message = await deps.resolve(job);
    if (!message) {
      await deps.reject(job, "recipient_or_policy_missing", false);
      return "failed";
    }
    const sent = await deps.send(message, `volunteer-notification-${job.dedupKey}`);
    if (sent.kind === "accepted") {
      await deps.accepted(job, sent.providerMessageId);
      return "provider_accepted";
    }
    await deps.reject(job, sent.code, sent.retryable);
    return "failed";
  };
}
