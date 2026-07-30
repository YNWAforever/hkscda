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
  test("adds grouped visits and adoption information", () => {
    const sql = readMigration("20260718110000_adoption_information.sql");
    expect(sql).toContain("add column if not exists dog_time_windows text[]");
    expect(sql).toContain("add column if not exists cat_time_windows text[]");
    expect(sql).toContain("create table if not exists public.adoption_fees");
    expect(sql).toContain("create table if not exists public.dog_friendly_estates");
    expect(sql).toContain("Typical Species 一般品種");
    expect(sql).toContain("Big Cage Rental");
    expect(sql).toContain("revoke all on public.adoption_fees from anon, authenticated");
  });

  test("adds publish-safe public documents and bounded donation purpose notes", () => {
    const sql = readMigration("20260718100000_public_documents_and_donation_purpose.sql");
    expect(sql).toContain("create table if not exists public.document_assets");
    expect(sql).toContain("unique (slot_key, language)");
    expect(sql).toContain(
      "alter table public.donation add column if not exists custom_purpose text",
    );
    expect(sql).toContain("check (custom_purpose is null or char_length(custom_purpose) <= 200)");
    expect(sql).toContain("revoke all on public.document_assets from anon, authenticated");
    expect(sql).toContain("values ('site-documents', 'site-documents', true, 52428800");
    expect(sql).toContain("'donation_receipt_template_url'");
    expect(sql).toContain("foreach table_name in array array[");
    expect(sql).not.toMatch(/foreach table_name in array\s*\[/);
  });

  test("allows anonymous reads only for published public documents", () => {
    const sql = readMigration("20260719223000_public_document_read_policies.sql");

    for (const table of ["document_assets", "site_document_slots", "annual_reports"]) {
      expect(sql).toContain(`grant select on public.${table} to anon, authenticated`);
      expect(sql).toMatch(
        new RegExp(
          `on public\\.${table} for select[\\s\\S]*to anon, authenticated[\\s\\S]*using \\(is_published = true\\)`,
        ),
      );
    }
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all)/i);
  });
  test("adds controlled nullable donation acquisition attribution", () => {
    const sql = readMigration("20260716120000_contextual_donation_attribution.sql");

    for (const column of [
      "acquisition_source text",
      "acquisition_context text",
      "acquisition_placement text",
      "acquisition_trigger text",
    ]) {
      expect(sql).toContain(`add column if not exists ${column}`);
    }

    expect(sql).toContain("drop constraint if exists donation_acquisition_source_check");
    expect(sql).toContain("acquisition_source is null or acquisition_source = 'contextual-cta'");
    expect(sql).toContain("drop constraint if exists donation_acquisition_context_check");
    expect(sql).toContain(
      "acquisition_context is null or acquisition_context in ('general','story','animal','sponsor','transparency','community')",
    );
    expect(sql).toContain("drop constraint if exists donation_acquisition_placement_check");
    expect(sql).toContain(
      "acquisition_placement is null or acquisition_placement in ('mobile-bottom','desktop-left')",
    );
    expect(sql).toContain("drop constraint if exists donation_acquisition_trigger_check");
    expect(sql).toContain(
      "acquisition_trigger is null or acquisition_trigger in ('scroll','timer')",
    );
    expect(sql).not.toMatch(/\b(grant|revoke|policy|row level security|rls)\b/i);
  });

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

  test("adds volunteer activity tables with explicit grants, RLS, and status tokens", () => {
    const sql = readMigrationBySuffix("_volunteer_activity_management_v1.sql");

    for (const table of ["volunteer_activity", "volunteer_registration"]) {
      expect(sql).toContain(`create table if not exists public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(
        `grant select, insert, update, delete on public.${table} to service_role`,
      );
      expect(sql).toContain(`revoke all on public.${table} from authenticated`);
    }

    expect(sql).toContain("grant select on public.volunteer_activity to anon");
    expect(sql).toContain("revoke all on public.volunteer_registration from anon, authenticated");
    expect(sql).toContain("volunteer_activity_status_starts_idx");
    expect(sql).toContain("volunteer_registration_activity_status_idx");
    expect(sql).toContain("create or replace function public.create_volunteer_registration(");
    expect(sql).toContain(
      "perform pg_advisory_xact_lock(hashtextextended(p_activity_id::text, 0))",
    );
    expect(sql).toContain("for update");
    expect(sql).toContain("and status = 'approved'");
    expect(sql).toContain("grant execute on function public.create_volunteer_registration");
    expect(sql).toContain("revoke all on function public.create_volunteer_registration");
    expect(sql).toContain(
      "status text not null default 'pending' check (status in ('pending', 'approved', 'waitlisted', 'rejected', 'cancelled'))",
    );
    expect(sql).toContain(
      "attendance_status text not null default 'not_marked' check (attendance_status in ('not_marked', 'attended', 'completed', 'no_show'))",
    );
    expect(sql).toContain(
      "add constraint public_status_token_entity_type_check check (entity_type in ('adoption_application', 'sponsorship_pledge', 'volunteer_registration'))",
    );
    expect(sql).toContain("private.has_admin_role(array['staff', 'admin'])");
  });

  test("hardens document mutations with database invariants and atomic audit RPCs", () => {
    const sql = readMigrationBySuffix("document_admin_mutation_hardening.sql");

    expect(sql).toContain("create or replace function private.enforce_annual_report_asset");
    expect(sql).toContain("create constraint trigger enforce_annual_report_asset");
    expect(sql).toContain("create or replace function public.mutate_document_asset_with_audit");
    expect(sql).toContain("create or replace function public.mutate_annual_report_with_audit");
    expect(sql).toContain("insert into public.audit_log");
    expect(sql.match(/security invoker/g)).toHaveLength(2);
    expect(sql).toContain("for update");
    expect(sql).toContain("revoke all on function public.mutate_document_asset_with_audit");
    expect(sql).toContain("grant execute on function public.mutate_document_asset_with_audit");
    expect(sql).toContain("grant insert on public.audit_log to service_role");
  });
  test("adds group enquiries and publish-safe knowledge posts", () => {
    const sql = readMigration("20260718120000_group_enquiries_and_knowledge.sql");

    expect(sql).toContain("create table if not exists public.group_enquiries");
    expect(sql).toContain("notification_status");
    expect(sql).toContain("create table if not exists public.knowledge_posts");
    expect(sql).toContain("num_nonnulls(external_url, document_asset_id) = 1");
    expect(sql).toContain("https://www.hk01.com/article/288651");
    expect(sql).toContain(
      "https://www.10life.com/zh-HK/blog/Pet-Owners-Alert-Comparing-Pet-Insurance-Coverage",
    );
    expect(sql).toContain("revoke all on public.group_enquiries from anon, authenticated");
  });
  test("seeds knowledge guide posts from existing document slots without duplicating assets", () => {
    const sql = readMigration("20260718121000_seed_knowledge_guides.sql");

    expect(sql).toContain("post_adoption_guide");
    expect(sql).toContain("language = 'zh-HK'");
    expect(sql).toContain("language = 'en'");
    expect(sql).toContain("insert into public.knowledge_posts");
    expect(sql).toContain("select document_asset_id");
    expect(sql).toContain("from public.site_document_slots");
    expect(sql).toContain("on conflict (document_asset_id) where document_asset_id is not null do update");
    expect(sql).toContain("raise exception");
    expect(sql).not.toContain("insert into public.document_assets");
    expect(sql).not.toContain("storage.objects");
  });

  test("adds bilingual adoption guide releases with atomic admin publication", () => {
    const sql = readMigration("20260731120000_adoption_guide_release_cms.sql");

    expect(sql).toContain("create table if not exists public.adoption_guide_releases");
    expect(sql).toContain("state in ('draft', 'in_review', 'published', 'archived')");
    expect(sql).toContain("species in ('cat', 'dog', 'general')");
    expect(sql).toContain("version integer not null default 1");
    expect(sql).toContain("create table if not exists public.adoption_guide_publish_requests");
    expect(sql).toContain(
      "alter table public.knowledge_posts add column if not exists zh_hk_document_asset_id",
    );
    expect(sql).toContain(
      "alter table public.knowledge_posts add column if not exists en_document_asset_id",
    );
    expect(sql).toContain(
      "create or replace function public.mutate_adoption_guide_release_with_audit",
    );
    expect(sql).toContain("create or replace function public.publish_adoption_guide_release");
    expect(sql).toContain("for update");
    expect(sql).toContain("role = 'admin'");
    expect(sql).toContain("insert into public.audit_log");
    expect(sql).toContain(
      "revoke all on public.adoption_guide_releases from anon, authenticated",
    );
    expect(sql).toContain("grant execute on function public.publish_adoption_guide_release");
    expect(sql).toContain("set search_path = public, pg_temp");
    expect(sql).toContain("grant usage on schema private to service_role");
    expect(sql).toMatch(
      /p_operation = 'withdraw'[\s\S]*actor\.role <> 'admin'[\s\S]*current_release\.submitted_by is distinct from actor\.id[\s\S]*update public\.adoption_guide_releases/,
    );
    expect(sql.match(/where slots\.slot_key = 'post_adoption_guide'/g)).toHaveLength(2);
    expect(sql).toMatch(
      /if previous_release\.id is null then[\s\S]*where slots\.slot_key = 'post_adoption_guide'/,
    );
    expect(sql).toMatch(
      /document_asset_id in \(\s*old_zh_hk_asset_id,\s*old_en_asset_id,\s*legacy_zh_hk_asset_id,\s*legacy_en_asset_id\s*\)/,
    );
    expect(sql.match(/'site_document_slot\.upsert'/g)).toHaveLength(2);
    expect(sql).toContain("target_slot_key || ':zh-HK'");
    expect(sql).toContain("target_slot_key || ':en'");
  });

});
