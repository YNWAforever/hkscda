import {
  adminGroupEnquiryPatchSchema,
  groupEnquirySearchSchema,
  publicGroupEnquirySchema,
} from "./schemas";
import type {
  GroupEnquiry,
  GroupEnquiryAdminUpdate,
  GroupEnquiryInsert,
  GroupEnquirySearch,
  GroupEnquirySummary,
} from "./types";

/**
 * Detail carries changed field names and the new status, never the enquirer's
 * contact details: audit_log is readable by treasurer, group_enquiries is not.
 */
export type GroupEnquiryAuditLog = {
  actor_user_id: string;
  action: "group_enquiries.update" | "group_enquiries.retry_notification";
  entity: "group_enquiries";
  entity_id: string;
  timestamp: string;
  detail: Record<string, unknown>;
};

export interface GroupEnquiryRepository {
  createOrGet(input: GroupEnquiryInsert): Promise<{ enquiry: GroupEnquiry; created: boolean }>;
  markNotificationSent(id: string): Promise<void>;
  markNotificationFailed(id: string, safeError: string): Promise<void>;
  list(input: GroupEnquirySearch): Promise<{ enquiries: GroupEnquirySummary[]; total: number }>;
  getById(id: string): Promise<GroupEnquiry | null>;
  updateWithAudit(args: {
    id: string;
    input: GroupEnquiryAdminUpdate;
    actorUserId: string;
    expectedUpdatedAt: string;
  }): Promise<GroupEnquiry>;
  insertAuditLog(input: GroupEnquiryAuditLog): Promise<void>;
}

type GroupEnquiryServiceArgs = {
  repo: GroupEnquiryRepository;
  notifyAdmins?: (input: { enquiry: GroupEnquiry }) => Promise<"sent" | "skipped" | "failed">;
  logger?: Pick<Console, "error">;
  now?: () => Date;
};

function safeDiagnostic(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n\t]+/g, " ").slice(0, 300);
}

export function createGroupEnquiryService({
  repo,
  notifyAdmins = async () => "skipped" as const,
  logger = console,
  now = () => new Date(),
}: GroupEnquiryServiceArgs) {
  function audit(input: Omit<GroupEnquiryAuditLog, "entity" | "timestamp">) {
    return repo.insertAuditLog({
      ...input,
      entity: "group_enquiries",
      timestamp: now().toISOString(),
    });
  }

  async function sendAndMark(enquiry: GroupEnquiry) {
    try {
      const outcome = await notifyAdmins({ enquiry });
      if (outcome === "sent") await repo.markNotificationSent(enquiry.id);
      else
        await repo.markNotificationFailed(
          enquiry.id,
          outcome === "skipped" ? "not_configured" : "delivery_failed",
        );
    } catch (error) {
      const diagnostic = safeDiagnostic(error);
      logger.error("Failed to send group enquiry notification", error);
      await repo.markNotificationFailed(enquiry.id, diagnostic);
    }
  }

  return {
    async submitPublicEnquiry(raw: unknown) {
      const input = publicGroupEnquirySchema.parse(raw);
      const { turnstileToken: _turnstileToken, ...persisted } = input;
      const result = await repo.createOrGet(persisted);
      if (result.created || result.enquiry.notificationStatus !== "sent")
        await sendAndMark(result.enquiry);
      return { ok: true as const, enquiryId: result.enquiry.id };
    },

    listGroupEnquiries(raw: unknown) {
      return repo.list(groupEnquirySearchSchema.parse(raw));
    },

    async getGroupEnquiry(id: string) {
      const enquiry = await repo.getById(id);
      if (!enquiry) throw new Error("Group enquiry not found");
      return { enquiry };
    },

    async updateGroupEnquiry(args: { id: string; input: unknown; actorUserId: string }) {
      const input = adminGroupEnquiryPatchSchema.parse({ id: args.id, ...(args.input as object) });
      const { id, action: _action, expectedUpdatedAt, ...patch } = input;
      const enquiry = await repo.updateWithAudit({
        id,
        input: patch,
        actorUserId: args.actorUserId,
        expectedUpdatedAt,
      });
      return { enquiry };
    },

    async retryGroupEnquiryNotification(args: { id: string; actorUserId: string }) {
      const enquiry = await repo.getById(args.id);
      if (!enquiry) throw new Error("Group enquiry not found");
      await audit({
        actor_user_id: args.actorUserId,
        action: "group_enquiries.retry_notification",
        entity_id: enquiry.id,
        detail: { fields: ["notificationStatus"], status: null },
      });
      await sendAndMark(enquiry);
      return { ok: true };
    },
  };
}
