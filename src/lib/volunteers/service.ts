import { getAppUrl } from "../appUrl.server";
import { buildConsentRows } from "../donations/domain";
import type { IdentityResolution, PublicContact } from "../supporters/publicIdentity.server";
import { hashStatusToken, statusTokenExpiry } from "../publicAdoption/statusToken.server";
import { decideVolunteerRegistrationStatus, formatVolunteerReference } from "./rules";
import {
  adminActivityInputSchema,
  adminActivityUpdateSchema,
  adminAttendanceUpdateSchema,
  adminRegistrationStatusSchema,
  publicRegistrationSchema,
  publicStatusTokenSchema,
  volunteerActivitySearchSchema,
  volunteerRegistrationSearchSchema,
  type AdminActivityInput,
  type VolunteerActivitySearch,
  type VolunteerRegistrationSearch,
} from "./schemas";
import type {
  VolunteerActivityDetail,
  VolunteerActivitySummary,
  VolunteerRegistrationCreateInput,
  VolunteerRegistrationCreateResult,
  VolunteerRegistrationDetail,
  VolunteerRegistrationSummary,
} from "./types";

type ConsentRows = ReturnType<typeof buildConsentRows>;

export type VolunteerAuditLogInsert = {
  actor_user_id: string | null;
  action: string;
  entity: "volunteer_activity" | "volunteer_registration";
  entity_id: string;
  timestamp?: string;
  detail: Record<string, unknown>;
};

export type VolunteerRepository = {
  listPublishedActivities(): Promise<VolunteerActivitySummary[]>;
  listActivities(input: VolunteerActivitySearch): Promise<{
    activities: VolunteerActivitySummary[];
    total: number;
  }>;
  getActivityForRegistration(id: string): Promise<VolunteerActivityDetail | null>;
  getActivityDetail(id: string): Promise<VolunteerActivityDetail | null>;
  createActivity(
    input: AdminActivityInput,
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<string>;
  updateActivity(
    id: string,
    input: Partial<AdminActivityInput>,
    actorUserId: string,
    expectedUpdatedAt: string,
  ): Promise<void>;
  cloneActivity(input: {
    activityId: string;
    actorUserId: string;
    startsAt?: string | null;
  }): Promise<string>;
  resolvePublicIdentity(contact: PublicContact): Promise<IdentityResolution>;
  ensureSupporterRole(input: { supporterId: string; role: "volunteer" }): Promise<void>;
  insertConsentRows(rows: ConsentRows): Promise<void>;
  createRegistration(
    input: VolunteerRegistrationCreateInput,
  ): Promise<VolunteerRegistrationCreateResult>;
  listRegistrations(input: VolunteerRegistrationSearch): Promise<{
    registrations: VolunteerRegistrationSummary[];
    total: number;
  }>;
  getRegistrationDetail(id: string): Promise<VolunteerRegistrationDetail | null>;
  getRegistrationByStatusToken(tokenHash: string): Promise<VolunteerRegistrationDetail | null>;
  updateRegistrationStatus(input: {
    actorUserId: string;
    expectedUpdatedAt: string;
    registrationId: string;
    status: VolunteerRegistrationSummary["status"];
    internalNotes?: string | null;
    /** Why a registration was rejected; audited. Null for any other status. */
    reason: string | null;
  }): Promise<VolunteerRegistrationDetail>;
  updateAttendance(input: {
    actorUserId: string;
    expectedUpdatedAt: string;
    command: "record" | "correct";
    reason?: string;
    registrationId: string;
    attendanceStatus: VolunteerRegistrationSummary["attendanceStatus"];
    volunteerHours?: number | null;
    internalNotes?: string | null;
  }): Promise<VolunteerRegistrationDetail>;
  insertAuditLog(row: VolunteerAuditLogInsert): Promise<void>;
};

type VolunteerServiceArgs = {
  repo: VolunteerRepository;
  now?: () => Date;
  appUrl?: string;
  sendRegistrationEmail?: (input: {
    registration: VolunteerRegistrationDetail;
    statusUrl: string;
  }) => Promise<unknown>;
  notifyAdmins?: (input: { registration: VolunteerRegistrationDetail }) => Promise<unknown>;
  logger?: Pick<Console, "error">;
};

function statusUrl(appUrl: string, token: string) {
  return `${appUrl.replace(/\/+$/, "")}/volunteer/status/${encodeURIComponent(token)}`;
}

function noStorePublicSummary(
  registration: VolunteerRegistrationDetail,
  rawToken: string,
  appUrl: string,
) {
  return {
    registrationId: registration.id,
    reference: formatVolunteerReference(registration.id),
    status: registration.status,
    statusUrl: statusUrl(appUrl, rawToken),
  };
}

export function createVolunteerService({
  repo,
  now = () => new Date(),
  appUrl = getAppUrl(),
  sendRegistrationEmail = async () => undefined,
  notifyAdmins = async () => undefined,
  logger = console,
}: VolunteerServiceArgs) {
  return {
    listPublishedActivities() {
      return repo.listPublishedActivities();
    },

    listActivities(raw: unknown) {
      return repo.listActivities(volunteerActivitySearchSchema.parse(raw));
    },

    async createActivity(args: { actorUserId: string; input: unknown }) {
      const input = adminActivityInputSchema.parse(args.input);
      const id = await repo.createActivity(
        { ...input, status: "draft" },
        args.actorUserId,
        input.idempotencyKey ?? crypto.randomUUID(),
      );
      return { id };
    },

    async updateActivity(args: { actorUserId: string; activityId: string; input: unknown }) {
      const { expectedUpdatedAt, ...input } = adminActivityUpdateSchema.parse(args.input);
      await repo.updateActivity(args.activityId, input, args.actorUserId, expectedUpdatedAt);
      return { ok: true };
    },

    async cloneActivity(args: {
      actorUserId: string;
      activityId: string;
      input?: { startsAt?: string | null };
    }) {
      const id = await repo.cloneActivity({
        activityId: args.activityId,
        actorUserId: args.actorUserId,
        startsAt: args.input?.startsAt ?? null,
      });
      return { id };
    },

    async getActivityDetail(id: string) {
      return repo.getActivityDetail(id);
    },

    listRegistrations(raw: unknown) {
      return repo.listRegistrations(volunteerRegistrationSearchSchema.parse(raw));
    },

    async getRegistrationDetail(id: string) {
      return repo.getRegistrationDetail(id);
    },

    async submitPublicRegistration(raw: unknown) {
      const input = publicRegistrationSchema.parse(raw);
      const activity = await repo.getActivityForRegistration(input.activityId);
      if (!activity) {
        throw new Error("Volunteer activity not found");
      }

      const supporter = await repo.resolvePublicIdentity({
        name: input.contact.name,
        email: input.contact.email,
        phone: input.contact.phone,
        language: input.contact.language,
        source: "volunteer_registration_form",
      });
      const decision = decideVolunteerRegistrationStatus({
        activity,
        draft: input,
        now: now(),
      });
      const { registration } = await repo.createRegistration({
        activityId: input.activityId,
        supporterId: supporter.supporterId,
        registrationType: input.registrationType,
        status: decision.status,
        statusReason: decision.reason,
        participantCount: input.participantCount,
        contactName: input.contact.name,
        contactEmail: input.contact.email,
        contactPhone: input.contact.phone,
        language: input.contact.language,
        organizationName: input.organizationName,
        declaredAge: input.declaredAge,
        youngestAge: input.youngestAge,
        guardianName: input.guardianName,
        guardianPhone: input.guardianPhone,
        notes: input.notes,
        consentEmailRequested: input.consents.email,
        consentWhatsappRequested: input.consents.whatsapp,
        statusTokenHash: hashStatusToken(input.submissionToken),
        statusTokenExpiresAt: statusTokenExpiry(now),
      });

      await repo.ensureSupporterRole({ supporterId: supporter.supporterId, role: "volunteer" });
      await repo.insertConsentRows(
        buildConsentRows({
          supporterId: supporter.supporterId,
          source: "volunteer_registration_form",
          timestamp: registration.createdAt,
          consents: {
            email: input.consents.email,
            whatsapp: input.consents.whatsapp,
          },
        }).filter((row) => row.status === "opt_out"),
      );

      const publicSummary = noStorePublicSummary(registration, input.submissionToken, appUrl);
      let confirmationEmailSent = false;
      try {
        const delivery = await sendRegistrationEmail({
          registration,
          statusUrl: publicSummary.statusUrl,
        });
        confirmationEmailSent = delivery === "sent" || delivery === "skipped";
        if (delivery === "failed") logger.error("Volunteer registration confirmation was not sent");
      } catch (error) {
        logger.error("Failed to send volunteer registration email", error);
      }
      try {
        const delivery = await notifyAdmins({ registration });
        if (delivery === "failed") logger.error("Failed to send volunteer admin notification");
      } catch (error) {
        logger.error("Failed to send volunteer admin notification", error);
      }
      return { ...publicSummary, confirmationEmailSent };
    },

    async getPublicRegistrationStatus(rawToken: string) {
      const { token } = publicStatusTokenSchema.parse({ token: rawToken });
      const registration = await repo.getRegistrationByStatusToken(hashStatusToken(token));
      if (!registration) return null;
      return {
        reference: formatVolunteerReference(registration.id),
        status: registration.status,
        attendanceStatus: registration.attendanceStatus,
        participantCount: registration.participantCount,
        activityTitle: registration.activity.title,
        startsAt: registration.activity.startsAt,
        location: registration.activity.location,
      };
    },

    async updateRegistrationStatus(args: {
      actorUserId: string;
      registrationId: string;
      input: unknown;
    }) {
      const input = adminRegistrationStatusSchema.parse(args.input);
      const registration = await repo.updateRegistrationStatus({
        registrationId: args.registrationId,
        actorUserId: args.actorUserId,
        expectedUpdatedAt: input.expectedUpdatedAt,
        status: input.status,
        internalNotes: input.internalNotes,
        reason: input.reason,
      });
      return registration;
    },

    async updateAttendance(args: { actorUserId: string; registrationId: string; input: unknown }) {
      const input = adminAttendanceUpdateSchema.parse(args.input);
      const registration = await repo.updateAttendance({
        ...input,
        actorUserId: args.actorUserId,
        registrationId: args.registrationId,
      });
      return registration;
    },
  };
}
