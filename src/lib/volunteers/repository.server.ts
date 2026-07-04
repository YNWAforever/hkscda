import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  SupporterVolunteerContext,
  VolunteerActivityDetail,
  VolunteerActivityStatus,
  VolunteerActivitySummary,
  VolunteerActivityType,
  VolunteerRegistrationDetail,
  VolunteerRegistrationStatus,
  VolunteerRegistrationSummary,
  VolunteerRegistrationType,
  VolunteerUnderagePolicy,
} from "./types";
import type { VolunteerRepository } from "./service";

type ActivityRow = {
  id: string;
  type: VolunteerActivityType;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  location: string;
  capacity: number;
  min_age: number | null;
  underage_policy: VolunteerUnderagePolicy;
  auto_approve: boolean;
  allow_waitlist: boolean;
  status: VolunteerActivityStatus;
  registration_modes: VolunteerRegistrationType[];
  created_at: string;
  updated_at: string;
};

type RegistrationRow = {
  id: string;
  activity_id: string;
  supporter_id: string | null;
  registration_type: VolunteerRegistrationType;
  status: VolunteerRegistrationStatus;
  status_reason: string | null;
  attendance_status: VolunteerRegistrationSummary["attendanceStatus"];
  participant_count: number;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  language: "zh-HK" | "en";
  organization_name: string | null;
  declared_age: number | null;
  youngest_age: number | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  notes: string | null;
  internal_notes: string | null;
  volunteer_hours: number | null;
  status_token_hash: string;
  status_token_expires_at: string;
  created_at: string;
  updated_at: string;
};

type ActivityCounts = {
  approvedParticipants: number;
  pendingParticipants: number;
  waitlistedParticipants: number;
};

const emptyCounts: ActivityCounts = {
  approvedParticipants: 0,
  pendingParticipants: 0,
  waitlistedParticipants: 0,
};

function escapeLike(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function toActivity(
  row: ActivityRow,
  counts: ActivityCounts = emptyCounts,
): VolunteerActivitySummary {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    location: row.location,
    capacity: row.capacity,
    minAge: row.min_age,
    underagePolicy: row.underage_policy,
    autoApprove: row.auto_approve,
    allowWaitlist: row.allow_waitlist,
    status: row.status,
    registrationModes: row.registration_modes,
    approvedParticipants: counts.approvedParticipants,
    pendingParticipants: counts.pendingParticipants,
    waitlistedParticipants: counts.waitlistedParticipants,
    remainingCapacity: Math.max(0, row.capacity - counts.approvedParticipants),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRegistration(
  row: RegistrationRow,
  activity?: VolunteerActivityDetail,
): VolunteerRegistrationSummary | VolunteerRegistrationDetail {
  const summary: VolunteerRegistrationSummary = {
    id: row.id,
    activityId: row.activity_id,
    supporterId: row.supporter_id,
    registrationType: row.registration_type,
    status: row.status,
    statusReason: row.status_reason,
    attendanceStatus: row.attendance_status,
    participantCount: row.participant_count,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    language: row.language,
    organizationName: row.organization_name,
    declaredAge: row.declared_age,
    youngestAge: row.youngest_age,
    guardianName: row.guardian_name,
    guardianPhone: row.guardian_phone,
    notes: row.notes,
    internalNotes: row.internal_notes,
    volunteerHours: row.volunteer_hours,
    statusToken: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  return activity ? { ...summary, activity } : summary;
}

function toActivityInsert(input: Parameters<VolunteerRepository["createActivity"]>[0]) {
  return {
    type: input.type,
    title: input.title,
    description: input.description,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    location: input.location,
    capacity: input.capacity,
    min_age: input.minAge,
    underage_policy: input.underagePolicy,
    auto_approve: input.autoApprove,
    allow_waitlist: input.allowWaitlist,
    status: input.status,
    registration_modes: input.registrationModes,
  };
}

function toActivityUpdate(input: Partial<Parameters<VolunteerRepository["createActivity"]>[0]>) {
  const payload: Record<string, unknown> = {};
  if (input.type !== undefined) payload.type = input.type;
  if (input.title !== undefined) payload.title = input.title;
  if (input.description !== undefined) payload.description = input.description;
  if (input.startsAt !== undefined) payload.starts_at = input.startsAt;
  if (input.endsAt !== undefined) payload.ends_at = input.endsAt;
  if (input.location !== undefined) payload.location = input.location;
  if (input.capacity !== undefined) payload.capacity = input.capacity;
  if (input.minAge !== undefined) payload.min_age = input.minAge;
  if (input.underagePolicy !== undefined) payload.underage_policy = input.underagePolicy;
  if (input.autoApprove !== undefined) payload.auto_approve = input.autoApprove;
  if (input.allowWaitlist !== undefined) payload.allow_waitlist = input.allowWaitlist;
  if (input.status !== undefined) payload.status = input.status;
  if (input.registrationModes !== undefined) payload.registration_modes = input.registrationModes;
  return payload;
}

async function loadActivityCounts(client: SupabaseClient, activityIds: string[]) {
  const counts = new Map<string, ActivityCounts>();
  if (activityIds.length === 0) return counts;

  const { data, error } = await client
    .from("volunteer_registration")
    .select("activity_id,status,participant_count")
    .in("activity_id", activityIds)
    .in("status", ["pending", "approved", "waitlisted"]);
  if (error) throw error;

  for (const row of (data ?? []) as Array<{
    activity_id: string;
    status: VolunteerRegistrationStatus;
    participant_count: number;
  }>) {
    const current = counts.get(row.activity_id) ?? { ...emptyCounts };
    if (row.status === "approved") current.approvedParticipants += row.participant_count;
    if (row.status === "pending") current.pendingParticipants += row.participant_count;
    if (row.status === "waitlisted") current.waitlistedParticipants += row.participant_count;
    counts.set(row.activity_id, current);
  }

  return counts;
}

async function hydrateActivities(client: SupabaseClient, rows: ActivityRow[]) {
  const counts = await loadActivityCounts(
    client,
    rows.map((row) => row.id),
  );
  return rows.map((row) => toActivity(row, counts.get(row.id)));
}

async function getActivity(client: SupabaseClient, id: string) {
  const { data, error } = await client
    .from("volunteer_activity")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return (await hydrateActivities(client, [data as ActivityRow]))[0] ?? null;
}

async function hydrateRegistrations(client: SupabaseClient, rows: RegistrationRow[]) {
  const activityIds = [...new Set(rows.map((row) => row.activity_id))];
  const { data, error } = activityIds.length
    ? await client.from("volunteer_activity").select("*").in("id", activityIds)
    : { data: [], error: null };
  if (error) throw error;
  const activities = await hydrateActivities(client, (data ?? []) as ActivityRow[]);
  const activityById = new Map(activities.map((activity) => [activity.id, activity]));

  return rows.map((row) => {
    const activity = activityById.get(row.activity_id);
    return activity
      ? (toRegistration(row, activity) as VolunteerRegistrationDetail)
      : toRegistration(row);
  });
}

function shiftCloneDates(source: ActivityRow, nextStartsAt: string | null | undefined) {
  if (!nextStartsAt) return { starts_at: source.starts_at, ends_at: source.ends_at };
  if (!source.ends_at) return { starts_at: nextStartsAt, ends_at: null };
  const duration = new Date(source.ends_at).getTime() - new Date(source.starts_at).getTime();
  return {
    starts_at: nextStartsAt,
    ends_at: new Date(new Date(nextStartsAt).getTime() + duration).toISOString(),
  };
}

export function createSupabaseVolunteerRepository(client: SupabaseClient): VolunteerRepository {
  return {
    async listPublishedActivities() {
      const { data, error } = await client
        .from("volunteer_activity")
        .select("*")
        .eq("status", "published")
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return hydrateActivities(client, (data ?? []) as ActivityRow[]);
    },

    async listActivities(input) {
      const from = (input.page - 1) * input.pageSize;
      let query = client
        .from("volunteer_activity")
        .select("*", { count: "exact" })
        .order("starts_at", { ascending: false })
        .range(from, from + input.pageSize - 1);
      if (input.status) query = query.eq("status", input.status);
      if (input.type) query = query.eq("type", input.type);
      if (input.q) query = query.ilike("title", `%${escapeLike(input.q)}%`);

      const { data, error, count } = await query;
      if (error) throw error;
      return {
        activities: await hydrateActivities(client, (data ?? []) as ActivityRow[]),
        total: count ?? 0,
      };
    },

    getActivityForRegistration(id) {
      return getActivity(client, id);
    },

    getActivityDetail(id) {
      return getActivity(client, id);
    },

    async createActivity(input) {
      const { data, error } = await client
        .from("volunteer_activity")
        .insert(toActivityInsert(input))
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },

    async updateActivity(id, input) {
      const { error } = await client
        .from("volunteer_activity")
        .update(toActivityUpdate(input))
        .eq("id", id);
      if (error) throw error;
    },

    async cloneActivity(input) {
      const { data: source, error: sourceError } = await client
        .from("volunteer_activity")
        .select("*")
        .eq("id", input.activityId)
        .single();
      if (sourceError) throw sourceError;
      const sourceRow = source as ActivityRow;
      const dates = shiftCloneDates(sourceRow, input.startsAt);
      const { data, error } = await client
        .from("volunteer_activity")
        .insert({
          type: sourceRow.type,
          title: `${sourceRow.title} copy`,
          description: sourceRow.description,
          ...dates,
          location: sourceRow.location,
          capacity: sourceRow.capacity,
          min_age: sourceRow.min_age,
          underage_policy: sourceRow.underage_policy,
          auto_approve: sourceRow.auto_approve,
          allow_waitlist: sourceRow.allow_waitlist,
          status: "draft",
          registration_modes: sourceRow.registration_modes,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },

    async upsertSupporter(input) {
      const { data, error } = await client
        .from("supporter")
        .upsert(
          {
            name: input.name,
            email: input.email,
            phone: input.phone,
            language: input.language,
            source: input.source,
            deleted_at: null,
          },
          { onConflict: "email" },
        )
        .select("id,email")
        .single();
      if (error) throw error;
      return { id: data.id as string, email: data.email as string };
    },

    async ensureSupporterRole(input) {
      const { error } = await client.from("supporter_role").upsert({
        supporter_id: input.supporterId,
        role: input.role,
      });
      if (error) throw error;
    },

    async insertConsentRows(rows) {
      if (rows.length === 0) return;
      const { error } = await client.from("consent").upsert(rows, {
        onConflict: "supporter_id,channel,status,source,timestamp",
        ignoreDuplicates: true,
      });
      if (error) throw error;
    },

    async createRegistration(input) {
      const { data, error } = await client
        .rpc("create_volunteer_registration", {
          p_activity_id: input.activityId,
          p_supporter_id: input.supporterId,
          p_registration_type: input.registrationType,
          p_participant_count: input.participantCount,
          p_contact_name: input.contactName,
          p_contact_email: input.contactEmail,
          p_contact_phone: input.contactPhone,
          p_language: input.language,
          p_organization_name: input.organizationName,
          p_declared_age: input.declaredAge,
          p_youngest_age: input.youngestAge,
          p_guardian_name: input.guardianName,
          p_guardian_phone: input.guardianPhone,
          p_notes: input.notes,
          p_status_token_hash: input.statusTokenHash,
          p_status_token_expires_at: input.statusTokenExpiresAt,
        })
        .single();
      if (error) throw error;
      const [registration] = await hydrateRegistrations(client, [data as RegistrationRow]);
      return registration as VolunteerRegistrationDetail;
    },

    async listRegistrations(input) {
      const from = (input.page - 1) * input.pageSize;
      let query = client
        .from("volunteer_registration")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, from + input.pageSize - 1);
      if (input.status) query = query.eq("status", input.status);
      if (input.attendanceStatus) query = query.eq("attendance_status", input.attendanceStatus);
      if (input.activityId) query = query.eq("activity_id", input.activityId);
      if (input.q) {
        const like = `%${escapeLike(input.q)}%`;
        query = query.or(
          `contact_name.ilike.${like},contact_email.ilike.${like},organization_name.ilike.${like}`,
        );
      }
      const { data, error, count } = await query;
      if (error) throw error;
      return {
        registrations: (await hydrateRegistrations(
          client,
          (data ?? []) as RegistrationRow[],
        )) as VolunteerRegistrationSummary[],
        total: count ?? 0,
      };
    },

    async getRegistrationDetail(id) {
      const { data, error } = await client
        .from("volunteer_registration")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const [registration] = await hydrateRegistrations(client, [data as RegistrationRow]);
      return registration as VolunteerRegistrationDetail;
    },

    async getRegistrationByStatusToken(tokenHash) {
      const { data, error } = await client
        .from("volunteer_registration")
        .select("*")
        .eq("status_token_hash", tokenHash)
        .gt("status_token_expires_at", new Date().toISOString())
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const [registration] = await hydrateRegistrations(client, [data as RegistrationRow]);
      return registration as VolunteerRegistrationDetail;
    },

    async updateRegistrationStatus(input) {
      const { data, error } = await client
        .from("volunteer_registration")
        .update({
          status: input.status,
          internal_notes: input.internalNotes,
        })
        .eq("id", input.registrationId)
        .select("*")
        .single();
      if (error) throw error;
      const [registration] = await hydrateRegistrations(client, [data as RegistrationRow]);
      return registration as VolunteerRegistrationDetail;
    },

    async updateAttendance(input) {
      const { data, error } = await client
        .from("volunteer_registration")
        .update({
          attendance_status: input.attendanceStatus,
          volunteer_hours: input.volunteerHours,
          internal_notes: input.internalNotes,
        })
        .eq("id", input.registrationId)
        .select("*")
        .single();
      if (error) throw error;
      const [registration] = await hydrateRegistrations(client, [data as RegistrationRow]);
      return registration as VolunteerRegistrationDetail;
    },

    async insertAuditLog(row) {
      const { error } = await client.from("audit_log").insert({
        actor_user_id: row.actor_user_id,
        action: row.action,
        entity: row.entity,
        entity_id: row.entity_id,
        timestamp: row.timestamp,
        detail: row.detail,
      });
      if (error) throw error;
    },
  };
}

export async function loadSupporterVolunteerContext(
  client: SupabaseClient,
  supporterId: string,
): Promise<SupporterVolunteerContext> {
  const { data, error } = await client
    .from("volunteer_registration")
    .select("*, activity:volunteer_activity(id,type,title,starts_at)")
    .eq("supporter_id", supporterId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  return {
    registrations: (
      (data ?? []) as Array<
        RegistrationRow & {
          activity: {
            id: string;
            type: VolunteerActivityType;
            title: string;
            starts_at: string;
          } | null;
        }
      >
    ).map((row) => ({
      id: row.id,
      activityId: row.activity_id,
      activityTitle: row.activity?.title ?? row.activity_id,
      activityType: row.activity?.type ?? "volunteer_shift",
      startsAt: row.activity?.starts_at ?? row.created_at,
      status: row.status,
      statusReason: row.status_reason,
      attendanceStatus: row.attendance_status,
      participantCount: row.participant_count,
      volunteerHours: row.volunteer_hours,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
}
