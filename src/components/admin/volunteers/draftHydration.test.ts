import { expect, test } from "bun:test";
import { canHydrateVolunteerDraft } from "./draftHydration";
test("same-identity dirty or older background drafts never replace local input", () => {
  expect(
    canHydrateVolunteerDraft({
      dirty: true,
      identityChanged: false,
      loadedRevision: 1,
      incomingRevision: 2,
    }),
  ).toBe(false);
  expect(
    canHydrateVolunteerDraft({
      dirty: false,
      identityChanged: false,
      loadedRevision: 2,
      incomingRevision: 1,
    }),
  ).toBe(false);
  expect(
    canHydrateVolunteerDraft({
      dirty: false,
      identityChanged: false,
      loadedRevision: 1,
      incomingRevision: 2,
    }),
  ).toBe(true);
  expect(
    canHydrateVolunteerDraft({
      dirty: false,
      identityChanged: true,
      loadedRevision: 5,
      incomingRevision: 1,
    }),
  ).toBe(true);
});
