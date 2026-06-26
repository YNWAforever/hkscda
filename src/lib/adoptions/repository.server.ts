import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdoptionCoordinatorRepository, StatusUpdate } from "./service";
import type {
  AdoptionCaseDetail,
  AdoptionCaseSummary,
  AdoptionFollowup,
  AnimalMatchSummary,
  CoordinatorStatus,
  SuccessfulAdoption,
} from "./types";

type StatusRow = {
  id: string;
  category: CoordinatorStatus["category"];
  key: string;
  label_zh: string;
  label_en: string;
  sort_order: number;
  color: string;
  is_active: boolean;
  is_system: boolean;
  is_closing: boolean;
  is_final: boolean;
};

type AdoptionCaseRow = {
  id: string;
  status_id: string;
  requested_animal_id: string | null;
  animal_type: string;
  applicant_name: string;
  applicant_phone: string;
  applicant_email: string | null;
  applicant_address: string | null;
  housing_type: string | null;
  family_size: number | null;
  existing_pets: string | null;
  reason: string | null;
  supporter_id: string | null;
  adopter_profile_id: string | null;
  assessment: Record<string, unknown>;
  preferences: Record<string, unknown>;
  closed_at: string | null;
  created_at: string;
};

type AnimalRow = {
  id: string;
  name: string;
  name_en: string | null;
};

type AnimalMatchRow = {
  id: string;
  adoption_case_id: string;
  animal_id: string;
  status_id: string;
  is_approved: boolean;
  notes: string | null;
};

type FollowupRow = {
  id: string;
  adoption_case_id: string;
  status_id: string;
  title: string;
  scheduled_at: string | null;
  completed_at: string | null;
  volunteer: string | null;
  remarks: string | null;
};

type SuccessfulAdoptionRow = {
  id: string;
  adoption_case_id: string;
  animal_id: string;
  supporter_id: string;
  adopter_profile_id: string;
  case_number: string;
  adoption_fee_cents: number | null;
  approval_date: string;
  pickup_date: string | null;
};

function escapeLike(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter(Boolean) as string[])];
}

export function mapStatus(row: StatusRow): CoordinatorStatus {
  return {
    id: row.id,
    category: row.category,
    key: row.key,
    labelZh: row.label_zh,
    labelEn: row.label_en,
    sortOrder: row.sort_order,
    color: row.color,
    isActive: row.is_active,
    isSystem: row.is_system,
    isClosing: row.is_closing,
    isFinal: row.is_final,
  };
}

function animalName(row: AnimalRow | undefined) {
  if (!row) return null;
  return row.name_en ? `${row.name} / ${row.name_en}` : row.name;
}

async function loadStatusesByIds(client: SupabaseClient, ids: string[]) {
  const uniqueIds = unique(ids);
  if (uniqueIds.length === 0) return new Map<string, CoordinatorStatus>();

  const { data, error } = await client.from("coordinator_status").select("*").in("id", uniqueIds);
  if (error) throw error;

  return new Map(((data ?? []) as StatusRow[]).map((row) => [row.id, mapStatus(row)]));
}

async function loadAnimalsByIds(client: SupabaseClient, ids: string[]) {
  const uniqueIds = unique(ids);
  if (uniqueIds.length === 0) return new Map<string, AnimalRow>();

  const { data, error } = await client
    .from("animals")
    .select("id,name,name_en")
    .in("id", uniqueIds);
  if (error) throw error;

  return new Map(((data ?? []) as AnimalRow[]).map((row) => [row.id, row]));
}

async function searchCaseIds(client: SupabaseClient, q: string) {
  const like = `%${escapeLike(q)}%`;
  const columns = ["applicant_name", "applicant_phone", "applicant_email"] as const;
  const results = await Promise.all(
    columns.map((column) => client.from("adoption_case").select("id").ilike(column, like)),
  );

  for (const result of results) {
    if (result.error) throw result.error;
  }

  return unique(
    results.flatMap((result) => (result.data ?? []).map((row) => (row as { id: string }).id)),
  );
}

function requireStatus(statuses: Map<string, CoordinatorStatus>, id: string) {
  const status = statuses.get(id);
  if (!status) throw new Error(`Missing coordinator status ${id}`);
  return status;
}

function mapCaseSummary(
  row: AdoptionCaseRow,
  statuses: Map<string, CoordinatorStatus>,
  animals: Map<string, AnimalRow>,
): AdoptionCaseSummary {
  return {
    id: row.id,
    applicantName: row.applicant_name,
    applicantPhone: row.applicant_phone,
    applicantEmail: row.applicant_email,
    animalType: row.animal_type,
    requestedAnimalName: row.requested_animal_id
      ? animalName(animals.get(row.requested_animal_id))
      : null,
    status: requireStatus(statuses, row.status_id),
    createdAt: row.created_at,
    closedAt: row.closed_at,
  };
}

function mapMatchSummary(
  row: AnimalMatchRow,
  statuses: Map<string, CoordinatorStatus>,
  animals: Map<string, AnimalRow>,
): AnimalMatchSummary {
  return {
    id: row.id,
    animalId: row.animal_id,
    animalName: animalName(animals.get(row.animal_id)) ?? "",
    status: requireStatus(statuses, row.status_id),
    isApproved: row.is_approved,
    notes: row.notes,
  };
}

function mapFollowup(row: FollowupRow, statuses: Map<string, CoordinatorStatus>): AdoptionFollowup {
  return {
    id: row.id,
    title: row.title,
    status: requireStatus(statuses, row.status_id),
    scheduledAt: row.scheduled_at,
    completedAt: row.completed_at,
    volunteer: row.volunteer,
    remarks: row.remarks,
  };
}

function mapSuccessfulAdoption(row: SuccessfulAdoptionRow | null): SuccessfulAdoption | null {
  if (!row) return null;
  return {
    id: row.id,
    caseNumber: row.case_number,
    animalId: row.animal_id,
    supporterId: row.supporter_id,
    adopterProfileId: row.adopter_profile_id,
    adoptionFeeCents: row.adoption_fee_cents,
    approvalDate: row.approval_date,
    pickupDate: row.pickup_date,
  };
}

function toStatusUpdatePayload(input: StatusUpdate) {
  const payload: Record<string, unknown> = {};
  if (input.category !== undefined) payload.category = input.category;
  if (input.key !== undefined) payload.key = input.key;
  if (input.labelZh !== undefined) payload.label_zh = input.labelZh;
  if (input.labelEn !== undefined) payload.label_en = input.labelEn;
  if (input.sortOrder !== undefined) payload.sort_order = input.sortOrder;
  if (input.color !== undefined) payload.color = input.color;
  if (input.isActive !== undefined) payload.is_active = input.isActive;
  if (input.isClosing !== undefined) payload.is_closing = input.isClosing;
  if (input.isFinal !== undefined) payload.is_final = input.isFinal;
  return payload;
}

export function createSupabaseAdoptionCoordinatorRepository(
  client: SupabaseClient,
): AdoptionCoordinatorRepository {
  return {
    async listStatuses(category) {
      let query = client
        .from("coordinator_status")
        .select("*")
        .order("category")
        .order("sort_order", { ascending: true });
      if (category) query = query.eq("category", category);

      const { data, error } = await query;
      if (error) throw error;
      return ((data ?? []) as StatusRow[]).map(mapStatus);
    },

    async getStatus(id) {
      const { data, error } = await client
        .from("coordinator_status")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data ? mapStatus(data as StatusRow) : null;
    },

    async createStatus(input) {
      const { data, error } = await client
        .from("coordinator_status")
        .insert({
          category: input.category,
          key: input.key,
          label_zh: input.labelZh,
          label_en: input.labelEn,
          sort_order: input.sortOrder,
          color: input.color,
          is_active: input.isActive,
          is_closing: input.isClosing,
          is_final: input.isFinal,
        })
        .select("*")
        .single();
      if (error) throw error;
      return mapStatus(data as StatusRow);
    },

    async updateStatus(id, input) {
      const { data, error } = await client
        .from("coordinator_status")
        .update(toStatusUpdatePayload(input))
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return mapStatus(data as StatusRow);
    },

    async deleteStatus(id) {
      const { error } = await client.from("coordinator_status").delete().eq("id", id);
      if (error) throw error;
    },

    async listCases(input) {
      const from = (input.page - 1) * input.pageSize;
      let query = client
        .from("adoption_case")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, from + input.pageSize - 1);

      if (input.statusId) query = query.eq("status_id", input.statusId);
      if (input.animalType) query = query.eq("animal_type", input.animalType);
      if (input.openOnly) query = query.is("closed_at", null);
      if (input.q) {
        const ids = await searchCaseIds(client, input.q);
        if (ids.length === 0) return { cases: [], total: 0 };
        query = query.in("id", ids);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      const rows = (data ?? []) as AdoptionCaseRow[];
      const [statuses, animals] = await Promise.all([
        loadStatusesByIds(
          client,
          rows.map((row) => row.status_id),
        ),
        loadAnimalsByIds(
          client,
          rows.map((row) => row.requested_animal_id ?? ""),
        ),
      ]);

      return {
        cases: rows.map((row) => mapCaseSummary(row, statuses, animals)),
        total: count ?? 0,
      };
    },

    async getCaseDetail(id) {
      const { data: caseData, error: caseError } = await client
        .from("adoption_case")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (caseError) throw caseError;
      if (!caseData) return null;

      const row = caseData as AdoptionCaseRow;
      const [matchesResult, followupsResult, successResult] = await Promise.all([
        client
          .from("animal_match")
          .select("id,adoption_case_id,animal_id,status_id,is_approved,notes")
          .eq("adoption_case_id", id)
          .order("created_at", { ascending: false }),
        client
          .from("adoption_followup")
          .select("id,adoption_case_id,status_id,title,scheduled_at,completed_at,volunteer,remarks")
          .eq("adoption_case_id", id)
          .order("scheduled_at", { ascending: false }),
        client.from("successful_adoption").select("*").eq("adoption_case_id", id).maybeSingle(),
      ]);
      if (matchesResult.error) throw matchesResult.error;
      if (followupsResult.error) throw followupsResult.error;
      if (successResult.error) throw successResult.error;

      const matchRows = (matchesResult.data ?? []) as AnimalMatchRow[];
      const followupRows = (followupsResult.data ?? []) as FollowupRow[];
      const successRow = (successResult.data ?? null) as SuccessfulAdoptionRow | null;

      const [statuses, animals] = await Promise.all([
        loadStatusesByIds(client, [
          row.status_id,
          ...matchRows.map((match) => match.status_id),
          ...followupRows.map((followup) => followup.status_id),
        ]),
        loadAnimalsByIds(client, [
          row.requested_animal_id ?? "",
          ...matchRows.map((match) => match.animal_id),
        ]),
      ]);

      return {
        ...mapCaseSummary(row, statuses, animals),
        applicantAddress: row.applicant_address,
        housingType: row.housing_type,
        familySize: row.family_size,
        existingPets: row.existing_pets,
        reason: row.reason,
        supporterId: row.supporter_id,
        adopterProfileId: row.adopter_profile_id,
        assessment: row.assessment,
        preferences: row.preferences,
        matches: matchRows.map((match) => mapMatchSummary(match, statuses, animals)),
        followups: followupRows.map((followup) => mapFollowup(followup, statuses)),
        successfulAdoption: mapSuccessfulAdoption(successRow),
      } satisfies AdoptionCaseDetail;
    },

    async changeCaseStatus(input) {
      const { error } = await client.rpc("change_adoption_case_status", {
        p_case_id: input.caseId,
        p_status_id: input.statusId,
        p_actor_user_id: input.actorUserId,
        p_note: input.note,
        p_closed_at: input.closedAt,
      });
      if (error) throw error;
    },

    async insertAuditLog(input) {
      const { error } = await client.from("audit_log").insert({
        actor_user_id: input.actor_user_id,
        action: input.action,
        entity: input.entity,
        entity_id: input.entity_id,
        timestamp: input.timestamp,
        detail: input.detail,
      });
      if (error) throw error;
    },

    async createMatch(input) {
      const { data, error } = await client
        .from("animal_match")
        .insert({
          adoption_case_id: input.adoptionCaseId,
          animal_id: input.animalId,
          status_id: input.statusId,
          is_approved: input.isApproved,
          notes: input.notes ?? null,
          created_by: input.createdBy,
          updated_by: input.createdBy,
        })
        .select("id")
        .single();
      if (error) throw error;
      return { id: data.id as string };
    },

    async createFollowup(input) {
      const { data, error } = await client
        .from("adoption_followup")
        .insert({
          adoption_case_id: input.adoptionCaseId,
          status_id: input.statusId,
          title: input.title,
          scheduled_at: input.scheduledAt ?? null,
          completed_at: input.completedAt ?? null,
          has_window_net: input.hasWindowNet ?? null,
          environment: input.environment ?? null,
          score: input.score ?? null,
          volunteer: input.volunteer ?? null,
          remarks: input.remarks ?? null,
          created_by: input.createdBy,
          updated_by: input.createdBy,
        })
        .select("id")
        .single();
      if (error) throw error;
      return { id: data.id as string };
    },

    async finalizeAdoption(input) {
      const { data, error } = await client.rpc("finalize_successful_adoption", {
        p_adoption_case_id: input.adoptionCaseId,
        p_match_id: input.matchId,
        p_outcome_status_id: input.outcomeStatusId,
        p_case_number: input.caseNumber,
        p_adoption_fee_cents: input.adoptionFeeCents ?? null,
        p_approval_date: input.approvalDate,
        p_pickup_date: input.pickupDate ?? null,
        p_approved_by: input.approvedBy,
      });
      if (error) throw error;
      return { id: data as string };
    },
  };
}
