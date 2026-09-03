import { describe, expect, test } from "bun:test";

import { safeFileName as serverSafeFileName } from "./signedUpload.server";
import { safeFileName as clientSafeFileName } from "../../components/admin/content/contentMediaUpload";

// A third safeFileName copy exists in
// src/routes/api/admin/sponsorships/pledges/-recordPaymentUpload.ts, but it
// now delegates directly to serverSafeFileName (bound to its own "proof"
// fallback) instead of duplicating the sanitization logic, so it can't drift
// independently and doesn't need its own entry in this table.
const FIXED_INPUTS = [
  "photo.jpg",
  "weird name!@#.jpg",
  "../../etc/passwd",
  "..",
  ".",
  "   ",
  "",
  "my receipt (1).png",
  "café ☕.png",
];

describe("safeFileName implementations stay in sync", () => {
  test.each(FIXED_INPUTS)("signedUpload.server and contentMediaUpload agree on %j", (input) => {
    expect(clientSafeFileName(input)).toBe(serverSafeFileName(input));
  });

  test("both default to a 'file' fallback for an empty/dot-only name", () => {
    expect(serverSafeFileName("..")).toBe("file");
    expect(clientSafeFileName("..")).toBe("file");
  });
});
