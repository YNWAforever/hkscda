import { buildConsentRowsForUpdate } from "./consent";
import { buildDonationCsv, buildSupporterCsv, type DonationExportRow } from "./csv";
import { buildManualDonationRecords } from "./manualDonation";
import {
  consentUpdateSchema,
  exportSearchSchema,
  manualDonationSchema,
  supporterInputSchema,
  supporterSearchSchema,
  supporterUpdateSchema,
  type ExportSearch,
  type SupporterInput,
  type SupporterSearch,
} from "./schemas";
import type { SupporterDetail, SupporterSummary } from "./types";

type ConsentInsertRows = ReturnType<typeof buildConsentRowsForUpdate>;
type ManualDonationRecords = ReturnType<typeof buildManualDonationRecords>;

export type AuditLogInsert = {
  actor_user_id: string | null;
  action: string;
  entity: string;
  entity_id: string;
  timestamp?: string;
  detail: Record<string, unknown>;
};

export type SupporterUpdatePayload = {
  name?: string;
  phone?: string | null;
  language?: SupporterInput["language"];
  tags?: string[];
  deletedAt?: string | null;
};

export type CrmRepository = {
  listSupporters(
    input: SupporterSearch,
  ): Promise<{ supporters: SupporterSummary[]; total: number }>;
  getSupporterDetail(id: string): Promise<SupporterDetail | null>;
  upsertSupporter(input: SupporterInput): Promise<{ id: string; email: string }>;
  updateSupporter(id: string, input: SupporterUpdatePayload): Promise<void>;
  ensureSupporterRole(input: { supporterId: string; role: "donor" }): Promise<void>;
  insertConsentRows(rows: ConsentInsertRows): Promise<void>;
  insertManualDonation(
    records: ManualDonationRecords,
  ): Promise<{ donationId: string; paymentId: string }>;
  listSupportersForExport(input: ExportSearch): Promise<SupporterSummary[]>;
  listDonationsForExport(input: ExportSearch): Promise<DonationExportRow[]>;
  insertAuditLog(row: AuditLogInsert): Promise<void>;
};

type CreateCrmServiceArgs = {
  repo: CrmRepository;
  now?: () => Date;
};

function timestamp(now: () => Date) {
  return now().toISOString();
}

function hasProvidedConsents(consents: { email?: boolean; whatsapp?: boolean } | undefined) {
  return consents?.email !== undefined || consents?.whatsapp !== undefined;
}

export function createCrmService({ repo, now = () => new Date() }: CreateCrmServiceArgs) {
  return {
    listSupporters(raw: unknown) {
      return repo.listSupporters(supporterSearchSchema.parse(raw));
    },

    getSupporterDetail(id: string) {
      return repo.getSupporterDetail(id);
    },

    async createSupporter(args: { actorUserId: string | null; input: unknown }) {
      const input = supporterInputSchema.parse(args.input);
      const supporter = await repo.upsertSupporter(input);
      await repo.ensureSupporterRole({ supporterId: supporter.id, role: "donor" });
      await repo.insertAuditLog({
        actor_user_id: args.actorUserId,
        action: "supporter.create_or_update",
        entity: "supporter",
        entity_id: supporter.id,
        timestamp: timestamp(now),
        detail: { email: supporter.email, source: input.source },
      });
      return supporter;
    },

    async updateSupporter(args: {
      actorUserId: string | null;
      supporterId: string;
      input: unknown;
    }) {
      const input = supporterUpdateSchema.parse(args.input);
      const { deleted, ...rest } = input;
      const update: SupporterUpdatePayload = { ...rest };
      if (deleted !== undefined) {
        update.deletedAt = deleted ? timestamp(now) : null;
      }

      await repo.updateSupporter(args.supporterId, update);
      await repo.insertAuditLog({
        actor_user_id: args.actorUserId,
        action: "supporter.update",
        entity: "supporter",
        entity_id: args.supporterId,
        timestamp: timestamp(now),
        detail: input,
      });
    },

    async appendConsents(args: {
      actorUserId: string | null;
      supporterId: string;
      input: unknown;
    }) {
      const update = consentUpdateSchema.parse(args.input);
      const rows = buildConsentRowsForUpdate({
        supporterId: args.supporterId,
        update,
        now,
      });
      await repo.insertConsentRows(rows);
      await repo.insertAuditLog({
        actor_user_id: args.actorUserId,
        action: "consent.append",
        entity: "supporter",
        entity_id: args.supporterId,
        timestamp: timestamp(now),
        detail: { channels: rows.map((row) => row.channel), source: update.source },
      });
      return rows;
    },

    async createManualDonation(args: { actorUserId: string; input: unknown }) {
      const input = manualDonationSchema.parse(args.input);
      const supporterId = input.supporter
        ? (await repo.upsertSupporter(input.supporter)).id
        : input.supporterId!;

      await repo.ensureSupporterRole({ supporterId, role: "donor" });

      const records = buildManualDonationRecords({
        supporterId,
        donationIdSeed: crypto.randomUUID(),
        input,
        actorUserId: args.actorUserId,
        now,
      });
      const result = await repo.insertManualDonation(records);

      if (hasProvidedConsents(input.consents)) {
        await repo.insertConsentRows(
          buildConsentRowsForUpdate({
            supporterId,
            update: {
              source: "admin_manual",
              email: input.consents?.email,
              whatsapp: input.consents?.whatsapp,
              timestamp: timestamp(now),
            },
          }),
        );
      }

      return result;
    },

    async exportSupporters(args: { actorUserId: string | null; rawSearch: unknown }) {
      const filters = exportSearchSchema.parse(args.rawSearch);
      const rows = await repo.listSupportersForExport(filters);
      await repo.insertAuditLog({
        actor_user_id: args.actorUserId,
        action: "export.supporters",
        entity: "supporter",
        entity_id: "bulk",
        timestamp: timestamp(now),
        detail: { filters, rowCount: rows.length },
      });
      return buildSupporterCsv(rows);
    },

    async exportDonations(args: { actorUserId: string | null; rawSearch: unknown }) {
      const filters = exportSearchSchema.parse(args.rawSearch);
      const rows = await repo.listDonationsForExport(filters);
      await repo.insertAuditLog({
        actor_user_id: args.actorUserId,
        action: "export.donations",
        entity: "export",
        entity_id: "bulk",
        timestamp: timestamp(now),
        detail: { filters, rowCount: rows.length },
      });
      return buildDonationCsv(rows);
    },
  };
}
