/**
 * A publication command result the route must translate into an HTTP failure, or `null` when
 * the result is a success (or a kind the generic tail already handles).
 *
 * The RPC returns bare `{"kind":"conflict"}` when the expected draft revision is stale. The
 * route translated that for `publish` into an actionable `stale_preview`, but for `save` it
 * fell through with the bare conflict body: the editor saw "save failed", never refreshed its
 * revision and every retry re-sent the same stale revision (CMS-01). The save branch now
 * answers `stale_draft`, which the editor maps to a re-read of the draft.
 */
export type PublicationCommandFailure = { status: number; body: unknown };

export function publicationCommandFailure(
  commandKind: unknown,
  data: ({ kind?: unknown } & Record<string, unknown>) | null | undefined,
): PublicationCommandFailure | null {
  const requested = typeof commandKind === "string" ? commandKind : "";
  const resultKind = typeof data?.kind === "string" ? data.kind : "";

  if (requested === "publish" && (resultKind === "conflict" || resultKind === "not_found")) {
    return {
      status: resultKind === "conflict" ? 409 : 404,
      body: { error: { code: "stale_preview", message: "草稿已變更，請重新預覽。" } },
    };
  }

  if (requested === "save" && resultKind === "conflict") {
    return {
      status: 409,
      body: {
        error: {
          code: "stale_draft",
          message: "草稿已在其他地方更新，已重新載入；你的修改仍然保留，請再次儲存。",
        },
      },
    };
  }

  return null;
}
