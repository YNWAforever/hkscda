import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { randomUUID } from "node:crypto";
import { assertCloneUrl, assertSafeFixtureTables } from "./helpers/productionSchemaClone";

const url = process.env.R01_ANIMAL_PREFERENCE_TEST_DATABASE_URL;
if (url) assertCloneUrl(url);
let db: SQL;
describe.skipIf(!url)("R01 shared animal preference trigger row types", () => {
  beforeAll(async () => {
    db = new SQL(url!, { max: 1 });
    await assertSafeFixtureTables(db, [
      "sponsorship_preference",
      "adoption_application_animal_preference",
      "animals",
      "supporter",
      "sponsorship_pledge",
      "adoption_applications",
      "audit_log",
      "supporter_consent_intent",
      "sponsorship_delivery_outbox",
      "message",
    ]);
  });
  async function fixture(body: (tx: SQL) => Promise<void>) {
    const sentinel = new Error("rollback preference fixtures");
    try {
      await db.begin(async (tx) => {
        await tx`set local role service_role`;
        await body(tx as SQL);
        throw sentinel;
      });
    } catch (e) {
      if (e !== sentinel) throw e;
    }
  }
  async function parents(tx: SQL, domain: string) {
    const id = randomUUID(),
      animal = randomUUID();
    await tx`insert into public.animals(id,type,name,gender,age,status,publication_state,adoption_eligible,sponsorship_eligible) values(${animal}::uuid,'cat','Synthetic preference cat','female','2 歲','available','published',true,true)`;
    if (domain === "sponsorship") {
      const supporter = randomUUID();
      await tx`insert into public.supporter(id,name,email) values(${supporter}::uuid,'Synthetic',${supporter + "@example.invalid"})`;
      await tx`insert into public.sponsorship_pledge(id,supporter_id,monthly_tier,amount_cents,currency,language,status,contact_submission) values(${id}::uuid,${supporter}::uuid,'100',10000,'HKD','en','pending_payment','{"name":"Synthetic","email":"synthetic@example.invalid"}'::jsonb)`;
    } else {
      await tx`insert into public.adoption_applications(id,animal_id,animal_name,animal_type,applicant_name,phone,email,address,housing_type,reason) values(${id}::uuid,${animal}::uuid,'Synthetic','cat','Synthetic','00000000','synthetic@example.invalid','Synthetic','Synthetic','Synthetic')`;
    }
    return { id, animal };
  }
  async function preference(tx: SQL, domain: string, id: string, animal: string, type = "cat") {
    if (domain === "sponsorship")
      await tx`insert into public.sponsorship_preference(pledge_id,sponsor_animal_id,rank,animal_name_snapshot,animal_type_snapshot) values(${id}::uuid,${animal}::uuid,1,'Synthetic',${type})`;
    else
      await tx`insert into public.adoption_application_animal_preference(public_application_id,animal_id,rank,animal_name_snapshot,animal_type_snapshot) values(${id}::uuid,${animal}::uuid,1,'Synthetic',${type})`;
  }
  afterAll(async () => {
    await db?.close();
  });
  for (const domain of ["sponsorship", "adoption"]) {
    test(`${domain} preference rejects a nonexistent animal through eligibility validation`, async () => {
      let code: string | undefined;
      try {
        await db.begin(async (tx) => {
          await tx`set local role service_role`;
          if (domain === "sponsorship") {
            await tx`insert into public.sponsorship_preference(pledge_id,sponsor_animal_id,rank,animal_name_snapshot,animal_type_snapshot) values(${randomUUID()}::uuid,${randomUUID()}::uuid,1,'Synthetic','cat')`;
          } else {
            await tx`insert into public.adoption_application_animal_preference(public_application_id,animal_id,rank,animal_name_snapshot,animal_type_snapshot) values(${randomUUID()}::uuid,${randomUUID()}::uuid,1,'Synthetic','cat')`;
          }
        });
      } catch (error) {
        code = (error as { errno?: string }).errno;
      }
      expect(code).toBe("23514");
    });
    test(`${domain} preference accepts an actual currently eligible selected animal`, async () => {
      await fixture(async (tx) => {
        const { id, animal } = await parents(tx, domain);
        await preference(tx, domain, id, animal);
        const [row] =
          domain === "sponsorship"
            ? await tx`select sponsor_animal_id animal from public.sponsorship_preference where pledge_id=${id}::uuid`
            : await tx`select animal_id animal from public.adoption_application_animal_preference where public_application_id=${id}::uuid`;
        expect(row.animal).toBe(animal);
        const [age] = await tx`select public_age_band from public.animals where id=${animal}::uuid`;
        expect(age.public_age_band).toBe("adult");
      });
    });
    test(`${domain} preference retains publication, status, retirement, eligibility and snapshot checks`, async () => {
      for (const invalid of ["publication", "status", "retired", "eligibility", "snapshot"])
        await fixture(async (tx) => {
          const { id, animal } = await parents(tx, domain);
          if (invalid === "publication")
            await tx`update public.animals set publication_state='draft' where id=${animal}::uuid`;
          if (invalid === "status")
            await tx`update public.animals set status='adopted' where id=${animal}::uuid`;
          if (invalid === "retired")
            await tx`update public.animals set retired_at=clock_timestamp() where id=${animal}::uuid`;
          if (invalid === "eligibility") {
            if (domain === "sponsorship")
              await tx`update public.animals set sponsorship_eligible=false where id=${animal}::uuid`;
            else
              await tx`update public.animals set adoption_eligible=false where id=${animal}::uuid`;
          }
          let code: string | undefined;
          await tx`savepoint rejected_preference`;
          try {
            await preference(tx, domain, id, animal, invalid === "snapshot" ? "dog" : "cat");
          } catch (e) {
            code = (e as { errno?: string }).errno;
          }
          await tx`rollback to savepoint rejected_preference`;
          expect(code).toBe("23514");
        });
    });
  }
});
