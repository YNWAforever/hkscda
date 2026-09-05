import { expect, test } from "bun:test";
import {
  canAcceptEditorReload,
  createEditorOperationGate,
  createEditorState,
  editorTransition,
  canPublish,
} from "./editorState";
test("every nested dirty panel blocks publication", () => {
  for (const panel of ["content", "profile", "media", "update", "link"]) {
    const state = editorTransition(createEditorState(3, "saved"), { type: "edit", panel });
    expect(canPublish(state)).toBe(false);
  }
});
test("failed save and conflict preserve dirty panels and loaded version", () => {
  let state = editorTransition(createEditorState(3, "saved"), { type: "edit", panel: "content" });
  state = editorTransition(state, { type: "conflict" });
  expect(state.version).toBe(3);
  expect(state.dirty.content).toBe(true);
  expect(canPublish(state)).toBe(false);
});
test("saved panel leaves other local work dirty", () => {
  let state = editorTransition(createEditorState(3, "saved"), { type: "edit", panel: "profile" });
  state = editorTransition(state, { type: "edit", panel: "content" });
  state = editorTransition(state, { type: "saved", panel: "content" });
  expect(state.dirty.profile).toBe(true);
  expect(state.dirty.content).toBe(false);
});
test("pending operation blocks a duplicate publication", () => {
  expect(canPublish({ ...createEditorState(3, "saved"), pending: true })).toBe(false);
});
test("explicit reload discards dirty state and accepts selected server version", () => {
  const state = editorTransition(
    { ...createEditorState(3, "saved"), dirty: { content: true }, conflict: true },
    { type: "reload", version: 4, revisionId: "new" },
  );
  expect(state).toEqual(createEditorState(4, "new"));
});

test("duplicate clicks share a delayed operation and do not submit twice", async () => {
  const run = createEditorOperationGate();
  let calls = 0;
  let finish: () => void = () => undefined;
  const delayed = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const first = run("content", async () => {
    calls++;
    await delayed;
  });
  const second = run("content", async () => {
    calls++;
  });
  await Promise.resolve();
  expect(calls).toBe(1);
  finish();
  await Promise.all([first, second]);
  expect(calls).toBe(1);
});

test("different pending panel cannot be reported as saved", async () => {
  const run = createEditorOperationGate();
  let finish: () => void = () => undefined;
  const first = run(
    "content",
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await Promise.resolve();
  await expect(run("profile", async () => undefined)).rejects.toThrow("另一個");
  finish();
  await first;
});
test("failed reload with retained cache does not authorize discarding local work", () => {
  expect(canAcceptEditorReload({ isSuccess: false, isError: true, data: { content: {} } })).toBe(
    false,
  );
});
