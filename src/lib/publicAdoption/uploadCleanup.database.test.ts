import { SQL } from "bun";
import { expect, test } from "bun:test";

const url = process.env.ADOPTION_TEST_DATABASE_URL;
if (url && (new URL(url).hostname !== "127.0.0.1" || new URL(url).port !== "56322"))
  throw new Error("Disposable database required");

test.skipIf(!url || process.env.ADOPTION_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
  "expired adoption cleanup preserves committed cases and purges only stale partial rows",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const rollback = new Error("rollback adoption cleanup fixtures");
    const completedId = crypto.randomUUID();
    const partialId = crypto.randomUUID();
    const freshId = crypto.randomUUID();
    const caseId = crypto.randomUUID();
    const statusId = crypto.randomUUID();
    const tokenHash = (id: string) => id.replaceAll("-", "").padEnd(64, "0");

    try {
      await db.begin(async (tx) => {
        for (const id of [completedId, partialId, freshId]) {
          await tx.unsafe(
            "insert into public.adoption_applications(id,animal_name,animal_type,applicant_name,phone,email,address,housing_type,reason) values($1,'Mochi','cat','Adopter','91234567',$2,'Home','flat','Care')",
            [id, id + "@example.invalid"],
          );
        }
        await tx.unsafe(
          "insert into public.coordinator_status(id,category,key,label_zh,label_en,is_active,is_closing) values($1,'adoption_case',$2,'Open','Open',true,false)",
          [statusId, "cleanup_" + statusId.replaceAll("-", "").slice(0, 12)],
        );
        await tx.unsafe(
          "insert into public.adoption_case(id,public_application_id,status_id,applicant_name,applicant_phone) values($1,$2,$3,'Adopter','91234567')",
          [caseId, completedId, statusId],
        );
        for (const id of [completedId, partialId]) {
          await tx.unsafe(
            "insert into public.adoption_upload_intent(application_id,photo_paths,status_token_hash,created_at,expires_at) values($1,array[$2],$3,now()-interval '2 days',now()-interval '2 hours')",
            [id, id + "/home.jpg", tokenHash(id)],
          );
        }
        await tx.unsafe(
          "insert into public.adoption_upload_intent(application_id,photo_paths,status_token_hash,expires_at) values($1,array[$2],$3,now()+interval '1 hour')",
          [freshId, freshId + "/home.jpg", tokenHash(freshId)],
        );

        const outcome = async (id: string) =>
          (
            await tx.unsafe("select public.cleanup_expired_adoption_application($1) as outcome", [
              id,
            ])
          )[0].outcome;
        expect(await outcome(completedId)).toBe("completed");
        expect(await outcome(partialId)).toBe("purged");
        expect(await outcome(freshId)).toBe("defer");
        expect(
          await tx.unsafe("select id from public.adoption_applications where id=$1", [completedId]),
        ).toHaveLength(1);
        expect(
          await tx.unsafe("select id from public.adoption_applications where id=$1", [partialId]),
        ).toHaveLength(0);
        expect(
          await tx.unsafe("select id from public.adoption_case where public_application_id=$1", [
            completedId,
          ]),
        ).toHaveLength(1);
        expect(
          await tx.unsafe(
            "select application_id from public.adoption_upload_intent where application_id=$1",
            [partialId],
          ),
        ).toHaveLength(1);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      await db.close();
    }
  },
  30000,
);
