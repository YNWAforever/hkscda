import { SQL } from "bun";
import { expect, test } from "bun:test";
const url = process.env.VOLUNTEER_TEST_DATABASE_URL;
if (url) {
  const target = new URL(url);
  if (
    target.hostname !== "127.0.0.1" ||
    target.port !== "56322" ||
    target.pathname !== "/postgres" ||
    target.search ||
    target.hash ||
    !["postgres:", "postgresql:"].includes(target.protocol)
  )
    throw new Error("Legacy list regression requires dedicated isolated 127.0.0.1:56322/postgres");
}
const enabled = Boolean(url) && process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES === "1";
test.skipIf(!enabled)(
  "legacy list read resolves SQL aliases and preserves explicit link behavior",
  async () => {
    const db = new SQL(url!, { max: 1 });
    try {
      await db.begin(async (tx) => {
        const actor = crypto.randomUUID(),
          person = crypto.randomUUID(),
          activity = crypto.randomUUID(),
          registration = crypto.randomUUID();
        await tx`insert into auth.users(id,email,email_confirmed_at) values(${actor}::uuid,${actor + "@example.invalid"},now()),(${person}::uuid,${person + "@example.invalid"},now())`;
        await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor + "@example.invalid"},'staff','active')`;
        await tx`insert into public.volunteer_profile(id,auth_user_id,display_name,status,verified_by,verified_at) values(${person}::uuid,${person}::uuid,'Synthetic legacy list profile','active',${actor}::uuid,now())`;
        await tx`insert into public.volunteer_activity(id,type,title,starts_at,ends_at,location,capacity,status) values(${activity}::uuid,'volunteer_shift','Synthetic legacy list session',now()-interval '2 days',now()-interval '1 day','Synthetic',5,'published')`;
        await tx`insert into public.volunteer_registration(id,activity_id,registration_type,status,participant_count,contact_name,contact_email,contact_phone,status_token_hash,status_token_expires_at) values(${registration}::uuid,${activity}::uuid,'individual','pending',1,'Synthetic original name','legacy-list@example.invalid','00000000',${registration},now()+interval '90 days')`;
        await tx`update public.volunteer_activity set starts_at=now()+interval '25 days',ends_at=now()+interval '25 days 4 hours' where id=${activity}::uuid`;
        const list = async () =>
          (
            await tx`select public.volunteer_legacy_identity_command(${actor}::uuid,'{"action":"list_legacy"}'::jsonb) as result`
          )[0].result.registrations as Array<{
            id: string;
            contact_name: string;
            contact_email: string;
            title: string;
            policy_bound: boolean;
            updated_at: string;
          }>;
        const rows = await list();
        expect(rows.find((row) => row.id === registration)).toMatchObject({
          contact_name: "Synthetic original name",
          contact_email: "legacy-list@example.invalid",
          title: "Synthetic legacy list session",
          policy_bound: false,
        });
        const before = (
          await tx`select updated_at::text as updated_at from public.volunteer_registration where id=${registration}::uuid`
        )[0];
        const command = {
          action: "link_legacy",
          registration_id: registration,
          profile_id: person,
          expected_updated_at: before.updated_at,
          reason: "Synthetic identity checked",
        };
        for (let i = 0; i < 2; i++)
          expect(
            (
              await tx`select public.volunteer_legacy_identity_command(${actor}::uuid,${command}::jsonb) as result`
            )[0].result.kind,
          ).toBe("linked");
        expect((await list()).some((row) => row.id === registration)).toBe(false);
        expect(
          (
            await tx`select contact_name,profile_id from public.volunteer_registration where id=${registration}::uuid`
          )[0],
        ).toMatchObject({ contact_name: "Synthetic original name", profile_id: person });
        expect(
          (
            await tx`select count(*)::int as count from public.volunteer_legacy_identity_link where registration_id=${registration}::uuid`
          )[0].count,
        ).toBe(1);
        for (const role of ["anon", "authenticated"])
          expect(
            (
              await tx`select has_function_privilege(${role},'public.volunteer_legacy_identity_command(uuid,jsonb)','EXECUTE') as allowed`
            )[0].allowed,
          ).toBe(false);
        expect(
          (
            await tx`select has_function_privilege('service_role','public.volunteer_legacy_identity_command(uuid,jsonb)','EXECUTE') as allowed`
          )[0].allowed,
        ).toBe(true);
        await tx.unsafe(
          `do $$ begin perform public.volunteer_legacy_identity_command('${person}'::uuid,'{"action":"list_legacy"}'); raise exception 'expected permission rejection'; exception when insufficient_privilege then null; end $$;`,
        );
        throw new Error("ROLLBACK_LEGACY_LIST_FIXTURES");
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "ROLLBACK_LEGACY_LIST_FIXTURES")
        throw error;
    } finally {
      await db.close();
    }
  },
);
