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
import type { ManualGiftCommand, ManualGiftResult } from "./manualGift.server";
import type { SupporterDetail, SupporterRole, SupporterSummary } from "./types";

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
  setSupporterRoles(input: { supporterId: string; roles: SupporterRole[] }): Promise<void>;
  mutateSupporterWithAudit?(command: {
    operation: "create" | "update";
    supporterId?: string;
    supporter?: SupporterInput;
    update?: SupporterUpdatePayload;
    expectedVersion?: number;
    roles?: SupporterRole[];
    audit: AuditLogInsert;
  }): Promise<{ id: string; email: string } | void>;
  appendConsentsWithAudit?(command: {
    rows: ConsentInsertRows;
    audit: AuditLogInsert;
  }): Promise<void>;
  insertConsentRows(rows: ConsentInsertRows): Promise<void>;
  recordManualGift(command: ManualGiftCommand): Promise<ManualGiftResult>;
  insertManualDonation(
    records: ManualDonationRecords,
  ): Promise<{ donationId: string; paymentId: string }>;
  // Issue the tax receipt + acknowledgement for a manual gift recorded as
  // already-succeeded, so it isn't silently skipped like an online reconcile.
  completeManualDonationSideEffects(paymentId: string): Promise<void>;
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
      if (repo.mutateSupporterWithAudit) {
        return (await repo.mutateSupporterWithAudit({
          operation: "create",
          supporter: input,
          roles: input.roles,
          audit: {
            actor_user_id: args.actorUserId,
            action: "supporter.create_or_update",
            entity: "supporter",
            entity_id: "",
            timestamp: timestamp(now),
            detail: { email: input.email, source: input.source },
          },
        })) as { id: string; email: string };
      }
      const supporter = await repo.upsertSupporter(input);
      await repo.setSupporterRoles({ supporterId: supporter.id, roles: input.roles });
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
      const { deleted, roles, expectedVersion, ...rest } = input;
      const update: SupporterUpdatePayload = { ...rest };
      if (deleted !== undefined) {
        update.deletedAt = deleted ? timestamp(now) : null;
      }

      if (repo.mutateSupporterWithAudit) {
        await repo.mutateSupporterWithAudit({
          operation: "update",
          supporterId: args.supporterId,
          update,
          expectedVersion,
          roles,
          audit: {
            actor_user_id: args.actorUserId,
            action: "supporter.update",
            entity: "supporter",
            entity_id: args.supporterId,
            timestamp: timestamp(now),
            detail: input,
          },
        });
        return;
      }
      throw new Error("Atomic versioned supporter mutation is required");
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
      if (repo.appendConsentsWithAudit) {
        await repo.appendConsentsWithAudit({
          rows,
          audit: {
            actor_user_id: args.actorUserId,
            action: "consent.append",
            entity: "supporter",
            entity_id: args.supporterId,
            timestamp: timestamp(now),
            detail: { channels: rows.map((row) => row.channel), source: update.source },
          },
        });
        return rows;
      }
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
      const { requestId, ...input } = manualDonationSchema.parse(args.input);
      const result = await repo.recordManualGift({
        requestId,
        actorUserId: args.actorUserId,
        input,
      });
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
