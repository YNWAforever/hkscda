import { adminKnowledgeQuerySchema, deleteKnowledgePostSchema, knowledgePostInputSchema } from "./schemas";
import type { KnowledgeAuditLog, KnowledgeRepository } from "./types";

export function createKnowledgeService({ repo, now = () => new Date() }: { repo: KnowledgeRepository; now?: () => Date }) {
  async function audit(input: Omit<KnowledgeAuditLog, "timestamp">) {
    await repo.insertAuditLog({ ...input, timestamp: now().toISOString() });
  }

  return {
    listPublished() {
      return repo.listPublished();
    },

    listAdmin(raw: unknown) {
      return repo.listAdmin(adminKnowledgeQuerySchema.parse(raw));
    },

    async upsert({ actorUserId, input }: { actorUserId: string; input: unknown }) {
      const parsed = knowledgePostInputSchema.parse(input);
      const { id, ...rest } = parsed;
      const post = await repo.upsert(id ? { id, ...rest } : rest);
      await audit({
        actor_user_id: actorUserId,
        action: parsed.id ? "knowledge_post.update" : "knowledge_post.create",
        entity: "knowledge_post",
        entity_id: post.id,
        detail: parsed,
      });
      return post;
    },

    async remove({ actorUserId, id }: { actorUserId: string; id: string }) {
      const parsed = deleteKnowledgePostSchema.parse({ id });
      await repo.remove(parsed.id);
      await audit({
        actor_user_id: actorUserId,
        action: "knowledge_post.delete",
        entity: "knowledge_post",
        entity_id: parsed.id,
        detail: {},
      });
    },
  };
}
