import { expect, test } from "bun:test";
import { submissionFingerprint } from "./submissionFingerprint.server";

test("submission fingerprint ignores one-use challenges and object key order", () => {
  const original = submissionFingerprint(
    "adoption_application",
    {
      contact: { name: "A", email: "a@example.test" },
      turnstileToken: "one",
    },
    [{ storagePath: "id/home.jpg" }],
    "secret-token",
  );
  const retry = submissionFingerprint(
    "adoption_application",
    {
      turnstileToken: "two",
      contact: { email: "a@example.test", name: "A" },
    },
    [{ storagePath: "id/home.jpg" }],
    "secret-token",
  );
  expect(retry).toBe(original);
  expect(
    submissionFingerprint(
      "adoption_application",
      { contact: { name: "A", email: "a@example.test" } },
      [{ storagePath: "id/home.jpg" }],
      "other-token",
    ),
  ).not.toBe(original);
  expect(
    submissionFingerprint(
      "adoption_application",
      {
        contact: { name: "B", email: "a@example.test" },
      },
      [{ storagePath: "id/home.jpg" }],
      "secret-token",
    ),
  ).not.toBe(original);
  expect(
    submissionFingerprint(
      "adoption_application",
      {
        contact: { name: "A", email: "a@example.test" },
      },
      [{ storagePath: "id/other.jpg" }],
      "secret-token",
    ),
  ).not.toBe(original);
});
