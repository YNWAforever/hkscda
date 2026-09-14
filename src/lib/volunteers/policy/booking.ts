import { z } from "zod";
import type { PolicyDraft } from "./schemas";
const base = {
  activity_id: z.string().uuid(),
  role: z
    .string()
    .regex(/^[a-z][a-z0-9_-]{0,79}$/)
    .default("volunteer"),
};
export const bookingCommandSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("accept_terms"),
      activity_id: z.string().uuid(),
      accept_terms: z.literal(true),
      terms_version_id: z.string().uuid(),
      idempotency_key: z.string().uuid(),
    })
    .strict(),
  z.object({ ...base, action: z.literal("availability") }).strict(),
  z
    .object({
      ...base,
      action: z.literal("book"),
      remarks: z.string().max(5000).default(""),
      accept_terms: z.literal(true),
      terms_version_id: z.string().uuid(),
      idempotency_key: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal("cancel"),
      activity_id: z.string().uuid(),
      idempotency_key: z.string().uuid(),
    })
    .strict(),
]);
export const profileClaimSchema = z
  .object({
    action: z.literal("claim"),
    display_name: z.string().trim().min(1).max(120),
    birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();
export type BookingCommand = z.infer<typeof bookingCommandSchema>;
export type BookingResult = {
  kind: string;
  reason?: string;
  message?: string;
  allowed?: boolean;
  waitlist_allowed?: boolean;
  waitlist_reason?: string;
  remaining?: number;
  status?: string;
  registration_id?: string;
};
export type PublicSessionSummary = {
  confirmed: number;
  waitlisted: number;
  remaining: number;
  window_state: "not_yet_open" | "window_closed" | "within_window";
  opens_at: string | null;
  closes_at: string | null;
  next_transition_at: string | null;
  timezone: string;
};
export type PolicySession = {
  shelter?: string;
  summary?: PublicSessionSummary;
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string;
  capacity: number;
  policy_version_id: string;
  policy: Pick<PolicyDraft, "eligibility" | "roles" | "remarks" | "terms">;
};
export type VolunteerMe = {
  registrations_limit?: number;
  upcoming_total?: number;
  history_total?: number;
  upcoming_page?: number;
  history_page?: number;
  page_size?: number;
  history?: {
    verified_sessions: number;
    history_coverage_start: string | null;
    joined_on: string | null;
    credentials: {
      id: string;
      label: string;
      valid_from: string;
      valid_until: string | null;
      revoked: boolean;
      currently_valid: boolean;
    }[];
  };
  profile: { id: string; display_name: string; tier: string; status: string } | null;
  registrations: {
    id: string;
    activity_id: string;
    status: string;
    attendance_status: string;
    notes: string | null;
    created_at?: string;
    updated_at?: string;
    actions?: { cancel: boolean; cancel_reason: string | null };
    activity?: Pick<PolicySession, "id" | "title" | "starts_at" | "ends_at" | "location"> | null;
  }[];
};
export const sessionQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  query: z.string().trim().max(120).default(""),
  shelter: z
    .string()
    .regex(/^[a-z][a-z0-9_-]{0,79}$/)
    .optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const date = new Date(`${value}T00:00:00Z`);
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }, "Invalid service date")
    .optional(),
});
export type SessionQuery = z.infer<typeof sessionQuerySchema>;
export const memberQuerySchema = z.object({
  upcoming_page: z.coerce.number().int().min(1).max(100000).default(1),
  history_page: z.coerce.number().int().min(1).max(100000).default(1),
});
export type MemberQuery = z.infer<typeof memberQuerySchema>;
export type BookingRepository = {
  claim(actor: string, command: z.infer<typeof profileClaimSchema>): Promise<BookingResult>;
  command(actor: string, command: BookingCommand): Promise<BookingResult>;
  sessions(query?: SessionQuery): Promise<PolicySession[]>;
  terms(ids?: string[]): Promise<{ id: string; body: string; published_at: string }[]>;
  me(actor: string, query?: MemberQuery): Promise<VolunteerMe>;
};
export function createBookingService(repo: BookingRepository) {
  return {
    claim: (actor: string, raw: unknown) => repo.claim(actor, profileClaimSchema.parse(raw)),
    command: (actor: string, raw: unknown) => repo.command(actor, bookingCommandSchema.parse(raw)),
    sessions: (raw: unknown = {}) => repo.sessions(sessionQuerySchema.parse(raw)),
    terms: (ids?: string[]) => repo.terms(ids),
    me: (actor: string, raw: unknown = {}) => repo.me(actor, memberQuerySchema.parse(raw)),
  };
}
