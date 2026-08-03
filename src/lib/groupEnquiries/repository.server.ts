import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  GroupEnquiry,
  GroupEnquiryActivityType,
  GroupEnquiryInsert,
  GroupEnquiryAdminUpdate,
  GroupEnquirySearch,
  GroupEnquiryNotificationStatus,
  GroupEnquiryStatus,
} from "./types";
import type { GroupEnquiryRepository } from "./service";

type GroupEnquiryRow = {
  id: string;
  organisation: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  activity_type: GroupEnquiryActivityType;
  other_activity_description: string | null;
  participant_count: number | null;
  participant_age_profile: string | null;
  preferred_date_notes: string | null;
  message: string | null;
  status: GroupEnquiryStatus;
  notification_status: GroupEnquiryNotificationStatus;
  notification_error: string | null;
  assigned_to: string | null;
  admin_notes: string | null;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
};

function toInsert(input: GroupEnquiryInsert) {
  return {
    organisation: input.organisationName,
    contact_name: input.contactPerson,
    contact_email: input.email,
    contact_phone: input.phone,
    activity_type: input.activityType,
    other_activity_description: input.otherActivityDescription,
    participant_count: input.participantCount,
    participant_age_profile: input.participantAgeProfile,
    preferred_date_notes: input.preferredDateNotes,
    message: input.message,
    idempotency_key: input.idempotencyKey,
  };
}

function toDomain(row: GroupEnquiryRow): GroupEnquiry {
  return {
    id: row.id,
    organisationName: row.organisation,
    contactPerson: row.contact_name,
    email: row.contact_email,
    phone: row.contact_phone,
    activityType: row.activity_type,
    otherActivityDescription: row.other_activity_description,
    participantCount: row.participant_count,
    participantAgeProfile: row.participant_age_profile,
    preferredDateNotes: row.preferred_date_notes,
    message: row.message,
    status: row.status,
    notificationStatus: row.notification_status,
    notificationError: row.notification_error,
    assignedTo: row.assigned_to,
    adminNotes: row.admin_notes,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSummary(row: GroupEnquiryRow) {
  return {
    id: row.id,
    organisationName: row.organisation,
    contactPerson: row.contact_name,
    activityType: row.activity_type,
    participantCount: row.participant_count,
    status: row.status,
    notificationStatus: row.notification_status,
    assignedTo: row.assigned_to,
    createdAt: row.created_at,
  };
}

function escapeLike(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function toUpdate(input: GroupEnquiryAdminUpdate) {
  const payload: Record<string, unknown> = {};
  if (input.status !== undefined) payload.status = input.status;
  if (input.assignedTo !== undefined) payload.assigned_to = input.assignedTo;
  if (input.adminNotes !== undefined) payload.admin_notes = input.adminNotes;
  return payload;
}

function isDuplicateKeyError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: string; message?: string };
  return maybe.code === "23505" || /duplicate key/i.test(maybe.message ?? "");
}

export function createSupabaseGroupEnquiryRepository(
  client: SupabaseClient,
): GroupEnquiryRepository {
  async function loadByIdempotencyKey(idempotencyKey: string) {
    const { data, error } = await client
      .from("group_enquiries")
      .select("*")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (error) throw error;
    return data ? toDomain(data as GroupEnquiryRow) : null;
  }

  return {
    async createOrGet(input) {
      const { data, error } = await client
        .from("group_enquiries")
        .insert(toInsert(input))
        .select("*")
        .single();
      if (!error) return { enquiry: toDomain(data as GroupEnquiryRow), created: true };
      if (!isDuplicateKeyError(error)) throw error;

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const existing = await loadByIdempotencyKey(input.idempotencyKey);
        if (existing) return { enquiry: existing, created: false };
      }
      throw new Error("Group enquiry duplicate could not be resolved");
    },

    async markNotificationSent(id) {
      const { error } = await client
        .from("group_enquiries")
        .update({ notification_status: "sent", notification_error: null })
        .eq("id", id);
      if (error) throw error;
    },

    async markNotificationFailed(id, safeError) {
      const { error } = await client
        .from("group_enquiries")
        .update({ notification_status: "failed", notification_error: safeError.slice(0, 300) })
        .eq("id", id);
      if (error) throw error;
    },

    async list(input: GroupEnquirySearch) {
      const from = (input.page - 1) * input.pageSize;
      let query = client
        .from("group_enquiries")
        .select(
          "id,organisation,contact_name,activity_type,participant_count,status,notification_status,assigned_to,created_at",
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .range(from, from + input.pageSize - 1);
      if (input.status) query = query.eq("status", input.status);
      if (input.notificationStatus)
        query = query.eq("notification_status", input.notificationStatus);
      if (input.q) {
        const like = `%${escapeLike(input.q)}%`;
        query = query.or(
          `organisation.ilike.${like},contact_name.ilike.${like},contact_email.ilike.${like}`,
        );
      }
      const { data, error, count } = await query;
      if (error) throw error;
      return { enquiries: ((data ?? []) as GroupEnquiryRow[]).map(toSummary), total: count ?? 0 };
    },

    async getById(id) {
      const { data, error } = await client
        .from("group_enquiries")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data ? toDomain(data as GroupEnquiryRow) : null;
    },

    async update(id, input) {
      const { data, error } = await client
        .from("group_enquiries")
        .update(toUpdate(input))
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return toDomain(data as GroupEnquiryRow);
    },
  };
}
