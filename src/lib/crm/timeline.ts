import { centsToHkd } from "../donations/domain";
import type {
  AuditHistoryRow,
  ConsentHistoryRow,
  DonationHistoryRow,
  MessageHistoryRow,
  PaymentHistoryRow,
  ReceiptHistoryRow,
  SupporterTimelineItem,
} from "./types";

export function assembleSupporterTimeline(input: {
  donations: DonationHistoryRow[];
  payments: PaymentHistoryRow[];
  receipts: ReceiptHistoryRow[];
  consents: ConsentHistoryRow[];
  messages: MessageHistoryRow[];
  auditLogs: AuditHistoryRow[];
}): SupporterTimelineItem[] {
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
  ];

  return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}
