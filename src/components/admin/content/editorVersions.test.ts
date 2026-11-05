import { expect, test } from "bun:test";
import {
  applyOwnSave,
  createEditorVersions,
  expectedVersionFor,
  markPanelClean,
  markPanelDirty,
  observeServerVersion,
  savedVersionFrom,
} from "./editorVersions";

test("BUG-67: a dirty panel keeps the version it started from until something moves it", () => {
  let versions = markPanelDirty(createEditorVersions(5), "content");
  versions = observeServerVersion(versions, 6);
  expect(expectedVersionFor(versions, "content")).toBe(5);
  // A clean panel saves against the latest version the editor knows.
  expect(expectedVersionFor(versions, "metadata")).toBe(6);
});

test("BUG-67: this editor's own save moves the other dirty panels that shared its base", () => {
  // At version 5, Basic content is typed in, then Publication eligibility is saved (→ 6).
  let versions = markPanelDirty(createEditorVersions(5), "content");
  versions = markPanelDirty(versions, "metadata");
  const sent = expectedVersionFor(versions, "metadata");
  expect(sent).toBe(5);
  versions = applyOwnSave(versions, sent, 6);
  versions = markPanelClean(versions, "metadata");
  // Basic content now saves against 6, which is what the server holds.
  expect(expectedVersionFor(versions, "content")).toBe(6);
  expect(expectedVersionFor(versions, "metadata")).toBe(6);
});

test("BUG-67: a change by anyone else still conflicts", () => {
  // Basic content started at 5. Someone else saved 6; the editor reloaded the read and the
  // profile panel was edited at 6 and saved (→ 7). Basic content never saw 6, so it stays at 5
  // and its save is refused as stale.
  let versions = markPanelDirty(createEditorVersions(5), "content");
  versions = observeServerVersion(versions, 6);
  versions = markPanelDirty(versions, "profile");
  versions = applyOwnSave(versions, expectedVersionFor(versions, "profile"), 7);
  versions = markPanelClean(versions, "profile");
  expect(expectedVersionFor(versions, "content")).toBe(5);
  expect(expectedVersionFor(versions, "profile")).toBe(7);
});

test("BUG-67: the latest version is not moved back by a read older than this editor's save", () => {
  let versions = applyOwnSave(createEditorVersions(5), 5, 6);
  // The cached read still says 5 until the refetch lands.
  versions = observeServerVersion(versions, 5);
  versions = markPanelDirty(versions, "link");
  expect(expectedVersionFor(versions, "link")).toBe(6);
});

test("BUG-67: marking a dirty panel dirty again keeps its first base", () => {
  let versions = markPanelDirty(createEditorVersions(5), "content");
  versions = observeServerVersion(versions, 8);
  versions = markPanelDirty(versions, "content");
  expect(expectedVersionFor(versions, "content")).toBe(5);
});

test("BUG-67: a save sent without a known version moves nothing", () => {
  const versions = markPanelDirty(createEditorVersions(undefined), "content");
  expect(applyOwnSave(versions, undefined, 3)).toEqual(versions);
});

test("BUG-67: the saved version is read from every save response shape", () => {
  // updateContent and upsertStoryProfile return the whole content item.
  expect(savedVersionFrom({ content: { version: 9 } }, 8)).toBe(9);
  // Media, link and publication-metadata saves return the lifecycle result.
  expect(savedVersionFrom({ id: "media", version: 9 }, 8)).toBe(9);
  // A story update returns only its id: every lifecycle mutation moves the version by one.
  expect(savedVersionFrom({ id: "update" }, 8)).toBe(9);
  expect(savedVersionFrom(undefined, 8)).toBe(9);
  expect(savedVersionFrom({ id: "update" }, undefined)).toBeUndefined();
});
