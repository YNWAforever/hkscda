// src/lib/governance/service.ts
import { boardMemberInputSchema, deactivateBoardMemberSchema } from "./schemas";
import type { GovernanceAuditLog, GovernanceRepository } from "./types";

export function createGovernanceService({
  repo,
  now = () => new Date(),
}: {
  repo: GovernanceRepository;
  now?: () => Date;
}) {
  async function audit(input: Omit<GovernanceAuditLog, "timestamp">) {
    await repo.insertAuditLog({ ...input, timestamp: now().toISOString() });
  }

  return {
    listPublicRoster() {
      return repo.listPublicRoster();
    },

    listAdmin() {
      return repo.listAdmin();
    },

    async upsert({ actorUserId, input }: { actorUserId: string; input: unknown }) {
      const parsed = boardMemberInputSchema.parse(input);
      const { id, ...rest } = parsed;
      const member = await repo.upsert(id ? { id, ...rest } : rest, actorUserId);
      await audit({
        actor_user_id: actorUserId,
        action: parsed.id ? "board_member.update" : "board_member.create",
        entity: "board_member",
        entity_id: member.id,
        detail: parsed,
      });
      return member;
    },

    async deactivate({ actorUserId, id }: { actorUserId: string; id: string }) {
      const parsed = deactivateBoardMemberSchema.parse({ id });
      await repo.deactivate(parsed.id);
      await audit({
        actor_user_id: actorUserId,
        action: "board_member.deactivate",
        entity: "board_member",
        entity_id: parsed.id,
        detail: {},
      });
    },
  };
}
