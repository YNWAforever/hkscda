import { deactivateFaqEntrySchema, upsertFaqEntrySchema } from "./schemas";
import type { FaqRepository } from "./types";

/**
 * Hiding an entry is `faq.deactivate`, which requires a reason. The upsert RPC also writes
 * `is_active`, so without this check an edit could hide an entry with no reason recorded
 * (BUG-07). Saving an entry that is already inactive, or reactivating one, stays allowed.
 * This is an application-level guard; the RPC itself still accepts the flag.
 */
export class FaqDeactivationRequiresReasonError extends Error {
  constructor() {
    super("Use deactivate, with a reason, to hide a FAQ entry");
    this.name = "FaqDeactivationRequiresReasonError";
  }
}

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
      const { id: submittedId, ...rest } = parsed;
      // UUID validation preserves casing; Postgres returns canonical lowercase ids.
      const id = submittedId?.toLowerCase();
      if (id && !parsed.isActive) {
        const current = (await repo.listAdmin()).find((entry) => entry.id === id);
        if (current?.isActive) throw new FaqDeactivationRequiresReasonError();
      }
      return repo.upsert(id ? { id, ...rest } : rest, actorUserId);
    },

    async deactivate({
      actorUserId,
      id,
      reason,
    }: {
      actorUserId: string;
      id: string;
      reason: string;
    }) {
      const parsed = deactivateFaqEntrySchema.parse({ id, reason });
      await repo.deactivate(parsed.id, actorUserId, parsed.reason);
    },
  };
}
