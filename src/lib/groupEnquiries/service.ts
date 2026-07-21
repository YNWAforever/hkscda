import { publicGroupEnquirySchema } from "./schemas";
import type { GroupEnquiry, GroupEnquiryInsert } from "./types";

export interface GroupEnquiryRepository {
  createOrGet(input: GroupEnquiryInsert): Promise<{ enquiry: GroupEnquiry; created: boolean }>;
  markNotificationSent(id: string): Promise<void>;
  markNotificationFailed(id: string, safeError: string): Promise<void>;
}

type GroupEnquiryServiceArgs = {
  repo: GroupEnquiryRepository;
  notifyAdmins?: (input: { enquiry: GroupEnquiry }) => Promise<void>;
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
  return {
    async submitPublicEnquiry(raw: unknown) {
      const input = publicGroupEnquirySchema.parse(raw);
      const { turnstileToken: _turnstileToken, ...persisted } = input;
      const result = await repo.createOrGet(persisted);

      if (result.created) {
        try {
          await notifyAdmins({ enquiry: result.enquiry });
          await repo.markNotificationSent(result.enquiry.id);
        } catch (error) {
          const diagnostic = safeDiagnostic(error);
          logger.error("Failed to send group enquiry notification", error);
          await repo.markNotificationFailed(result.enquiry.id, diagnostic);
        }
      }

      return { ok: true, enquiryId: result.enquiry.id };
    },
  };
}
