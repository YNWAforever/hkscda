import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

function readMigration(fileName: string) {
  return readFileSync(join(process.cwd(), "supabase", "migrations", fileName), "utf8");
}

function readMigrationBySuffix(suffix: string) {
  const fileName = readdirSync(join(process.cwd(), "supabase", "migrations")).find((entry) =>
    entry.endsWith(suffix),
  );
  if (!fileName) throw new Error(`Migration not found: ${suffix}`);
  return readMigration(fileName);
}

describe("supabase migration safety", () => {
  test("tightens adoption application PII access to staff and admins", () => {
    const sql = readMigration("20260626201620_secure_adoption_applications_policy.sql");

    expect(sql).toContain('drop policy if exists "admin only" on public.adoption_applications');
    expect(sql).not.toContain("auth.role() = 'authenticated'");
    expect(sql).toMatch(
      /on public\.adoption_applications for select[\s\S]*to authenticated[\s\S]*private\.has_admin_role\(array\['staff', 'admin'\]\)/,
    );
    expect(sql).toMatch(
      /on public\.adoption_applications for update[\s\S]*to authenticated[\s\S]*using \(private\.has_admin_role\(array\['staff', 'admin'\]\)\)[\s\S]*with check \(private\.has_admin_role\(array\['staff', 'admin'\]\)\)/,
    );
    expect(sql).toMatch(
      /on public\.adoption_applications for delete[\s\S]*to authenticated[\s\S]*private\.has_admin_role\(array\['staff', 'admin'\]\)/,
    );
  });

  test("adds webhook processing lease columns for idempotent retries", () => {
    const sql = readMigration("20260626202523_harden_webhook_event_processing.sql");

    expect(sql).toContain("add column if not exists processing_started_at timestamptz");
    expect(sql).toContain("add column if not exists processing_expires_at timestamptz");
    expect(sql).toContain("add column if not exists processing_owner text");
    expect(sql).toContain("webhook_event_processing_idx");
  });

  test("revokes unused anon/authenticated grants and drops the stale public insert policy", () => {
    const sql = readMigration("20260628130000_harden_role_grants_drop_stale_policy.sql");

    // The anon "public insert" hole on adoption_applications is closed.
    expect(sql).toContain('drop policy if exists "public insert" on public.adoption_applications');

    // anon loses direct access to every donation-flow table (service-role only now).
    for (const table of ["supporter", "consent", "supporter_role", "donation", "payment"]) {
      expect(sql).toContain(`revoke select, insert on public.${table} from anon`);
    }

    // The blanket authenticated grant is narrowed only where it is inert
    // (RLS-on tables with no authenticated policy), never blanket-revoked.
    expect(sql).toContain(
      "revoke select, insert, update, delete on public.recurring_mandate from authenticated",
    );
    expect(sql).toContain(
      "revoke select, insert, update, delete on public.receipt_sequence from authenticated",
    );
    expect(sql).not.toMatch(/revoke[\s\S]*on all tables in schema public from authenticated/i);
  });

  test("extends adoption followups into coordinator tasks", () => {
    const sql = readMigration("20260627110000_coordinator_task_timeline.sql");

    expect(sql).toContain("adopter_profile_id uuid");
    expect(sql).toContain("animal_id uuid");
    expect(sql).toContain("drop constraint if exists adoption_followup_adoption_case_id_not_null");
    expect(sql).toContain("adoption_followup_link_required");
    expect(sql).toContain("task_type text not null default 'followup'");
    expect(sql).toContain("priority text not null default 'normal'");
    expect(sql).toContain("contact_channel");
    expect(sql).toContain("adoption_followup_status_due_idx");
    expect(sql).toContain("adoption_followup_adopter_due_idx");
    expect(sql).toContain("adoption_followup_animal_due_idx");
    expect(sql).toContain("adoption_followup_overdue_idx");
  });

  test("issues receipts atomically via a public RPC backed by a unique index", () => {
    const sql = readMigration("20260628120000_harden_receipt_and_payment_lifecycle.sql");

    // RPC must be in public (reachable via service-role client.rpc), not private.
    expect(sql).toContain("create or replace function public.issue_receipt(");
    expect(sql).not.toContain("create or replace function private.issue_receipt(");
    expect(sql).toContain("grant execute on function public.issue_receipt");
    // One issued receipt per donation, allowing void-then-reissue.
    expect(sql).toMatch(
      /create unique index if not exists receipt_one_issued_per_donation[\s\S]*where status = 'issued'/,
    );
    // It still allocates the IRD number via the private helper.
    expect(sql).toContain("private.allocate_receipt_number(p_tax_year)");
  });

  test("revokes all residual anon grants on donor-PII tables", () => {
    const sql = readMigration("20260628140000_revoke_residual_anon_grants.sql");

    for (const table of ["supporter", "consent", "supporter_role", "donation", "payment"]) {
      expect(sql).toContain(`revoke all on public.${table} from anon`);
    }
  });

  test("revokes anon writes on animals (keeping read) and all on adoption_applications", () => {
    const sql = readMigration("20260628150000_revoke_residual_anon_write_grants.sql");

    // SELECT is intentionally omitted from the animals revoke (public site reads it).
    expect(sql).toContain(
      "revoke insert, update, delete, truncate, references, trigger on public.animals from anon",
    );
    expect(sql).toContain("revoke all on public.adoption_applications from anon");
  });

  test("validates the actor inside the coordinator workflow RPCs", () => {
    const sql = readMigration("20260628160000_validate_rpc_actor.sql");

    // Both RPCs gain an active staff/admin check keyed on auth_user_id.
    const guards = sql.match(
      /from public\.admin_user\s*\n\s*where auth_user_id = p_(actor_user_id|approved_by)\s*\n\s*and status = 'active'\s*\n\s*and role in \('staff', 'admin'\)/g,
    );
    expect(guards).toHaveLength(2);
    expect(sql).toContain("create or replace function public.change_adoption_case_status(");
    expect(sql).toContain("create or replace function public.finalize_successful_adoption(");
  });

  test("adds coordinator manual intake source tracking and RPC", () => {
    const sql = readMigration("20260628143000_coordinator_ops_workbench.sql");

    expect(sql).toContain("add column if not exists source text not null default 'public_form'");
    expect(sql).toContain("add column if not exists created_by uuid references auth.users(id)");
    expect(sql).toContain("adoption_case_source_created_idx");
    expect(sql).toContain("adoption_case_created_by_created_idx");
    expect(sql).toContain("audit_log_action_timestamp_idx");
    expect(sql).toContain("audit_log_detail_kind_timestamp_idx");
    expect(sql).toContain("create or replace function private.create_manual_adoption_case");
    expect(sql).toContain("p_identity jsonb");
    expect(sql).toContain("p_case jsonb");
    expect(sql).toContain("p_initial_task jsonb default null");
    expect(sql).toContain("set search_path = public, pg_temp");
    expect(sql).toContain("from public.admin_user admin");
    expect(sql).toContain("admin.auth_user_id = p_actor_user_id");
    expect(sql).toContain("admin.status = 'active'");
    expect(sql).toContain("admin.role in ('staff', 'admin')");
    expect(sql).not.toContain("private.has_admin_role(array['staff', 'admin'])");
    expect(sql).toContain("alter column email drop not null");
    expect(sql).toContain(
      "revoke all on function private.create_manual_adoption_case(uuid, jsonb, jsonb, jsonb) from public",
    );
    expect(sql).toContain(
      "grant execute on function private.create_manual_adoption_case(uuid, jsonb, jsonb, jsonb) to service_role",
    );
    expect(sql).toContain("join public.supporter supporter on supporter.id = adopter.supporter_id");
    expect(sql).toContain("and supporter.deleted_at is null");
    expect(sql).toContain("on conflict (supporter_id) do update");
    expect(sql).toContain("set supporter_id = excluded.supporter_id");
    expect(sql).toContain("coordinator_manual_intake.create");
    expect(sql).toContain("source = 'manual_intake'");
  });

  test("adds public adoption journey detail tables with private storage and explicit grants", () => {
    const sql = readMigrationBySuffix("_public_adoption_journey_phase_1.sql");

    for (const table of [
      "adoption_application_detail",
      "adoption_application_animal_preference",
      "adoption_application_visit_preference",
      "adoption_application_photo",
      "public_status_token",
      "adoption_intake_item",
    ]) {
      expect(sql).toContain(`create table if not exists public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(
        `grant select, insert, update, delete on public.${table} to service_role`,
      );
    }

    expect(sql).toContain("revoke all on public.public_status_token from anon, authenticated");
    expect(sql).toContain("token_hash text not null unique");
    expect(sql).toContain("adoption-application-photos");
    expect(sql).toContain("public = excluded.public");
    expect(sql).toContain("private.has_admin_role(array['staff', 'admin'])");
    expect(sql).toContain("adoption_intake_item_lane_due_idx");
  });

  test("adds admin access pending invites and metadata", () => {
    const sql = readMigration("20260701105726_admin_access_management.sql");

    expect(sql).toContain("drop constraint if exists admin_user_status_check");
    expect(sql).toContain("status in ('pending', 'active', 'disabled')");
    for (const column of [
      "invited_at timestamptz",
      "invite_sent_at timestamptz",
      "invite_accepted_at timestamptz",
      "last_invited_by uuid",
    ]) {
      expect(sql).toContain(`add column if not exists ${column}`);
    }
    expect(sql).toContain("admin_user_status_updated_idx");
    expect(sql).toContain("admin_user_invite_sent_idx");
  });

  test("adds sponsorship pledge tables with private proof storage and widens status token entity types", () => {
    const sql = readMigrationBySuffix("_sponsorship_pledge_phase_2.sql");

    for (const table of [
      "sponsorship_pledge",
      "sponsorship_preference",
      "sponsorship_payment_proof",
    ]) {
      expect(sql).toContain(`create table if not exists public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(
        `grant select, insert, update, delete on public.${table} to service_role`,
      );
      expect(sql).toContain(`revoke all on public.${table} from anon`);
    }

    expect(sql).not.toContain("reference text not null unique");
    expect(sql).toContain(
      "status text not null default 'pending_payment' check (status in ('pending_payment', 'provisional', 'active', 'needs_followup', 'cancelled'))",
    );
    expect(sql).toContain("drop constraint if exists public_status_token_entity_type_check");
    expect(sql).toContain(
      "add constraint public_status_token_entity_type_check check (entity_type in ('adoption_application', 'sponsorship_pledge'))",
    );
    expect(sql).toContain("sponsorship-payment-proof");
    expect(sql).toContain("private.has_admin_role(array['staff', 'admin'])");
  });

  test("relaxes proof uniqueness, adds review columns, and adds the 3 admin review RPCs", () => {
    const sql = readMigrationBySuffix("_sponsorship_pledge_admin_review.sql");

    expect(sql).toContain(
      "alter table public.sponsorship_payment_proof drop constraint if exists sponsorship_payment_proof_pledge_id_key",
    );
    expect(sql).toContain(
      "create index if not exists sponsorship_payment_proof_pledge_idx on public.sponsorship_payment_proof (pledge_id)",
    );
    expect(sql).toContain(
      "add column if not exists reviewed_by uuid references public.admin_user(id)",
    );
    expect(sql).toContain("add column if not exists reviewed_at timestamptz");
    expect(sql).toContain("add column if not exists review_note text");
    expect(sql).toContain(
      "add column if not exists source text not null default 'public' check (source in ('public', 'staff'))",
    );

    for (const fn of [
      "record_sponsorship_payment_proof",
      "review_sponsorship_payment_proof",
      "cancel_sponsorship_pledge",
    ]) {
      expect(sql).toContain(`create or replace function public.${fn}(`);
    }

    const guards = sql.match(
      /from public\.admin_user\s*\n\s*where auth_user_id = p_actor_user_id\s*\n\s*and status = 'active'\s*\n\s*and role in \('staff', 'admin'\)/g,
    );
    expect(guards).toHaveLength(3);

    expect(sql).toContain("v_pledge.status not in ('pending_payment', 'needs_followup')");
    expect(sql).toContain("'pending',\n    'staff'");
    expect(sql).toContain("v_pledge.status <> 'provisional'");
    expect(sql).toContain("v_proof.review_status <> 'pending'");
    expect(sql).toContain("v_new_review_status := 'approved';");
    expect(sql).toContain("v_new_pledge_status := 'active';");
    expect(sql).toContain("v_new_review_status := 'rejected';");
    expect(sql).toContain("v_new_pledge_status := 'needs_followup';");
    expect(sql).toMatch(
      /create or replace function public\.cancel_sponsorship_pledge\(\s*\n\s*p_pledge_id uuid,\s*\n\s*p_actor_user_id uuid,\s*\n\s*p_note text\s*\n\)/,
    );

    expect(sql).toMatch(
      /revoke all on function public\.record_sponsorship_payment_proof\([\s\S]*?\) from public;\ngrant execute on function public\.record_sponsorship_payment_proof\([\s\S]*?\) to service_role;/,
    );
    expect(sql).toMatch(
      /revoke all on function public\.review_sponsorship_payment_proof\([\s\S]*?\) from public;\ngrant execute on function public\.review_sponsorship_payment_proof\([\s\S]*?\) to service_role;/,
    );
    expect(sql).toMatch(
      /revoke all on function public\.cancel_sponsorship_pledge\([\s\S]*?\) from public;\ngrant execute on function public\.cancel_sponsorship_pledge\([\s\S]*?\) to service_role;/,
    );
  });
});
