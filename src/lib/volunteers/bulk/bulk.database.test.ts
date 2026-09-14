import { SQL } from "bun";
import { expect, test } from "bun:test";
import { initialPolicyCatalogue } from "../policy/catalogue";
import { addHkDays, hkDate } from "./service";
const url = process.env.VOLUNTEER_TEST_DATABASE_URL;
if (
  url &&
  url !== "postgresql://postgres:postgres@127.0.0.1:56322/postgres" &&
  url !== "postgres://postgres:postgres@127.0.0.1:56322/postgres"
)
  throw new Error("Bulk acceptance requires dedicated isolated56322");
const enabled = Boolean(url) && process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES === "1";
type Item = {
  id?: string;
  state: string;
  preview: { kind: string; reason?: string };
  result?: { activity_id: string };
};
type Op = {
  notifications: { id: string; follow_up: string; provider_message_id: string | null }[];
  id: string;
  selection: { id: string }[];
  groups: { index: number; date: string; state: string; reason?: string; items: Item[] }[];
};
type Result = {
  kind: string;
  reason?: string;
  history_total: number;
  history: { id: string }[];
  operation: Op;
  preview_id: string;
  activity_id: string;
  registration_id: string;
  total: number;
  activities: { id: string }[];
};
test.skipIf(!enabled)(
  "bulk exact snapshots, four-week generation, retries, stale and shared-day groups preserve commitments",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const actor = crypto.randomUUID();
    const key = "bulk-" + actor.replaceAll("-", "");
    const day = addHkDays(hkDate(), 40);
    const commandTimings: { action: unknown; operation: unknown; duration_ms: number }[] = [];
    const cmd = async (command: unknown) => {
      const started = performance.now();
      const rows =
        await db`select public.volunteer_bulk_command(${actor}::uuid,${JSON.stringify(command)}::jsonb) result`;
      const input = command as Record<string, unknown>;
      commandTimings.push({
        action: input.action,
        operation: input.operation ?? null,
        duration_ms: performance.now() - started,
      });
      return rows[0].result as Result;
    };
    const policy = (command: unknown) =>
      db`select public.volunteer_policy_command(${actor}::uuid,${JSON.stringify(command)}::jsonb) result`.then(
        (r) => r[0].result as Result,
      );
    const select = async (ids: string[]) =>
      cmd({
        action: "select",
        mode: "page",
        ids,
        filter: { sort: "asc" },
        idempotency_key: crypto.randomUUID(),
      });
    try {
      await db`insert into auth.users(id,email,email_confirmed_at,created_at,updated_at)values(${actor}::uuid,${actor + "@example.invalid"},now(),now(),now())`;
      await db`insert into public.admin_user(auth_user_id,email,role,status)values(${actor}::uuid,${actor + "@example.invalid"},'admin','active')`;
      const body = structuredClone(initialPolicyCatalogue[0]);
      body.template_key = key;
      body.name = "Synthetic bulk same-title";
      body.booking.auto_approve = true;
      body.source = "Synthetic isolated operations-release acceptance";
      body.terms.version_id = "c9c6278a-c73a-4f0c-9b93-6e2b4089141a";
      expect(
        (await policy({ action: "save", template_key: key, expected_revision: 0, body })).kind,
      ).toBe("saved");
      const pp = await policy({
        action: "preview",
        template_key: key,
        expected_revision: 1,
        effective_from: day + "T00:00:00+08:00",
        effective_until: null,
        activity_ids: [],
      });
      expect(
        (
          await policy({
            action: "publish",
            preview_id: pp.preview_id,
            idempotency_key: crypto.randomUUID(),
            reason: "Synthetic local acceptance",
          })
        ).kind,
      ).toBe("published");
      const previewRequest = {
        action: "preview",
        operation: "generate",
        input: {
          template_keys: [key],
          dates: Array.from({ length: 28 }, (_, n) => addHkDays(day, n)),
        },
        idempotency_key: crypto.randomUUID(),
      };
      const preview = await cmd(previewRequest);
      expect(preview.operation.groups).toHaveLength(28);
      expect(preview.operation.groups.every((g) => g.items[0].state === "ready")).toBe(true);
      expect((await cmd(previewRequest)).operation.id).toBe(preview.operation.id);
      expect(
        (await cmd({ ...previewRequest, input: { ...previewRequest.input, dates: [day] } })).reason,
      ).toBe("idempotency_payload_changed");
      const ids: string[] = [];
      for (const group of preview.operation.groups) {
        const result = await cmd({
          action: "apply",
          operation_id: preview.operation.id,
          group_index: group.index,
        });
        expect(result.operation.groups[group.index].state).toBe("applied");
        ids.push(result.operation.groups[group.index].items[0].result!.activity_id);
      }
      const repeated = await cmd({
        action: "apply",
        operation_id: preview.operation.id,
        group_index: 0,
      });
      expect(repeated.operation.groups[0].state).toBe("applied");
      expect(
        Number(
          (await db`select count(*) n from public.volunteer_activity where template_key=${key}`)[0]
            .n,
        ),
      ).toBe(28);
      const chosen = await select([ids[0]]);
      const edit = await cmd({
        action: "preview",
        operation: "edit",
        selection_id: chosen.operation.id,
        input: { changes: { title: "Synthetic changed" } },
        idempotency_key: crypto.randomUUID(),
      });
      await db`update public.volunteer_activity set description='second admin change' where id=${ids[0]}::uuid`;
      expect(
        (await cmd({ action: "apply", operation_id: edit.operation.id, group_index: 0 })).operation
          .groups[0].state,
      ).toBe("conflicted");
      const member = crypto.randomUUID();
      await db`insert into auth.users(id,email,email_confirmed_at)values(${member}::uuid,${member + "@example.invalid"},now())`;
      await db`insert into public.volunteer_profile(auth_user_id,display_name,birth_date,tier,status,verified_by,verified_at)values(${member}::uuid,'Synthetic bulk member','1990-01-01','regular','active',${actor}::uuid,now())`;
      const booked = (
        await db`select public.volunteer_booking_command(${member}::uuid,${JSON.stringify({ action: "book", activity_id: ids[1], role: "volunteer", remarks: "Synthetic", accept_terms: true, terms_version_id: body.terms.version_id, idempotency_key: crypto.randomUUID() })}::jsonb) result`
      )[0].result as Result;
      expect(booked.kind).toBe("booked");
      const closeSelection = await select([ids[1]]);
      const close = await cmd({
        action: "preview",
        operation: "close",
        selection_id: closeSelection.operation.id,
        input: { reason: "Synthetic closed signup" },
        idempotency_key: crypto.randomUUID(),
      });
      expect(
        (await cmd({ action: "apply", operation_id: close.operation.id, group_index: 0 })).operation
          .groups[0].state,
      ).toBe("applied");
      expect(
        (
          await db`select status from public.volunteer_registration where id=${booked.registration_id}::uuid`
        )[0].status,
      ).toBe("approved");
      const profile = (
        await db`select id from public.volunteer_profile where auth_user_id=${member}::uuid`
      )[0].id;
      expect(
        (
          await db`select public.volunteer_policy_evaluate(${ids[1]}::uuid,${profile}::uuid,'volunteer',clock_timestamp(),null) result`
        )[0].result.reason,
      ).toBe("registration_closed");
      const cancellation = await cmd({
        action: "preview",
        operation: "cancel",
        selection_id: (await select([ids[1]])).operation.id,
        input: { reason: "Synthetic session cancelled" },
        idempotency_key: crypto.randomUUID(),
      });
      expect(
        (await cmd({ action: "apply", operation_id: cancellation.operation.id, group_index: 0 }))
          .operation.groups[0].state,
      ).toBe("applied");
      expect(
        (
          await db`select status from public.volunteer_registration where id=${booked.registration_id}::uuid`
        )[0].status,
      ).toBe("cancelled");
      expect(
        Number(
          (
            await db`select count(*) n from public.volunteer_operation_event where entity_id=${booked.registration_id}::uuid`
          )[0].n,
        ),
      ).toBeGreaterThan(0);
      const many: string[] = [];
      for (let n = 0; n < 130; n++) {
        const id = crypto.randomUUID();
        many.push(id);
        await db`insert into public.volunteer_activity(id,type,title,starts_at,ends_at,location,capacity,status)values(${id}::uuid,'volunteer_shift',${key + " same title"},${addHkDays(day, 90 + Math.floor(n / 65)) + "T09:00:00+08:00"}::timestamptz,${addHkDays(day, 90 + Math.floor(n / 65)) + "T12:00:00+08:00"}::timestamptz,'Synthetic location',5,'draft')`;
      }
      const exact = await cmd({
        action: "select",
        mode: "all",
        filter: { q: key + " same title", sort: "asc" },
        ids: [],
        idempotency_key: crypto.randomUUID(),
      });
      expect(exact.operation.selection).toHaveLength(130);
      const more = crypto.randomUUID();
      await db`insert into public.volunteer_activity(id,type,title,starts_at,location,capacity,status)values(${more}::uuid,'volunteer_shift',${key + " same title"},${addHkDays(day, 95) + "T09:00:00+08:00"}::timestamptz,'Synthetic location',5,'draft')`;
      expect(
        (await cmd({ action: "status", operation_id: exact.operation.id })).operation.selection,
      ).toHaveLength(130);
      const bulkEdit = await cmd({
        action: "preview",
        operation: "edit",
        selection_id: exact.operation.id,
        input: { changes: { description: "Synthetic batch note" } },
        idempotency_key: crypto.randomUUID(),
      });
      expect(bulkEdit.operation.groups).toHaveLength(2);
      expect(bulkEdit.operation.groups.every((g) => g.items.length === 65)).toBe(true);
      for (const group of bulkEdit.operation.groups)
        expect(
          (
            await cmd({
              action: "apply",
              operation_id: bulkEdit.operation.id,
              group_index: group.index,
            })
          ).operation.groups[group.index].state,
        ).toBe("applied");
      const page = await cmd({
        action: "list",
        filter: { q: key + " same title", sort: "asc" },
        page: 6,
      });
      expect(page.total).toBe(131);
      expect(page.activities).toHaveLength(6);
      const revoked = await cmd({
        action: "preview",
        operation: "edit",
        selection_id: (await select([ids[2]])).operation.id,
        input: { changes: { title: "Must not apply" } },
        idempotency_key: crypto.randomUUID(),
      });
      await db`update public.admin_user set status='disabled' where auth_user_id=${actor}::uuid`;
      let denied = false;
      try {
        await cmd({ action: "apply", operation_id: revoked.operation.id, group_index: 0 });
      } catch {
        denied = true;
      }
      expect(denied).toBe(true);
    } finally {
      await Bun.write(
        ".local-policy-test/bulk-command-timing.json",
        JSON.stringify(
          { environment: "isolated56322 synthetic", samples: commandTimings },
          null,
          2,
        ),
      );
      await db.close();
    }
  },
  120000,
);

test.skipIf(!enabled)(
  "bulk draft publication, copy, attendance history and audit/outbox rollback",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const actor = crypto.randomUUID();
    const suffix = actor.replaceAll("-", "");
    const template = "bulk-extra-" + suffix;
    const day = addHkDays(hkDate(), 150);
    const auditConstraint = "bulk_audit_" + suffix;
    const outboxConstraint = "bulk_outbox_" + suffix;
    const cmd = async (command: unknown) =>
      (
        await db`select public.volunteer_bulk_command(${actor}::uuid,${JSON.stringify(command)}::jsonb) result`
      )[0].result as Result;
    const policy = async (command: unknown) =>
      (
        await db`select public.volunteer_policy_command(${actor}::uuid,${JSON.stringify(command)}::jsonb) result`
      )[0].result as Result;
    const select = async (ids: string[]) =>
      (
        await cmd({
          action: "select",
          mode: "page",
          ids,
          filter: { sort: "asc" },
          idempotency_key: crypto.randomUUID(),
        })
      ).operation.id;
    try {
      await db`insert into auth.users(id,email,email_confirmed_at)values(${actor}::uuid,${actor + "@example.invalid"},now())`;
      await db`insert into public.admin_user(auth_user_id,email,role,status)values(${actor}::uuid,${actor + "@example.invalid"},'admin','active')`;
      const draftKey = crypto.randomUUID();
      const input = {
        type: "volunteer_shift",
        title: "Synthetic draft " + suffix,
        starts_at: day + "T09:30:00+08:00",
        ends_at: day + "T12:30:00+08:00",
        location: "Synthetic",
        capacity: 5,
        status: "published",
        registration_modes: ["individual"],
      };
      const create = async () =>
        (
          await db`select public.create_volunteer_draft_with_audit(${actor}::uuid,${draftKey}::uuid,${JSON.stringify(input)}::jsonb) result`
        )[0].result as Result;
      const draft = await create();
      expect((await create()).activity_id).toBe(draft.activity_id);
      expect((await cmd({ action: "detail", activity_id: draft.activity_id, page: 1 })).kind).toBe(
        "detail",
      );
      expect(
        (
          await db`select status from public.volunteer_activity where id=${draft.activity_id}::uuid`
        )[0].status,
      ).toBe("draft");
      const body = structuredClone(initialPolicyCatalogue[0]);
      body.template_key = template;
      body.source = "Synthetic extra bulk acceptance";
      body.terms.version_id = "c9c6278a-c73a-4f0c-9b93-6e2b4089141a";
      await policy({ action: "save", template_key: template, expected_revision: 0, body });
      const pp = await policy({
        action: "preview",
        template_key: template,
        expected_revision: 1,
        effective_from: day + "T00:00:00+08:00",
        effective_until: null,
        activity_ids: [],
      });
      const published = await policy({
        action: "publish",
        preview_id: pp.preview_id,
        idempotency_key: crypto.randomUUID(),
        reason: "Synthetic fixture",
      });
      await db`insert into public.audit_log(actor_user_id,action,entity,entity_id,detail) select ${actor}::uuid,'synthetic_history','volunteer_activity',${draft.activity_id},'{}'::jsonb from generate_series(1,51)`;
      const history = await cmd({
        action: "detail",
        activity_id: draft.activity_id,
        page: 1,
        history_page: 3,
      });
      expect(history.history_total).toBe(52);
      expect(history.history).toHaveLength(2);
      const version = (published as unknown as { version_id: string }).version_id;
      const rebind = await cmd({
        action: "preview",
        operation: "rebind",
        selection_id: await select([draft.activity_id]),
        input: { version_id: version, reason: "Synthetic publish session" },
        idempotency_key: crypto.randomUUID(),
      });
      expect(rebind.operation.groups[0].items[0].state).toBe("ready");
      expect(
        (await cmd({ action: "apply", operation_id: rebind.operation.id, group_index: 0 }))
          .operation.groups[0].state,
      ).toBe("applied");
      expect(
        (
          await db`select status from public.volunteer_activity where id=${draft.activity_id}::uuid`
        )[0].status,
      ).toBe("published");
      const copy = await cmd({
        action: "preview",
        operation: "copy",
        input: { source_id: draft.activity_id, dates: [addHkDays(day, 1), addHkDays(day, 2)] },
        idempotency_key: crypto.randomUUID(),
      });
      expect(copy.operation.groups).toHaveLength(2);
      expect(
        (await cmd({ action: "apply", operation_id: copy.operation.id, group_index: 0 })).operation
          .groups[0].state,
      ).toBe("applied");
      await db`update public.volunteer_activity set description='source changed' where id=${draft.activity_id}::uuid`;
      expect(
        (await cmd({ action: "apply", operation_id: copy.operation.id, group_index: 1 })).operation
          .groups[1].state,
      ).toBe("conflicted");
      const edit = await cmd({
        action: "preview",
        operation: "edit",
        selection_id: await select([draft.activity_id]),
        input: { changes: { title: "Synthetic retry success" } },
        idempotency_key: crypto.randomUUID(),
      });
      await db.unsafe(
        `alter table public.audit_log add constraint ${auditConstraint} check(actor_user_id <> '${actor}'::uuid) not valid`,
      );
      expect(
        (await cmd({ action: "apply", operation_id: edit.operation.id, group_index: 0 })).operation
          .groups[0].state,
      ).toBe("failed");
      expect(
        (
          await db`select title from public.volunteer_activity where id=${draft.activity_id}::uuid`
        )[0].title,
      ).toBe(input.title);
      await db.unsafe(`alter table public.audit_log drop constraint ${auditConstraint}`);
      await db.unsafe(
        `alter table public.volunteer_operation_outbox add constraint ${outboxConstraint} check(payload->>'activity_id' <> '${draft.activity_id}') not valid`,
      );
      expect(
        (await cmd({ action: "apply", operation_id: edit.operation.id, group_index: 0 })).operation
          .groups[0].state,
      ).toBe("failed");
      expect(
        (
          await db`select title from public.volunteer_activity where id=${draft.activity_id}::uuid`
        )[0].title,
      ).toBe(input.title);
      await db.unsafe(
        `alter table public.volunteer_operation_outbox drop constraint ${outboxConstraint}`,
      );
      expect(
        (await cmd({ action: "apply", operation_id: edit.operation.id, group_index: 0 })).operation
          .groups[0].state,
      ).toBe("applied");
      const delivery = await cmd({ action: "status", operation_id: edit.operation.id });
      expect(delivery.operation.notifications).toHaveLength(1);
      expect(delivery.operation.notifications[0].follow_up).toBe("pending");
      expect(delivery.operation.notifications[0].provider_message_id).toBeNull();
      await db`select public.volunteer_task_command(${actor}::uuid,${JSON.stringify({ action: "complete", id: delivery.operation.notifications[0].id, reason: "Synthetic staff follow-up complete" })}::jsonb)`;
      const delivered = await cmd({ action: "status", operation_id: edit.operation.id });
      expect(delivered.operation.notifications[0].follow_up).toBe("completed");
      expect(delivered.operation.notifications[0].provider_message_id).toBeNull();
      const past = crypto.randomUUID();
      const registration = crypto.randomUUID();
      await db`insert into public.volunteer_activity(id,type,title,starts_at,ends_at,location,capacity,status)values(${past}::uuid,'volunteer_shift','Synthetic bulk attendance',now()-interval '2 days',now()-interval '1 day','Synthetic',5,'published')`;
      await db`insert into public.volunteer_registration(id,activity_id,registration_type,status,participant_count,contact_name,contact_email,contact_phone,status_token_hash,status_token_expires_at)values(${registration}::uuid,${past}::uuid,'individual','approved',1,'Synthetic',${registration + "@example.invalid"},'00000000',${registration},now()+interval '1 day')`;
      const attendance = await cmd({
        action: "preview",
        operation: "attendance",
        selection_id: await select([past]),
        input: { attendance_status: "completed", command: "record" },
        idempotency_key: crypto.randomUUID(),
      });
      expect(
        Number(
          (
            await db`select count(*) n from public.volunteer_attendance_event where registration_id=${registration}::uuid`
          )[0].n,
        ),
      ).toBe(0);
      expect(
        (await cmd({ action: "apply", operation_id: attendance.operation.id, group_index: 0 }))
          .operation.groups[0].state,
      ).toBe("applied");
      await cmd({ action: "apply", operation_id: attendance.operation.id, group_index: 0 });
      expect(
        Number(
          (
            await db`select count(*) n from public.volunteer_attendance_event where registration_id=${registration}::uuid`
          )[0].n,
        ),
      ).toBe(1);
      const correction = await cmd({
        action: "preview",
        operation: "attendance",
        selection_id: await select([past]),
        input: {
          attendance_status: "no_show",
          command: "correct",
          reason: "Synthetic factual correction",
        },
        idempotency_key: crypto.randomUUID(),
      });
      expect(
        (await cmd({ action: "apply", operation_id: correction.operation.id, group_index: 0 }))
          .operation.groups[0].state,
      ).toBe("applied");
      expect(
        Number(
          (
            await db`select count(*) n from public.volunteer_attendance_event where registration_id=${registration}::uuid`
          )[0].n,
        ),
      ).toBe(2);
      await db`insert into public.volunteer_activity(type,title,starts_at,location,capacity,status)select 'volunteer_shift',${suffix + " unsafe day"},${addHkDays(day, 50) + "T09:00:00+08:00"}::timestamptz,'Synthetic',5,'draft' from generate_series(1,101)`;
      const unsafe = await cmd({
        action: "select",
        mode: "all",
        filter: { q: suffix + " unsafe day", sort: "asc" },
        ids: [],
        idempotency_key: crypto.randomUUID(),
      });
      expect(
        (
          await cmd({
            action: "preview",
            operation: "edit",
            selection_id: unsafe.operation.id,
            input: { changes: { description: "Must reject unsafe grouping" } },
            idempotency_key: crypto.randomUUID(),
          })
        ).reason,
      ).toBe("shared_day_exceeds_100");
    } finally {
      await db.unsafe(`alter table public.audit_log drop constraint if exists ${auditConstraint}`);
      await db.unsafe(
        `alter table public.volunteer_operation_outbox drop constraint if exists ${outboxConstraint}`,
      );
      await db.close();
    }
  },
  120000,
);
