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

export interface GroupEnquiryRepository {
  createOrGet(input: GroupEnquiryInsert): Promise<{ enquiry: GroupEnquiry; created: boolean }>;
  markNotificationSent(id: string): Promise<void>;
  markNotificationFailed(id: string, safeError: string): Promise<void>;
  list(input: GroupEnquirySearch): Promise<{ enquiries: GroupEnquirySummary[]; total: number }>;
  getById(id: string): Promise<GroupEnquiry | null>;
  update(id: string, input: GroupEnquiryAdminUpdate): Promise<GroupEnquiry>;
}

type GroupEnquiryServiceArgs = {
  repo: GroupEnquiryRepository;
  notifyAdmins?: (input: { enquiry: GroupEnquiry }) => Promise<unknown>;
  logger?: Pick<Console, "error">;
};

function safeDiagnostic(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n\t]+/g, " ").slice(0, 300);
}

export function createGroupEnquiryService({
  repo,
  notifyAdmins = async () => undefined,
  logger = console,
}: GroupEnquiryServiceArgs) {
  async function sendAndMark(enquiry: GroupEnquiry) {
    try {
      await notifyAdmins({ enquiry });
      await repo.markNotificationSent(enquiry.id);
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
      if (result.created) await sendAndMark(result.enquiry);
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

    async updateGroupEnquiry(args: { id: string; input: unknown }) {
      const input = adminGroupEnquiryPatchSchema.parse({ id: args.id, ...(args.input as object) });
      const { id, action: _action, ...patch } = input;
      return { enquiry: await repo.update(id, patch) };
    },

    async retryGroupEnquiryNotification(args: { id: string }) {
      const enquiry = await repo.getById(args.id);
      if (!enquiry) throw new Error("Group enquiry not found");
      await sendAndMark(enquiry);
      return { ok: true };
    },
  };
}
