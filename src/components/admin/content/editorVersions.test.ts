import { expect, test } from "bun:test";
import {
  applyOwnSave,
  createEditorVersions,
  expectedVersionFor,
  lifecycleExpectedVersion,
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

test("CMS-05: a save followed by an immediate publish sends the saved version, not the cached row", () => {
  // The editor opened at 5 and saved Publication eligibility; the response moved the fence to 6,
  // but the detail query cache still holds version 5 until its refetch lands.
  const cachedContentVersion = 5;
  let versions = markPanelDirty(createEditorVersions(cachedContentVersion), "metadata");
  const sent = expectedVersionFor(versions, "metadata");
  versions = applyOwnSave(versions, sent, savedVersionFrom({ version: 6 }, sent));
  versions = markPanelClean(versions, "metadata");

  // Publish (and likewise archive/restore) sends the fenced version, so it is not refused as a
  // conflict the editor caused itself.
  expect(lifecycleExpectedVersion(versions, cachedContentVersion)).toBe(6);
  expect(lifecycleExpectedVersion(versions, undefined)).toBe(6);
  // Once the refetch lands, the cache and the fence agree.
  expect(lifecycleExpectedVersion(versions, 6)).toBe(6);
});

test("CMS-05: a save response that does not move the version keeps the cached one", () => {
  const versions = createEditorVersions(5);
  expect(lifecycleExpectedVersion(versions, 5)).toBe(5);
});

test("CMS-05: without a known fenced version the cached row is still used", () => {
  expect(lifecycleExpectedVersion(createEditorVersions(undefined), 4)).toBe(4);
  expect(lifecycleExpectedVersion(createEditorVersions(undefined), undefined)).toBeUndefined();
});
