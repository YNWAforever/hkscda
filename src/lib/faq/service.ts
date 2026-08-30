import { deactivateFaqEntrySchema, upsertFaqEntrySchema } from "./schemas";
import type { FaqRepository } from "./types";

// upsert/deactivate don't write an audit_log row themselves — unlike a
// similar reference feature's service layer, they don't need to. Both
// underlying RPCs (upsert_faq_entry_with_audit, deactivate_faq_entry_with_audit)
// already insert their audit_log row atomically, inside the same SQL
// transaction as the mutation. Adding a second audit call here would
// double-log every action and reintroduce the exact non-atomic-audit
// bug this design was built to avoid.
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
