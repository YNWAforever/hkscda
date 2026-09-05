import { afterAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
const target = "postgresql://postgres:postgres@127.0.0.1:55322/postgres";
const enabled = process.env.CRM_TEST_ALLOW_LOCAL_FIXTURES === "1";
if (enabled && process.env.CRM_TEST_DATABASE_URL !== target)
  throw new Error("Identity integration requires the exact isolated completion database");
const sql = enabled ? new SQL(target) : null;
function db() {
  if (!sql) throw new Error("Local identity fixture is disabled");
  return sql;
}
afterAll(async () => {
  if (sql) await sql.close();
});
async function rolledBack(fn: Parameters<ReturnType<typeof db>["begin"]>[1]) {
  const marker = new Error("rollback local identity fixture");
  try {
    await db().begin(async (tx) => {
      await fn(tx);
      throw marker;
    });
  } catch (error) {
    if (error !== marker) throw error;
  }
}
describe.skipIf(!enabled)("public identity actual local database", () => {
  test("existing identity SQL acceptance preserves deleted canonical data and rejects invalid claims", async () => {
    const source = readFileSync(
      new URL("../../../supabase/tests/crm_public_identity.sql", import.meta.url),
      "utf8",
    );
    const body = source.slice(source.indexOf("do $$"), source.lastIndexOf("rollback;")).trim();
    expect(body.startsWith("do $$")).toBe(true);
    await rolledBack(async (tx) => {
      await tx.unsafe(body);
    });
  });
  test("concurrent first submissions converge on one unmixed canonical identity", async () => {
    const email = `crm-concurrent-${randomUUID()}@example.invalid`;
    try {
      const contacts = [
        { name: "Claim A", email, phone: "11111111", language: "en", source: "donation_form" },
        {
          name: "Claim B",
          email: email.toUpperCase(),
          phone: "22222222",
          language: "zh-HK",
          source: "volunteer_registration_form",
        },
      ];
      const results = await Promise.all(
        contacts.map(
          async (contact) =>
            (
              await db()`select public.resolve_public_supporter_identity(${contact}::jsonb) result`
            )[0].result,
        ),
      );
      expect(results[0].supporterId).toBe(results[1].supporterId);
      expect(results.map((result) => result.kind).sort()).toEqual(["created", "existing"]);
      const rows =
        await db()`select name,phone,language,source from public.supporter where email=${email}`;
      expect(rows).toHaveLength(1);
      const winner = contacts[results[0].kind === "created" ? 0 : 1];
      expect(rows[0]).toEqual({
        name: winner.name,
        phone: winner.phone,
        language: winner.language,
        source: winner.source,
      });
    } finally {
      await db()`delete from public.supporter where email=${email}`;
    }
  });
  test("public donation and volunteer snapshots preserve canonical opt-out and store only pending opt-ins", async () => {
    await rolledBack(async (tx) => {
      const supporter = randomUUID(),
        activity = randomUUID(),
        email = `${supporter}@example.invalid`;
      await tx`insert into public.supporter(id,name,email,phone,language,source,tags,deleted_at) values(${supporter}::uuid,'Canonical',${email},'11111111','zh-HK','admin',array['preserve'],now())`;
      await tx`insert into public.consent(supporter_id,channel,status,source) values(${supporter}::uuid,'email','opt_out','local identity fixture')`;
      const contact = {
        name: "Unverified Replacement",
        email,
        phone: "99999999",
        language: "en",
        source: "donation_form",
      };
      const [resolved] =
        await tx`select public.resolve_public_supporter_identity(${contact}::jsonb) result`;
      expect(resolved.result.supporterId).toBe(supporter);
      const [donation] =
        await tx`insert into public.donation(supporter_id,amount_cents,purpose,method,contact_name,contact_email,contact_phone,contact_language,consent_email_requested,consent_whatsapp_requested) values(${supporter}::uuid,10000,'general','manual',${contact.name},${email},${contact.phone},'en',true,true) returning id,contact_name,contact_phone`;
      await tx`insert into public.volunteer_activity(id,type,title,starts_at,location,capacity,status,auto_approve,registration_modes) values(${activity}::uuid,'cleaning_day','Identity snapshot fixture',now()+interval '1 day','Local fixture',10,'published',true,array['individual'])`;
      const [registration] =
        await tx`select * from public.create_volunteer_registration(${activity}::uuid,${supporter}::uuid,'individual',1,${contact.name},${email},${contact.phone},'en',null,25,null,null,null,null,${randomUUID()},now()+interval '1 day',true,true)`;
      expect(donation.contact_name).toBe(contact.name);
      expect(donation.contact_phone).toBe(contact.phone);
      expect(registration.contact_name).toBe(contact.name);
      expect(registration.contact_phone).toBe(contact.phone);
      const [canonical] =
        await tx`select name,phone,language,source,tags,deleted_at is not null deleted from public.supporter where id=${supporter}::uuid`;
      expect(canonical).toEqual({
        name: "Canonical",
        phone: "11111111",
        language: "zh-HK",
        source: "admin",
        tags: ["preserve"],
        deleted: true,
      });
      const consent =
        await tx`select channel,status from public.consent where supporter_id=${supporter}::uuid`;
      expect(consent).toEqual([{ channel: "email", status: "opt_out" }]);
      const [intents] =
        await tx`select count(*)::int count,count(distinct submission_type)::int types from public.supporter_consent_intent where supporter_id=${supporter}::uuid`;
      expect(intents).toEqual({ count: 4, types: 2 });
    });
  });
  test("untrusted roles cannot resolve identities or read pending intent evidence", async () => {
    const rows =
      await db()`select role,has_function_privilege(role,'public.resolve_public_supporter_identity(jsonb)','execute') resolve,has_table_privilege(role,'public.supporter_consent_intent','select') intents from unnest(array['anon','authenticated']) role`;
    for (const row of rows) {
      expect(row.resolve).toBe(false);
      expect(row.intents).toBe(false);
    }
  });
});
