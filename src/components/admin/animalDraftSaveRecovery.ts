import { AdminApiError } from "../../lib/admin/session";

/**
 * Whether a draft save failed only because another editor moved the draft revision (CMS-01).
 * The publication route answers that case with `409 {error:{code:"stale_draft"}}`.
 */
export function isStaleDraftSave(error: unknown): boolean {
  return error instanceof AdminApiError && error.status === 409 && error.code === "stale_draft";
}

export type AnimalDraftSaveOutcome =
  | { status: "saved"; revision: number }
  | { status: "rebased"; revision: number }
  | { status: "failed" };

/**
 * Saves the animal draft, recovering once from a stale revision.
 *
 * A stale save is a dead end on its own: the editor keeps its `draftRevision`, every retry
 * re-sends the same revision and fails identically, and only a reload (which loses the typed
 * work) recovers. So on `409 stale_draft` this re-reads the draft, adopts the stored revision
 * and keeps the local edits, and the editor tells staff the draft was refreshed and can be
 * saved again (CMS-01; the same shape as `copyVersion`, AnimalForm.tsx).
 */
export async function saveAnimalDraft(options: {
  save: () => Promise<{ revision: number }>;
  readDraft: () => Promise<{ draft: { revision: number } | null }>;
}): Promise<AnimalDraftSaveOutcome> {
  try {
    const saved = await options.save();
    return { status: "saved", revision: saved.revision };
  } catch (error) {
    if (!isStaleDraftSave(error)) return { status: "failed" };
  }

  try {
    const { draft } = await options.readDraft();
    return typeof draft?.revision === "number"
      ? { status: "rebased", revision: draft.revision }
      : { status: "failed" };
  } catch {
    // The re-read is the only way to recover from the stale revision. If it fails too, the
    // editor shows the ordinary save error and the next save retries the read.
    return { status: "failed" };
  }
}
