import { expect, test } from "bun:test";
import { releaseManifest } from "./releaseManifest";

test("release manifest covers every new public table, RPC, and additive column after production ledger", () => {
  const tables = releaseManifest.filter((item) => item.kind === "table").map((item) => item.name);
  const functions = releaseManifest
    .filter((item) => item.kind === "function")
    .map((item) => item.name);
  const columns = releaseManifest
    .filter((item) => item.kind === "column")
    .map((item) => `${item.table}.${item.name}`);
  expect(tables).toHaveLength(11);
  expect(functions.length).toBeGreaterThanOrEqual(45);
  expect(columns).toContain("public_status_token.submission_fingerprint");
  expect(columns).toContain("dog_friendly_estates.version");
  expect(functions).toContain("mutate_dog_friendly_estate_with_audit");
  expect(columns).toContain("donation.idempotency_fingerprint");
  expect(columns).toContain("payment.checkout_attempted_at");
  for (const name of [
    "create_public_sponsorship_pledge",
    "issue_receipt_with_audit",
    "publish_animal_publication_once",
    "refund_provider_payment_atomically",
  ]) {
    expect(functions).toContain(name);
  }
  expect(releaseManifest.every((item) => item.schema === "public" && item.required)).toBe(true);
});
