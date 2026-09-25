import { SQL } from "bun";
import { expect, test } from "bun:test";

const url = process.env.VOLUNTEER_TEST_DATABASE_URL;
if (url) {
  const target = new URL(url);
  if (
    target.hostname !== "127.0.0.1" ||
    target.port !== "56322" ||
    target.pathname !== "/postgres" ||
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    target.search ||
    target.hash
  )
    throw new Error("Volunteer clone tests require the isolated 127.0.0.1:56322/postgres database");
}
const enabled = Boolean(url) && process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES === "1";

test.skipIf(!enabled)("clone preserves dates and rolls back when audit insert fails", async () => {
  const db = new SQL(url!, { max: 1, prepare: false });
  const actor = crypto.randomUUID();
  const source = crypto.randomUUID();
  const nextStart = "2099-01-02T04:00:00.000Z";
  let rolledBack = false;
  try {
    await db.begin(async (tx) => {
      await tx`insert into public.admin_user(auth_user_id,email,role,status)
        values(${actor}::uuid,${actor + "@example.invalid"},'admin','active')`;
      await tx`insert into public.volunteer_activity
        (id,type,title,description,starts_at,ends_at,location,capacity,status)
        values(${source}::uuid,'cleaning_day','Synthetic clone','Test source',
          '2099-01-01T02:00:00Z','2099-01-01T05:00:00Z',
          'Isolated test',4,'published')`;
      const cloneId = (
        await tx`select public.clone_volunteer_activity_with_audit(
        ${source}::uuid,${actor}::uuid,${nextStart}::timestamptz
      ) as id`
      )[0].id as string;
      const clone = (
        await tx`select title,status,starts_at::text as start,ends_at::text as end_time
        from public.volunteer_activity where id=${cloneId}::uuid`
      )[0];
      expect(clone.title).toBe("Synthetic clone copy");
      expect(clone.status).toBe("draft");
      expect(new Date(clone.start).toISOString()).toBe(nextStart);
      expect(new Date(clone.end_time).toISOString()).toBe("2099-01-02T07:00:00.000Z");
      expect(
        (
          await tx`select count(*)::int as count from public.audit_log
        where action='volunteer_activity.clone' and entity_id=${cloneId}`
        )[0].count,
      ).toBe(1);

      await tx`create function pg_temp.fail_clone_audit() returns trigger
        language plpgsql as 'begin raise exception ''injected_clone_audit_failure''; end'`;
      await tx`create trigger volunteer_test_fail_clone_audit
        after insert on public.audit_log for each row
        when (new.action='volunteer_activity.clone')
        execute function pg_temp.fail_clone_audit()`;
      await tx`select set_config('volunteer_test.source', ${source}, true)`;
      await tx`select set_config('volunteer_test.actor', ${actor}, true)`;
      await tx`do $$
      begin
        begin
          perform public.clone_volunteer_activity_with_audit(
            current_setting('volunteer_test.source')::uuid,
            current_setting('volunteer_test.actor')::uuid, null
          );
          raise exception 'injected audit trigger did not fire';
        exception when raise_exception then
          if sqlerrm <> 'injected_clone_audit_failure' then raise; end if;
        end;
      end $$`;
      expect(
        (
          await tx`select count(*)::int as count from public.volunteer_activity
        where title='Synthetic clone copy'`
        )[0].count,
      ).toBe(1);
      throw new Error("rollback test fixtures");
    });
  } catch (error) {
    if (String(error).includes("rollback test fixtures")) rolledBack = true;
    else throw error;
  } finally {
    await db.close();
  }
  expect(rolledBack).toBe(true);
});
