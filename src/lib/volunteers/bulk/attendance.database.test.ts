import { SQL } from "bun";
import { expect, test } from "bun:test";
import { attendanceActionCapabilities } from "../actionEligibility";
import { parseRosterAttendanceReply } from "./attendance";
import { reviewBulkOperation, type ReviewOperation } from "./review";
const connection = process.env.VOLUNTEER_TEST_DATABASE_URL;
const enabled = process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES === "1" && Boolean(connection);
if (connection) {
  const target = new URL(connection);
  if (target.hostname !== "127.0.0.1" || target.port !== "56322")
    throw new Error("Dedicated owned attendance DB required");
}

test.skipIf(!enabled)(
  "a scoped status retains a read-only legacy envelope for safe UI rollback",
  async () => {
    const manifest = await Bun.file(
      ".local-policy-test/volunteer-daily-work-20261016/manifest.json",
    ).json();
    const db = new SQL(connection!, { max: 1, prepare: false });
    try {
      const result = (
        await db`select public.volunteer_bulk_command(${String(manifest.actorIds[0])}::uuid,${JSON.stringify({ action: "status", operation_id: manifest.operationIds[0] })}::jsonb) result`
      )[0].result;
      expect(result.operation.action).toBe("roster_attendance");
      const legacy = reviewBulkOperation(result.operation as ReviewOperation);
      expect(legacy.canRunSequentially).toBe(false);
      expect(result.operation.groups).toEqual([]);
      expect(result.operation.selection).toEqual([]);
    } finally {
      await db.close();
    }
  },
);

test.skipIf(!enabled)(
  "roster server capability marker and actions agree with the authoritative RPC",
  async () => {
    const db = new SQL(connection!, { max: 1, prepare: false });
    const rollback = new Error("owned attendance parity rollback");
    try {
      await db.begin(async (tx) => {
        const actor = crypto.randomUUID();
        await tx`insert into auth.users(id,email,email_confirmed_at) values(${actor}::uuid,${actor + "@example.invalid"},now())`;
        await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor + "@example.invalid"},'staff','active')`;
        for (const [status, attendance, activityStatus, future] of [
          ["approved", "not_marked", "published", false],
          ["waitlisted", "not_marked", "published", false],
          ["cancelled", "not_marked", "published", false],
          ["approved", "attended", "published", false],
          ["approved", "no_show", "published", false],
          ["approved", "not_marked", "cancelled", false],
          ["approved", "not_marked", "published", true],
        ] as const) {
          const activity = crypto.randomUUID(),
            registration = crypto.randomUUID();
          await tx`insert into public.volunteer_activity(id,type,title,starts_at,ends_at,location,capacity,status)
        values(${activity}::uuid,'volunteer_shift','Synthetic DW parity',now()-interval '2 hours',now()-interval '1 hour','Synthetic',100,'published')`;
          await tx`insert into public.volunteer_registration(id,activity_id,registration_type,status,participant_count,contact_name,contact_email,contact_phone,status_token_hash,status_token_expires_at)
        values(${registration}::uuid,${activity}::uuid,'individual',${status},1,'Synthetic','synthetic@example.invalid','00000000',${crypto.randomUUID()},now()+interval '1 day')`;
          if (attendance !== "not_marked") {
            const stamp = (
              await tx`select to_jsonb(updated_at)#>>'{}' stamp from public.volunteer_registration where id=${registration}::uuid`
            )[0].stamp;
            expect(
              (
                await tx`select public.set_volunteer_attendance_with_audit(${registration}::uuid,${actor}::uuid,${stamp}::timestamptz,${attendance},'record') result`
              )[0].result.kind,
            ).toBe("updated");
          }
          if (future)
            await tx`update public.volunteer_activity set starts_at=now()+interval '2 days',ends_at=now()+interval '2 days 1 hour' where id=${activity}::uuid`;
          if (activityStatus === "cancelled")
            await tx`update public.volunteer_activity set status='cancelled' where id=${activity}::uuid`;
          const detail = (
            await tx`select public.volunteer_bulk_command(${actor}::uuid,${JSON.stringify({ action: "detail", activity_id: activity, page: 1, history_page: 1 })}::jsonb) result`
          )[0].result;
          expect(detail.attendance_contract).toBe(1);
          expect(detail.registrations[0].participant_count).toBe(1);
          const row = detail.registrations[0];
          const actions = attendanceActionCapabilities(
            {
              ...row,
              starts_at: detail.activity.starts_at,
              ends_at: detail.activity.ends_at,
              activity_status: detail.activity.status,
            },
            () => new Date(detail.asOf),
          );
          for (const action of actions) {
            if (action.attendance_status === row.attendance_status) continue;
            let result: { kind: string } | undefined;
            const probeRollback = new Error("probe rollback");
            try {
              await tx.savepoint(async (probe) => {
                result = (
                  await probe`select public.set_volunteer_attendance_with_audit(${registration}::uuid,${actor}::uuid,${row.updated_at}::timestamptz,${action.attendance_status},${action.command},${action.command === "correct" ? "Synthetic parity correction" : null}) result`
                )[0].result;
                throw probeRollback;
              });
            } catch (error) {
              if (error !== probeRollback) throw error;
            }
            expect(
              action.allowed,
              `${status}/${attendance}/${activityStatus}/${future}/${action.command}/${action.attendance_status}`,
            ).toBe(result?.kind === "updated");
          }
        }
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      await db.close();
    }
  },
);

test.skipIf(!enabled)(
  "exact page attendance persists partial outcomes once and rolls back an unsaved receipt",
  async () => {
    const db = new SQL(connection!, { max: 1, prepare: false });
    const rollback = new Error("owned roster receipt rollback");
    try {
      await db.begin(async (tx) => {
        const actor = crypto.randomUUID(),
          colleague = crypto.randomUUID(),
          activity = crypto.randomUUID();
        for (const id of [actor, colleague]) {
          await tx`insert into auth.users(id,email,email_confirmed_at) values(${id}::uuid,${id + "@example.invalid"},now())`;
          await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${id}::uuid,${id + "@example.invalid"},'staff','active')`;
        }
        await tx`insert into public.volunteer_activity(id,type,title,starts_at,ends_at,location,capacity,status)
      values(${activity}::uuid,'volunteer_shift','Synthetic DW receipts',now()-interval '2 hours',now()-interval '1 hour','Synthetic',100,'published')`;
        const ids = Array.from({ length: 26 }, () => crypto.randomUUID()).sort();
        for (const [index, id] of ids.entries())
          await tx`insert into public.volunteer_registration(id,activity_id,registration_type,status,participant_count,contact_name,contact_email,contact_phone,status_token_hash,status_token_expires_at)
        values(${id}::uuid,${activity}::uuid,'individual',${index === 3 ? "waitlisted" : "approved"},1,${"Synthetic " + index},'synthetic@example.invalid','00000000',${crypto.randomUUID()},now()+interval '1 day')`;
        const legacy = (command: unknown, who = actor) =>
          tx`select public.volunteer_bulk_command(${who}::uuid,${JSON.stringify(command)}::jsonb) result`.then(
            (rows) => rows[0].result,
          );
        const scoped = (command: unknown, who = actor) =>
          tx`select public.volunteer_roster_attendance_command(${who}::uuid,${JSON.stringify(command)}::jsonb) result`.then(
            (rows) => rows[0].result,
          );
        const detail = await legacy({
          action: "detail",
          activity_id: activity,
          page: 1,
          history_page: 1,
        });
        const entries = detail.registrations
          .slice(0, 4)
          .map((r: { id: string; updated_at: string }) => ({
            registration_id: r.id,
            expected_updated_at: r.updated_at,
            attendance_status: "attended",
            command: "record",
          }));
        const request = {
          action: "attendance_preview",
          activity_id: activity,
          expected_activity_updated_at: detail.activity.updated_at,
          page: 1,
          page_size: 25,
          entries,
          idempotency_key: crypto.randomUUID(),
        };
        const beforeEvents = Number(
          (await tx`select count(*) n from public.volunteer_attendance_event`)[0].n,
        );
        const beforeAudit = Number((await tx`select count(*) n from public.audit_log`)[0].n);
        const beforeOutbox = Number(
          (await tx`select count(*) n from public.volunteer_operation_outbox`)[0].n,
        );
        const preview = parseRosterAttendanceReply(await scoped(request));
        expect(preview.rows.map((row) => row.decision)).toEqual([
          "ready",
          "ready",
          "ready",
          "skipped",
        ]);
        expect(preview.rows[3].reason).toBe("registration_not_approved");
        expect(
          Number((await tx`select count(*) n from public.volunteer_attendance_event`)[0].n),
        ).toBe(beforeEvents);
        expect(Number((await tx`select count(*) n from public.audit_log`)[0].n)).toBe(beforeAudit);
        expect(
          Number((await tx`select count(*) n from public.volunteer_operation_outbox`)[0].n),
        ).toBe(beforeOutbox);
        expect(
          (await scoped({ ...request, entries: [{ ...entries[0], attendance_status: "no_show" }] }))
            .kind,
        ).toBe("conflict");
        expect(
          (
            await scoped(
              { action: "attendance_lookup", idempotency_key: request.idempotency_key },
              colleague,
            )
          ).kind,
        ).toBe("not_found");
        expect((await legacy({ action: "status", operation_id: preview.id }, colleague)).kind).toBe(
          "not_found",
        );
        expect(
          (await scoped({ action: "attendance_apply", operation_id: preview.id }, colleague)).kind,
        ).toBe("not_found");
        expect(
          (await legacy({ action: "apply", operation_id: preview.id, group_index: 0 })).kind,
        ).toBe("invalid");
        expect(
          (
            await scoped({
              ...request,
              idempotency_key: crypto.randomUUID(),
              entries: [{ ...entries[0], registration_id: ids[25] }],
            })
          ).kind,
        ).toBe("conflict");
        expect(
          (
            await tx`select public.set_volunteer_attendance_with_audit(${ids[1]}::uuid,${colleague}::uuid,${entries[1].expected_updated_at}::timestamptz,'no_show','record') result`
          )[0].result.kind,
        ).toBe("updated");
        const trigger = "dw_" + ids[2].replaceAll("-", "");
        await tx.unsafe(
          `create function pg_temp.${trigger}() returns trigger language plpgsql as $$begin if new.entity_id='${ids[2]}' and new.action='volunteer_registration.attendance_update' then raise exception 'Synthetic single attendance audit failure';end if;return new;end$$`,
        );
        await tx.unsafe(
          `create trigger ${trigger} before insert on public.audit_log for each row execute function pg_temp.${trigger}()`,
        );
        const applied = parseRosterAttendanceReply(
          await scoped({ action: "attendance_apply", operation_id: preview.id }),
        );
        expect(applied.results?.map((row) => row.kind)).toEqual([
          "applied",
          "conflicted",
          "failed",
          "skipped",
        ]);
        expect(applied.results?.map((row) => row.reason)).toEqual([
          null,
          "stale_registration",
          "transaction_failed",
          "registration_not_approved",
        ]);
        expect(applied.results?.[0].after?.attendance_status).toBe("attended");
        expect(applied.results?.[2].event_id).toBeNull();
        const successAudit = (
          await tx`select actor_user_id,entity_id,action,detail from public.audit_log where id::text=${applied.results![0].audit_id}`
        )[0];
        expect(successAudit).toMatchObject({
          actor_user_id: actor,
          entity_id: ids[0],
          action: "volunteer_registration.attendance_update",
        });
        expect(successAudit.detail).toMatchObject({
          eventId: applied.results![0].event_id,
          before: { attendanceStatus: "not_marked" },
          after: { attendanceStatus: "attended" },
        });
        const conflictAudit = (
          await tx`select actor_user_id,entity_id,detail from public.audit_log where id::text=${applied.results![1].audit_id}`
        )[0];
        expect(conflictAudit).toMatchObject({ actor_user_id: actor, entity_id: ids[1] });
        expect(conflictAudit.detail).toMatchObject({
          operationId: preview.id,
          current: { attendance_status: "no_show" },
          result: { kind: "conflicted", reason: "stale_registration" },
        });
        const current = (
          await tx`select to_jsonb(updated_at)#>>'{}' stamp from public.volunteer_registration where id=${ids[0]}::uuid`
        )[0].stamp;
        expect(
          (
            await tx`select public.set_volunteer_attendance_with_audit(${ids[0]}::uuid,${colleague}::uuid,${current}::timestamptz,'no_show','correct','Synthetic subsequent correction') result`
          )[0].result.kind,
        ).toBe("updated");
        const countAfterCorrection = Number(
          (await tx`select count(*) n from public.volunteer_attendance_event`)[0].n,
        );
        expect(
          parseRosterAttendanceReply(
            await scoped({ action: "attendance_apply", operation_id: preview.id }),
          ),
        ).toEqual(applied);
        expect(
          Number((await tx`select count(*) n from public.volunteer_attendance_event`)[0].n),
        ).toBe(countAfterCorrection);
        expect(
          (
            await tx`select attendance_status from public.volunteer_registration where id=${ids[25]}::uuid`
          )[0].attendance_status,
        ).toBe("not_marked");
        const row = detail.registrations[4];
        const next = parseRosterAttendanceReply(
          await scoped({
            ...request,
            idempotency_key: crypto.randomUUID(),
            entries: [
              {
                registration_id: row.id,
                expected_updated_at: row.updated_at,
                attendance_status: "attended",
                command: "record",
              },
            ],
          }),
        );
        const receiptTrigger = "dw_receipt_" + next.id.replaceAll("-", "");
        await tx.unsafe(
          `create function pg_temp.${receiptTrigger}() returns trigger language plpgsql as $$begin if new.id='${next.id}' then raise exception 'Synthetic receipt persistence failure';end if;return new;end$$`,
        );
        await tx.unsafe(
          `create trigger ${receiptTrigger} before update on public.volunteer_bulk_operation for each row execute function pg_temp.${receiptTrigger}()`,
        );
        const auditBeforeFatal = Number((await tx`select count(*) n from public.audit_log`)[0].n);
        let receiptFailure: unknown;
        try {
          await tx.savepoint(async (probe) => {
            await probe`select public.volunteer_roster_attendance_command(${actor}::uuid,${JSON.stringify({ action: "attendance_apply", operation_id: next.id })}::jsonb)`;
          });
        } catch (error) {
          receiptFailure = error;
        }
        expect(receiptFailure).toBeInstanceOf(Error);
        expect((receiptFailure as Error).message).toContain(
          "Synthetic receipt persistence failure",
        );
        expect(Number((await tx`select count(*) n from public.audit_log`)[0].n)).toBe(
          auditBeforeFatal,
        );
        expect(
          (
            await tx`select attendance_status from public.volunteer_registration where id=${row.id}::uuid`
          )[0].attendance_status,
        ).toBe("not_marked");
        expect(
          Number((await tx`select count(*) n from public.volunteer_attendance_event`)[0].n),
        ).toBe(countAfterCorrection);
        expect(
          parseRosterAttendanceReply(await legacy({ action: "status", operation_id: next.id }))
            .state,
        ).toBe("previewed");
        const expired = parseRosterAttendanceReply(
          await scoped({ ...request, idempotency_key: crypto.randomUUID(), entries: [entries[2]] }),
        );
        await tx`update public.volunteer_bulk_operation set expires_at=clock_timestamp()-interval '1 second' where id=${expired.id}::uuid`;
        expect(
          parseRosterAttendanceReply(await legacy({ action: "status", operation_id: expired.id }))
            .state,
        ).toBe("expired");
        const expiredResult = parseRosterAttendanceReply(
          await scoped({ action: "attendance_apply", operation_id: expired.id }),
        );
        expect(expiredResult.results?.[0]).toMatchObject({
          kind: "skipped",
          reason: "operation_expired",
          event_id: null,
          after: null,
        });
        const stale = parseRosterAttendanceReply(
          await scoped({
            ...request,
            idempotency_key: crypto.randomUUID(),
            entries: [
              {
                registration_id: row.id,
                expected_updated_at: row.updated_at,
                attendance_status: "attended",
                command: "record",
              },
            ],
          }),
        );
        await tx`update public.volunteer_activity set description='Synthetic concurrent detail edit' where id=${activity}::uuid`;
        const staleResult = parseRosterAttendanceReply(
          await scoped({ action: "attendance_apply", operation_id: stale.id }),
        );
        expect(staleResult.results?.[0]).toMatchObject({
          kind: "conflicted",
          reason: "stale_activity",
          event_id: null,
          after: null,
        });
        expect(
          Number((await tx`select count(*) n from public.volunteer_operation_outbox`)[0].n),
        ).toBe(beforeOutbox);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      await db.close();
    }
  },
);

test.skipIf(!enabled)(
  "parallel apply records once and rechecks the owned actor after a real domain-lock wait",
  async () => {
    const file = ".local-policy-test/volunteer-daily-work-20261016/manifest.json";
    const manifest = await Bun.file(file).json();
    if (manifest.state !== "ready" || !String(manifest.prefix).startsWith("AUDIT-DW-"))
      throw new Error("Owned daily-work fixture required; no alternative destination");
    const db = new SQL(connection!, { max: 1, prepare: false }),
      other = new SQL(connection!, { max: 1, prepare: false });
    const actor = String(manifest.actorIds[0]),
      activity = String(manifest.cases.rosterActivityId);
    const key = crypto.randomUUID();
    const evidence = {
      fixtureId: String(manifest.fixtureId),
      key,
      actor,
      activity,
      phase: "starting",
      operationIds: [] as string[],
      registrationId: "",
    };
    const evidenceFile = `.local-policy-test/volunteer-daily-work-20261016/concurrency-${key}.json`;
    const save = () => Bun.write(evidenceFile, JSON.stringify(evidence, null, 2));
    let originalStatus: string | undefined, registration: string | undefined;
    try {
      const owned = (
        await db`select count(*)::int n from auth.users where id=${actor}::uuid and raw_app_meta_data->>'volunteer_fixture_id'=${String(manifest.fixtureId)}`
      )[0].n;
      expect(owned).toBe(1);
      originalStatus = (
        await db`select status from public.admin_user where auth_user_id=${actor}::uuid`
      )[0].status;
      expect(originalStatus).toBe("active");
      const detail = (
        await db`select public.volunteer_bulk_command(${actor}::uuid,${JSON.stringify({ action: "detail", activity_id: activity, page: 1, history_page: 1 })}::jsonb) result`
      )[0].result;
      const row = [...detail.registrations]
        .reverse()
        .find(
          (r: { status: string; attendance_status: string }) =>
            r.status === "approved" && r.attendance_status === "not_marked",
        );
      if (!row || !String(row.contact_name).startsWith(manifest.prefix))
        throw new Error("Owned eligible roster row required");
      registration = row.id;
      evidence.registrationId = row.id;
      await save();
      const preview = async (requestKey: string) => {
        const stamp = (
          await db`select to_jsonb(updated_at)#>>'{}' stamp from public.volunteer_registration where id=${row.id}::uuid`
        )[0].stamp;
        const op = parseRosterAttendanceReply(
          (
            await db`select public.volunteer_roster_attendance_command(${actor}::uuid,${JSON.stringify(
              {
                action: "attendance_preview",
                activity_id: activity,
                expected_activity_updated_at: detail.activity.updated_at,
                page: 1,
                page_size: 25,
                idempotency_key: requestKey,
                entries: [
                  {
                    registration_id: row.id,
                    expected_updated_at: stamp,
                    attendance_status: "attended",
                    command: "record",
                  },
                ],
              },
            )}::jsonb) result`
          )[0].result,
        );
        evidence.operationIds.push(op.id);
        manifest.operationIds.push(op.id);
        await Bun.write(file, JSON.stringify(manifest, null, 2));
        await save();
        return op;
      };
      const op = await preview(key);
      const before = Number(
        (
          await db`select count(*) n from public.volunteer_attendance_event where registration_id=${row.id}::uuid`
        )[0].n,
      );
      const body = JSON.stringify({ action: "attendance_apply", operation_id: op.id });
      evidence.phase = "parallel_dispatch";
      await save();
      const [first, second] = await Promise.all([
        db`select public.volunteer_roster_attendance_command(${actor}::uuid,${body}::jsonb) result`.then(
          (rows) => parseRosterAttendanceReply(rows[0].result),
        ),
        other`select public.volunteer_roster_attendance_command(${actor}::uuid,${body}::jsonb) result`.then(
          (rows) => parseRosterAttendanceReply(rows[0].result),
        ),
      ]);
      expect(first.results).toEqual(second.results);
      expect(first.results?.[0].kind).toBe("applied");
      expect(
        Number(
          (
            await db`select count(*) n from public.volunteer_attendance_event where registration_id=${row.id}::uuid`
          )[0].n,
        ),
      ).toBe(before + 1);
      evidence.phase = "known_applied";
      await save();
      const current = (
        await db`select to_jsonb(updated_at)#>>'{}' stamp from public.volunteer_registration where id=${row.id}::uuid`
      )[0].stamp;
      expect(
        (
          await db`select public.set_volunteer_attendance_with_audit(${row.id}::uuid,${actor}::uuid,${current}::timestamptz,'not_marked','correct','Synthetic duplicate-regression fixture restoration; retain history') result`
        )[0].result.kind,
      ).toBe("updated");
      const denied = await preview(crypto.randomUUID());
      const pid = Number((await other`select pg_backend_pid() pid`)[0].pid);
      let waiting: Promise<{ code?: string }> | undefined;
      await db.begin(async (holder) => {
        await holder`select pg_advisory_xact_lock(hashtextextended('volunteer-domain',0))`;
        waiting =
          other`select public.volunteer_roster_attendance_command(${actor}::uuid,${JSON.stringify({ action: "attendance_apply", operation_id: denied.id })}::jsonb) result`
            .then(() => ({ code: "unexpected_success" }))
            .catch((error: unknown) => ({ code: (error as { errno?: string }).errno }));
        const deadline = performance.now() + 1500;
        let blocked = false;
        while (performance.now() < deadline) {
          blocked = Boolean(
            (await holder`select cardinality(pg_blocking_pids(${pid}::integer))>0 blocked`)[0]
              .blocked,
          );
          if (blocked) break;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        expect(blocked).toBe(true);
        await holder`update public.admin_user set status='disabled' where auth_user_id=${actor}::uuid`;
      });
      expect((await waiting)?.code).toBe("42501");
      expect(
        (
          await db`select attendance_status from public.volunteer_registration where id=${row.id}::uuid`
        )[0].attendance_status,
      ).toBe("not_marked");
      evidence.phase = "role_wait_denied_no_write";
      await save();
    } finally {
      if (originalStatus === "active")
        await db`update public.admin_user set status='active' where auth_user_id=${actor}::uuid and status='disabled'`;
      if (registration) evidence.phase += "_actor_restored";
      await save();
      await other.close();
      await db.close();
    }
  },
);
