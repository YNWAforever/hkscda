/**
 * The content versions the editor's panels save against (BUG-67).
 *
 * A dirty panel keeps the version it started from (`bases`), so a change someone else saved
 * meanwhile is refused as stale instead of being overwritten. When one of this editor's own
 * saves succeeds, the other dirty panels that started from the version that save sent are moved
 * to the version the server returned: nothing they did not see happened in between, so their
 * later save must go through. A panel whose base is older than the version the save sent has
 * missed someone else's change and keeps its base, so it still conflicts.
 *
 * Every function is pure: it returns a new state and never changes the one it was given.
 */
export type EditorVersions = {
  /** The newest version this editor knows the server holds. */
  latest: number | undefined;
  /** Each dirty panel's base version. */
  bases: Readonly<Record<string, number | undefined>>;
};

export function createEditorVersions(latest: number | undefined): EditorVersions {
  return { latest, bases: {} };
}

/**
 * A version read from the server. The latest version only moves forward: a cached read that is
 * older than one of this editor's own saves (the refetch has not landed yet) does not move it back.
 */
export function observeServerVersion(
  state: EditorVersions,
  version: number | undefined,
): EditorVersions {
  if (version === undefined) return state;
  if (state.latest !== undefined && state.latest >= version) return state;
  return { ...state, latest: version };
}

/** A panel's first edit records the version it started from; later edits keep it. */
export function markPanelDirty(state: EditorVersions, panel: string): EditorVersions {
  if (Object.hasOwn(state.bases, panel)) return state;
  return { ...state, bases: { ...state.bases, [panel]: state.latest } };
}

export function markPanelClean(state: EditorVersions, panel: string): EditorVersions {
  if (!Object.hasOwn(state.bases, panel)) return state;
  const bases = { ...state.bases };
  delete bases[panel];
  return { ...state, bases };
}

/** The version a panel's save sends: its base when it is dirty, the latest version otherwise. */
export function expectedVersionFor(state: EditorVersions, panel: string): number | undefined {
  return Object.hasOwn(state.bases, panel) ? state.bases[panel] : state.latest;
}

/**
 * The expected version a lifecycle action sends (CMS-05): publish, archive and restore are not
 * panel saves, so they take the newest version this editor knows — the fence its own saves advance
 * synchronously — instead of the query cache's row, which is still one save behind until the
 * detail refetch lands. Falling back to the cached row only covers the first render, when the
 * fence has not seen a version yet.
 */
export function lifecycleExpectedVersion(
  state: EditorVersions,
  cachedVersion: number | undefined,
): number | undefined {
  return state.latest ?? cachedVersion;
}

/**
 * One of this editor's own saves succeeded: it sent `sent` and the server now holds `saved`.
 * Every dirty panel whose base is `sent` moves to `saved`; any other base is left as it is.
 */
export function applyOwnSave(
  state: EditorVersions,
  sent: number | undefined,
  saved: number | undefined,
): EditorVersions {
  if (sent === undefined || saved === undefined) return state;
  const bases = Object.fromEntries(
    Object.entries(state.bases).map(([panel, base]) => [panel, base === sent ? saved : base]),
  );
  return observeServerVersion({ ...state, bases }, saved);
}

function versionField(value: unknown): number | undefined {
  if (!value || typeof value !== "object" || !("version" in value)) return undefined;
  const { version } = value as { version: unknown };
  return typeof version === "number" && Number.isInteger(version) ? version : undefined;
}

/**
 * The version a successful save left on the server, from its response: `{ content: { version } }`
 * for the content and profile saves, `{ version }` for the lifecycle results (media, link,
 * publication metadata). A response without one (a story update returns only its id) is
 * `sent + 1`: every content lifecycle mutation moves the version by exactly one.
 */
export function savedVersionFrom(response: unknown, sent: number | undefined): number | undefined {
  const content =
    response && typeof response === "object" && "content" in response
      ? versionField((response as { content: unknown }).content)
      : undefined;
  const saved = content ?? versionField(response);
  if (saved !== undefined) return saved;
  return sent === undefined ? undefined : sent + 1;
}
