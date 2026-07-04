import { centsToHkd } from "../donations/domain";
import type {
  AuditHistoryRow,
  ConsentHistoryRow,
  DonationHistoryRow,
  MessageHistoryRow,
  PaymentHistoryRow,
  ReceiptHistoryRow,
  SupporterAdoptionContext,
  SupporterTimelineItem,
} from "./types";

const emptyAdoptionContext: SupporterAdoptionContext = {
  profiles: [],
  cases: [],
  followups: [],
  successfulAdoptions: [],
};

function caseLink(caseId: string): SupporterTimelineItem["link"] {
  return { to: "/admin/applications/$id", params: { id: caseId } };
}

function adopterLink(adopterProfileId: string): SupporterTimelineItem["link"] {
  return { to: "/admin/coordinator/adopters/$id", params: { id: adopterProfileId } };
}

function adoptionCaseEvents(adoption: SupporterAdoptionContext): SupporterTimelineItem[] {
  return adoption.cases.flatMap((adoptionCase) => {
    const titleSubject = adoptionCase.requestedAnimalName ?? adoptionCase.animalType;
    const items: SupporterTimelineItem[] = [
      {
        id: `adoption_case:${adoptionCase.id}:created`,
        at: adoptionCase.createdAt,
        kind: "adoption_case",
        title: `Adoption case opened for ${titleSubject}`,
        description: `${adoptionCase.applicantName} · ${adoptionCase.status.labelEn}`,
        status: adoptionCase.status.key,
        link: caseLink(adoptionCase.id),
      },
    ];

    if (adoptionCase.closedAt) {
      items.push({
        id: `adoption_case:${adoptionCase.id}:closed`,
        at: adoptionCase.closedAt,
        kind: "adoption_case",
        title: `Adoption case closed for ${titleSubject}`,
        description: `${adoptionCase.applicantName} · ${adoptionCase.status.labelEn}`,
        status: adoptionCase.status.key,
        link: caseLink(adoptionCase.id),
      });
    }

    return items;
  });
}

function followupLink(followup: SupporterAdoptionContext["followups"][number]) {
  if (followup.adoptionCaseId) return caseLink(followup.adoptionCaseId);
  if (followup.adopterProfileId) return adopterLink(followup.adopterProfileId);
  return undefined;
}

function adoptionFollowupEvents(adoption: SupporterAdoptionContext): SupporterTimelineItem[] {
  return adoption.followups.flatMap((followup) => {
    const link = followupLink(followup);
    const hasScheduledDate = Boolean(followup.scheduledAt ?? followup.dueAt);
    const items: SupporterTimelineItem[] = [];

    if (!hasScheduledDate && !followup.completedAt) {
      items.push({
        id: `adoption_followup:${followup.id}:created`,
        at: followup.createdAt,
        kind: "adoption_followup",
        title: `Follow-up created: ${followup.title}`,
        description: `${followup.taskType} · ${followup.status.labelEn}`,
        status: followup.status.key,
        link,
      });
    }

    if (hasScheduledDate) {
      items.push({
        id: `adoption_followup:${followup.id}:scheduled`,
        at: followup.scheduledAt ?? followup.dueAt!,
        kind: "adoption_followup",
        title: `Follow-up scheduled: ${followup.title}`,
        description: [followup.volunteer, followup.contactChannel].filter(Boolean).join(" · "),
        status: followup.status.key,
        link,
      });
    }

    if (followup.completedAt) {
      items.push({
        id: `adoption_followup:${followup.id}:completed`,
        at: followup.completedAt,
        kind: "adoption_followup",
        title: `Follow-up completed: ${followup.title}`,
        description: `${followup.taskType} · ${followup.status.labelEn}`,
        status: followup.status.key,
        link,
      });
    }

    return items;
  });
}

function successfulAdoptionEvents(adoption: SupporterAdoptionContext): SupporterTimelineItem[] {
  return adoption.successfulAdoptions.flatMap((success) => {
    const titleSubject = success.caseNumber;
    const description = [success.animalName, success.animalId].filter(Boolean).join(" · ");
    const items: SupporterTimelineItem[] = [
      {
        id: `successful_adoption:${success.id}:approval`,
        at: success.approvalDate,
        kind: "successful_adoption",
        title: `Adoption approved ${titleSubject}`,
        description,
        amountCents: success.adoptionFeeCents ?? undefined,
        status: "approved",
        link: caseLink(success.adoptionCaseId),
      },
    ];

    if (success.pickupDate) {
      items.push({
        id: `successful_adoption:${success.id}:pickup`,
        at: success.pickupDate,
        kind: "successful_adoption",
        title: `Adoption pickup ${titleSubject}`,
        description,
        amountCents: success.adoptionFeeCents ?? undefined,
        status: "picked_up",
        link: caseLink(success.adoptionCaseId),
      });
    }

    return items;
  });
}

export function assembleSupporterTimeline(input: {
  donations: DonationHistoryRow[];
  payments: PaymentHistoryRow[];
  receipts: ReceiptHistoryRow[];
  consents: ConsentHistoryRow[];
  messages: MessageHistoryRow[];
  auditLogs: AuditHistoryRow[];
  adoption?: SupporterAdoptionContext;
}): SupporterTimelineItem[] {
  const adoption = input.adoption ?? emptyAdoptionContext;
  const items: SupporterTimelineItem[] = [
    ...input.donations.map((donation) => ({
      id: `donation:${donation.id}`,
      at: donation.createdAt,
      kind: "donation" as const,
      title: `Donation ${donation.status}`,
      description: `${donation.purpose} via ${donation.method}`,
      amountCents: donation.amountCents,
      status: donation.status,
    })),
    ...input.payments.map((payment) => ({
      id: `payment:${payment.id}`,
      at: payment.receivedAt ?? payment.createdAt,
      kind: "payment" as const,
      title: `Payment ${payment.status}`,
      description: `${payment.providerRef ?? payment.bankReference ?? payment.provider} ${centsToHkd(payment.amountCents)}`,
      amountCents: payment.amountCents,
      status: payment.status,
    })),
    ...input.receipts.map((receipt) => ({
      id: `receipt:${receipt.id}`,
      at: receipt.issuedAt,
      kind: "receipt" as const,
      title: `Receipt ${receipt.receiptNo}`,
      description: `${receipt.status} ${centsToHkd(receipt.totalAmountCents)}`,
      amountCents: receipt.totalAmountCents,
      status: receipt.status,
    })),
    ...input.consents.map((consent) => ({
      id: `consent:${consent.id}`,
      at: consent.timestamp,
      kind: "consent" as const,
      title: `${consent.channel} consent ${consent.status}`,
      description: `Source: ${consent.source}`,
      status: consent.status,
    })),
    ...input.messages.map((message) => ({
      id: `message:${message.id}`,
      at: message.sentAt ?? message.createdAt,
      kind: "message" as const,
      title: `${message.channel} message ${message.status}`,
      description: String(message.payload.subject ?? message.payload.template ?? "Message"),
      status: message.status,
    })),
    ...input.auditLogs.map((log) => ({
      id: `audit:${log.id}`,
      at: log.timestamp,
      kind: "audit" as const,
      title: log.action,
      description: `${log.entity}:${log.entityId}`,
    })),
    ...adoptionCaseEvents(adoption),
    ...adoptionFollowupEvents(adoption),
    ...successfulAdoptionEvents(adoption),
  ];

  return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}
