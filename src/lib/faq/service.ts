import { deactivateFaqEntrySchema, upsertFaqEntrySchema } from "./schemas";
import type { FaqRepository } from "./types";

export function createFaqService({ repo }: { repo: FaqRepository }) {
  return {
    listPublic() {
      return repo.listPublic();
    },

    listAdmin() {
      return repo.listAdmin();
    },

    async upsert({ actorUserId, input }: { actorUserId: string; input: unknown }) {
      const parsed = upsertFaqEntrySchema.parse(input);
      const { id, ...rest } = parsed;
      return repo.upsert(id ? { id, ...rest } : rest, actorUserId);
    },

    async deactivate({ actorUserId, id }: { actorUserId: string; id: string }) {
      const parsed = deactivateFaqEntrySchema.parse({ id });
      await repo.deactivate(parsed.id, actorUserId);
    },
  };
}
