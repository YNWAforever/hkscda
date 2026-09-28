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
  expect(tables).toHaveLength(28);
  expect(functions.length).toBeGreaterThanOrEqual(83);
  expect(columns).toContain("public_status_token.submission_fingerprint");
  expect(columns).toContain("donation.idempotency_fingerprint");
  expect(columns).toContain("payment.checkout_attempted_at");
  expect(columns).toContain("adoption_case.bulk_row_version");
  expect(columns).toContain("supporter.edit_version");
  expect(columns).toContain("supporter.crm_assignee_user_id");
  for (const name of [
    "create_public_sponsorship_pledge",
    "issue_receipt_with_audit",
    "publish_animal_publication_once",
    "refund_provider_payment_atomically",
  ]) {
    expect(functions).toContain(name);
  }
  for (const name of [
    "set_content_publication_metadata",
    "mark_repaired_animal_publication_media",
    "mark_repaired_content_public_asset",
    "fail_animal_publication_media_copy",
    "fail_content_public_asset_copy",
    "get_media_repair_backlog",
    "retry_failed_media_repair",
    "public_animal_listing_page",
    "set_supporter_marketing_email",
    "get_crm_tag_bulk_operation",
    "create_crm_tag_bulk_preview",
    "apply_crm_tag_bulk_item",
    "get_crm_assignment_bulk_operation",
    "create_crm_assignment_bulk_preview",
    "apply_crm_assignment_bulk_item",
    "list_crm_assignment_assignees",
    "get_volunteer_review_bulk_operation",
    "create_volunteer_review_bulk_preview",
    "apply_volunteer_review_bulk_item",
    "get_adoption_assignment_bulk_operation",
    "create_adoption_assignment_bulk_preview",
    "apply_adoption_assignment_bulk_item",
    "get_animal_review_bulk_operation",
    "create_animal_review_bulk_preview",
    "apply_animal_review_bulk_item",
    "get_cms_review_bulk_operation",
    "create_cms_review_bulk_preview",
    "apply_cms_review_bulk_item",
    "reconcile_manual_payment_atomic",
    "get_finance_bank_match_operation",
    "create_finance_bank_match_preview",
    "apply_finance_bank_match_item",
    "editorial_quality_queue",
    "get_sponsorship_followup_bulk_operation",
    "create_sponsorship_followup_bulk_preview",
    "apply_sponsorship_followup_bulk_item",
  ]) {
    expect(functions).toContain(name);
  }
  for (const column of [
    "animals.public_age_band",
    "content_item.content_class",
    "content_item.source_reference",
    "content_item.content_owner",
    "content_item.effective_from",
    "content_item.effective_until",
    "content_public_asset.repair_status",
    "content_public_asset.repair_attempts",
    "content_public_asset.next_retry_at",
    "content_public_asset.last_error_code",
    "content_public_asset.lease_token",
  ]) {
    expect(columns).toContain(column);
  }
  expect(tables).toContain("crm_assignment_bulk_operation");
  expect(tables).toContain("crm_assignment_bulk_item");
  expect(tables).toContain("sponsorship_followup_bulk_operation");
  expect(tables).toContain("sponsorship_followup_bulk_item");
  expect(tables).toContain("finance_bank_match_operation");
  expect(tables).toContain("finance_bank_match_item");
  const bankItem = releaseManifest.find(
    (item) => item.kind === "table" && item.name === "finance_bank_match_item",
  );
  expect(bankItem && bankItem.kind === "table" ? bankItem.columns?.payment_hint : null).toBe(
    "text",
  );
  expect(releaseManifest.every((item) => item.schema === "public" && item.required)).toBe(true);
});
