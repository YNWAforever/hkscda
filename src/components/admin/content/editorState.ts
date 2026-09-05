export type EditorState = {
  version: number | undefined;
  revisionId: string | undefined;
  dirty: Record<string, boolean>;
  pending: boolean;
  conflict: boolean;
};
export function createEditorState(version?: number, revisionId?: string): EditorState {
  return { version, revisionId, dirty: {}, pending: false, conflict: false };
}
export type EditorEvent =
  | { type: "edit" | "saved"; panel: string }
  | { type: "conflict" }
  | { type: "reload"; version?: number; revisionId?: string };
export function editorTransition(state: EditorState, event: EditorEvent): EditorState {
  if (event.type === "reload") return createEditorState(event.version, event.revisionId);
  if (event.type === "conflict") return { ...state, conflict: true };
  return { ...state, dirty: { ...state.dirty, [event.panel]: event.type === "edit" } };
}
export function canPublish(state: EditorState) {
  return (
    state.version !== undefined &&
    Boolean(state.revisionId) &&
    !state.pending &&
    !state.conflict &&
    !Object.values(state.dirty).some(Boolean)
  );
}

export function canAcceptEditorReload(result: {
  isSuccess: boolean;
  isError: boolean;
  data?: unknown;
}) {
  return result.isSuccess && !result.isError && Boolean(result.data);
}
export function createEditorOperationGate() {
  let pending: Promise<void> | undefined;
  let operation: string | undefined;
  return (key: string, work: () => Promise<unknown>) => {
    if (pending)
      return key === operation
        ? pending
        : Promise.reject(new Error("另一個面板正在儲存，請稍後重試。"));
    operation = key;
    pending = Promise.resolve()
      .then(work)
      .then(() => undefined)
      .finally(() => {
        pending = undefined;
        operation = undefined;
      });
    return pending;
  };
}
