import type { RecipientNotificationDraft } from "./types";

export type AdopterNotificationRecipient = {
  adoptionCaseId: string | null;
  supporterId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
};

type BuildAdopterNotificationDraftsInput = {
  contentItemId: string;
  storyUpdateId: string;
  storyTitle: string;
  updateTitle: string;
  updateBody: string | null;
  publicUrl: string;
  recipients: AdopterNotificationRecipient[];
};

type AdopterNotificationDraft = Omit<RecipientNotificationDraft, "id" | "createdAt" | "updatedAt">;

function buildBody(
  recipient: AdopterNotificationRecipient,
  input: BuildAdopterNotificationDraftsInput,
): string {
  return `${recipient.name} 您好，\n\n${input.storyTitle} 有新的近況更新：${input.updateTitle}\n${input.updateBody ?? ""}\n\n詳情可查看：${input.publicUrl}\n\n香港拯救貓狗協會`;
}

export function buildAdopterNotificationDrafts(
  input: BuildAdopterNotificationDraftsInput,
): AdopterNotificationDraft[] {
  const drafts: AdopterNotificationDraft[] = [];
  const seenContacts = new Set<string>();

  for (const recipient of input.recipients) {
    const body = buildBody(recipient, input);

    if (recipient.email) {
      const contact = recipient.email.trim();
      const key = `email:${contact}`;

      if (contact && !seenContacts.has(key)) {
        seenContacts.add(key);
        drafts.push({
          storyUpdateId: input.storyUpdateId,
          contentItemId: input.contentItemId,
          adoptionCaseId: recipient.adoptionCaseId,
          supporterId: recipient.supporterId,
          channel: "email",
          recipientName: recipient.name,
          recipientContact: contact,
          subject: `${input.storyTitle} 近況更新：${input.updateTitle}`,
          body,
          status: "draft",
        });
      }
    }

    if (recipient.phone) {
      const contact = recipient.phone.trim();
      const key = `whatsapp:${contact}`;

      if (contact && !seenContacts.has(key)) {
        seenContacts.add(key);
        drafts.push({
          storyUpdateId: input.storyUpdateId,
          contentItemId: input.contentItemId,
          adoptionCaseId: recipient.adoptionCaseId,
          supporterId: recipient.supporterId,
          channel: "whatsapp",
          recipientName: recipient.name,
          recipientContact: contact,
          subject: null,
          body,
          status: "draft",
        });
      }
    }
  }

  return drafts;
}
