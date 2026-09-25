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

export function createSupabaseGovernanceRepository(client: SupabaseClient): GovernanceRepository {
  return {
    usesAtomicAudit: true,
    async listPublicRoster(): Promise<PublicBoardRoster> {
      const { data, error } = await client
        .from("board_member")
        .select(ROW_COLUMNS)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;

      const members = ((data ?? []) as unknown[])
        .map(mapRow)
        .filter((row): row is BoardMember => row !== null);

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
      const { data, error } = await client
        .from("board_member")
        .select(ROW_COLUMNS)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown[])
        .map(mapRow)
        .filter((row): row is BoardMember => row !== null);
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

    async deactivate(id: string, actorUserId?: string): Promise<void> {
      if (!actorUserId) throw new Error("Actor user ID required");
      const { error } = await client.rpc("mutate_admin_content_with_audit", {
        p_actor_user_id: actorUserId,
        p_entity: "board_member",
        p_operation: "deactivate",
        p_id: id,
        p_payload: {},
      });
      if (error) throw error;
    },

    async insertAuditLog(input: GovernanceAuditLog): Promise<void> {
      const { error } = await client.from("audit_log").insert(input);
      if (error) throw error;
    },
  };
}
