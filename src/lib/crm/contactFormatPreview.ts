export type ContactFormatSourceRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  updatedAt: string;
  deletedAt: string | null;
};

type ContactFields = Pick<ContactFormatSourceRow, "name" | "email" | "phone">;

export type ContactFormatPreviewItem = {
  entityId: string;
  status: "suggested" | "manual_review" | "unchanged" | "skipped";
  reasonCode: "format_suggestion" | "identity_review" | "missing_or_deleted" | null;
  before: ContactFields | null;
  after: ContactFields | null;
  updatedAt: string | null;
};

export type ContactFormatPreviewResponse = {
  filterHash: string;
  generatedAt: string;
  counts: Record<ContactFormatPreviewItem["status"], number>;
  items: ContactFormatPreviewItem[];
};

function foldWhitespace(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

/** Suggestions only: email identity and consent are never changed by this read model. */
export function buildContactFormatPreview(
  selectedIds: string[],
  rows: ContactFormatSourceRow[],
): ContactFormatPreviewItem[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return selectedIds.map((entityId) => {
    const row = byId.get(entityId);
    if (!row || row.deletedAt) {
      return {
        entityId,
        status: "skipped",
        reasonCode: "missing_or_deleted",
        before: null,
        after: null,
        updatedAt: null,
      };
    }
    const before = { name: row.name, email: row.email, phone: row.phone };
    const after = {
      name: foldWhitespace(row.name),
      email: row.email.trim().toLowerCase(),
      phone: row.phone === null ? null : foldWhitespace(row.phone),
    };
    const identityChanged = after.email !== before.email;
    const formatChanged =
      identityChanged || after.name !== before.name || after.phone !== before.phone;
    return {
      entityId,
      status: identityChanged ? "manual_review" : formatChanged ? "suggested" : "unchanged",
      reasonCode: identityChanged ? "identity_review" : formatChanged ? "format_suggestion" : null,
      before,
      after,
      updatedAt: row.updatedAt,
    };
  });
}
