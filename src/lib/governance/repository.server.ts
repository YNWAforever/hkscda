// src/lib/governance/repository.server.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type {
  BoardMember,
  BoardMemberInput,
  GovernanceAuditLog,
  GovernanceRepository,
  PublicBoardRoster,
} from "./types";

const ROW_COLUMNS = "id,name,role_title,sort_order,effective_date,is_active,created_at,updated_at";

const rowSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  role_title: z.string().min(1),
  sort_order: z.number().int().min(0),
  effective_date: z.string(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

function mapRow(raw: unknown): BoardMember | null {
  const parsed = rowSchema.safeParse(raw);
  if (!parsed.success) return null;
  return {
    id: parsed.data.id,
    name: parsed.data.name,
    roleTitle: parsed.data.role_title,
    sortOrder: parsed.data.sort_order,
    effectiveDate: parsed.data.effective_date,
    isActive: parsed.data.is_active,
    createdAt: parsed.data.created_at,
    updatedAt: parsed.data.updated_at,
  };
}

function toRow(input: BoardMemberInput, actorUserId: string) {
  return {
    ...(input.id ? { id: input.id } : {}),
    name: input.name,
    role_title: input.roleTitle,
    sort_order: input.sortOrder,
    effective_date: input.effectiveDate,
    updated_by: actorUserId,
    ...(input.id ? {} : { created_by: actorUserId }),
  };
}

async function readBoardRows(client: SupabaseClient, activeOnly: boolean): Promise<BoardMember[]> {
  const rows: unknown[] = [];
  let from = 0;
  let total = 0;
  do {
    let query = client.from("board_member").select(ROW_COLUMNS, { count: "exact" });
    if (activeOnly) query = query.eq("is_active", true);
    const { data, count, error } = await query
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw error;
    const batch = data ?? [];
    if (batch.length === 0 && from < (count ?? 0)) {
      throw new Error("Board roster read stopped before all rows were returned");
    }
    rows.push(...batch);
    from += batch.length;
    total = count ?? from;
  } while (from < total);
  return rows.map(mapRow).filter((row): row is BoardMember => row !== null);
}

export function createSupabaseGovernanceRepository(client: SupabaseClient): GovernanceRepository {
  return {
    usesAtomicAudit: true,
    async listPublicRoster(): Promise<PublicBoardRoster> {
      const members = await readBoardRows(client, true);

      const lastUpdated = members.reduce<string | null>(
        (latest, member) => (!latest || member.updatedAt > latest ? member.updatedAt : latest),
        null,
      );

      return {
        members: members.map((m) => ({
          name: m.name,
          roleTitle: m.roleTitle,
          sortOrder: m.sortOrder,
        })),
        lastUpdated,
      };
    },

    async listAdmin(): Promise<BoardMember[]> {
      return readBoardRows(client, false);
    },

    async upsert(input: BoardMemberInput, actorUserId: string): Promise<BoardMember> {
      const { data, error } = await client.rpc("mutate_admin_content_with_audit", {
        p_actor_user_id: actorUserId,
        p_entity: "board_member",
        p_operation: "upsert",
        p_id: input.id ?? null,
        p_payload: toRow(input, actorUserId),
      });
      if (error) throw error;
      const mapped = mapRow(data);
      if (!mapped) throw new Error("Board member mutation returned an invalid row");
      return mapped;
    },

    async deactivate(id: string, actorUserId: string | undefined, reason: string): Promise<void> {
      if (!actorUserId) throw new Error("Actor user ID required");
      const { error } = await client.rpc("mutate_admin_content_with_audit", {
        p_actor_user_id: actorUserId,
        p_entity: "board_member",
        p_operation: "deactivate",
        p_id: id,
        p_payload: { reason },
      });
      if (error) throw error;
    },

    async insertAuditLog(input: GovernanceAuditLog): Promise<void> {
      const { error } = await client.from("audit_log").insert(input);
      if (error) throw error;
    },
  };
}
