import { getAppUrl } from "../appUrl.server";
import { buildConsentRows } from "../donations/domain";
import type { IdentityResolution, PublicContact } from "../supporters/publicIdentity.server";
import {
  createStatusTokenPair,
  hashStatusToken,
  statusTokenExpiry,
} from "../publicAdoption/statusToken.server";
import {
  decideVolunteerRegistrationStatus,
  formatVolunteerReference,
  validateAttendanceTransition,
} from "./rules";
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
  createActivity(input: AdminActivityInput): Promise<string>;
  updateActivity(
    id: string,
    input: Partial<AdminActivityInput>,
    actorUserId: string,
    expectedUpdatedAt: string,
  ): Promise<void>;
  cloneActivity(input: { activityId: string; startsAt?: string | null }): Promise<string>;
  resolvePublicIdentity(contact: PublicContact): Promise<IdentityResolution>;
  ensureSupporterRole(input: { supporterId: string; role: "volunteer" }): Promise<void>;
  insertConsentRows(rows: ConsentRows): Promise<void>;
  createRegistration(input: VolunteerRegistrationCreateInput): Promise<VolunteerRegistrationDetail>;
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
  }): Promise<VolunteerRegistrationDetail>;
  updateAttendance(input: {
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
  createStatusTokenPair?: typeof createStatusTokenPair;
  appUrl?: string;
  // The real senders resolve to a delivery outcome ("sent" | "skipped" | "failed")
  // which the service intentionally discards — `unknown` says so without forcing
  // callers to wrap them. `Promise<void>` would reject them: TypeScript's
  // void-return exemption does not apply through a Promise type argument.
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

function timestamp(now: () => Date) {
  return now().toISOString();
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
  createStatusTokenPair: makeStatusToken = createStatusTokenPair,
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
      const id = await repo.createActivity(input);
      await repo.insertAuditLog({
        actor_user_id: args.actorUserId,
        action: "volunteer_activity.create",
        entity: "volunteer_activity",
        entity_id: id,
        timestamp: timestamp(now),
        detail: { title: input.title, type: input.type, status: input.status },
      });
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
        startsAt: args.input?.startsAt ?? null,
      });
      await repo.insertAuditLog({
        actor_user_id: args.actorUserId,
        action: "volunteer_activity.clone",
        entity: "volunteer_activity",
        entity_id: id,
        timestamp: timestamp(now),
        detail: { sourceActivityId: args.activityId },
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
      await repo.ensureSupporterRole({ supporterId: supporter.supporterId, role: "volunteer" });
      await repo.insertConsentRows(
        buildConsentRows({
          supporterId: supporter.supporterId,
          source: "volunteer_registration_form",
          timestamp: timestamp(now),
          consents: {
            email: input.consents.email,
            whatsapp: input.consents.whatsapp,
          },
        }).filter((row) => row.status === "opt_out"),
      );

      const decision = decideVolunteerRegistrationStatus({
        activity,
        draft: input,
        now: now(),
      });
      const token = makeStatusToken();
      const registration = await repo.createRegistration({
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
        statusTokenHash: token.tokenHash,
        statusTokenExpiresAt: statusTokenExpiry(now),
      });

      const publicSummary = noStorePublicSummary(registration, token.rawToken, appUrl);
      try {
        await sendRegistrationEmail({ registration, statusUrl: publicSummary.statusUrl });
      } catch (error) {
        logger.error("Failed to send volunteer registration email", error);
      }
      try {
        await notifyAdmins({ registration });
      } catch (error) {
        logger.error("Failed to send volunteer admin notification", error);
      }
      return publicSummary;
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
      });
      return registration;
    },

    async updateAttendance(args: { actorUserId: string; registrationId: string; input: unknown }) {
      const current = await repo.getRegistrationDetail(args.registrationId);
      if (!current) throw new Error("Volunteer registration not found");
      const input = adminAttendanceUpdateSchema.parse(args.input);
      validateAttendanceTransition(current.status, input.attendanceStatus);
      const registration = await repo.updateAttendance({
        registrationId: args.registrationId,
        attendanceStatus: input.attendanceStatus,
        volunteerHours: input.volunteerHours,
        internalNotes: input.internalNotes,
      });
      await repo.insertAuditLog({
        actor_user_id: args.actorUserId,
        action: "volunteer_registration.attendance_update",
        entity: "volunteer_registration",
        entity_id: args.registrationId,
        timestamp: timestamp(now),
        detail: input,
      });
      return registration;
    },
  };
}
