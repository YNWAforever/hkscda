import { SQL } from "bun";
import { expect, test } from "bun:test";

const url = process.env.ADOPTION_TEST_DATABASE_URL;
if (url && (new URL(url).hostname !== "127.0.0.1" || new URL(url).port !== "56322"))
  throw new Error("Disposable database required");

test.skipIf(!url || process.env.ADOPTION_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
  "case status RPC checks the current status and derives closed_at atomically",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const rollback = new Error("rollback adoption status fixtures");
    const actor = crypto.randomUUID();
    const caseId = crypto.randomUUID();
    const openId = crypto.randomUUID();
    const closeId = crypto.randomUUID();
    const wrongCategoryId = crypto.randomUUID();
    const key = (prefix: string, id: string) => `${prefix}_${id.replaceAll("-", "").slice(0, 12)}`;

    try {
      await db.begin(async (tx) => {
        await tx`insert into auth.users(id,email,email_confirmed_at) values(${actor}::uuid,${actor + "@example.invalid"},now())`;
        await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor + "@example.invalid"},'staff','active')`;
        await tx`insert into public.coordinator_status(id,category,key,label_zh,label_en,is_active,is_closing) values
          (${openId}::uuid,'adoption_case',${key("open", openId)},'Open','Open',true,false),
          (${closeId}::uuid,'adoption_case',${key("closed", closeId)},'Closed','Closed',true,true),
          (${wrongCategoryId}::uuid,'followup',${key("followup", wrongCategoryId)},'Follow up','Follow up',true,false)`;
        await tx`insert into public.adoption_case(id,status_id,applicant_name,applicant_phone) values(${caseId}::uuid,${openId}::uuid,'Test Adopter','91234567')`;

        const denied = async (statusId: string) => {
          let failed = false;
          try {
            await tx.savepoint(async (sp) => {
              await sp`select public.change_adoption_case_status(${caseId}::uuid,${statusId}::uuid,${actor}::uuid,null,'2040-01-01'::timestamptz)`;
            });
          } catch {
            failed = true;
          }
          expect(failed).toBe(true);
        };

        await denied(wrongCategoryId);
        await tx`update public.coordinator_status set is_active=false where id=${closeId}::uuid`;
        await denied(closeId);
        expect(
          (
            await tx`select status_id,closed_at from public.adoption_case where id=${caseId}::uuid`
          )[0],
        ).toMatchObject({ status_id: openId, closed_at: null });

        await tx`update public.coordinator_status set is_active=true where id=${closeId}::uuid`;
        await tx`select public.change_adoption_case_status(${caseId}::uuid,${closeId}::uuid,${actor}::uuid,null,null)`;
        expect(
          (await tx`select closed_at from public.adoption_case where id=${caseId}::uuid`)[0]
            .closed_at,
        ).not.toBeNull();

        await tx`update public.coordinator_status set is_closing=false where id=${closeId}::uuid`;
        await tx`select public.change_adoption_case_status(${caseId}::uuid,${closeId}::uuid,${actor}::uuid,null,'2040-01-01'::timestamptz)`;
        expect(
          (await tx`select closed_at from public.adoption_case where id=${caseId}::uuid`)[0]
            .closed_at,
        ).toBeNull();
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

test.skipIf(!url || process.env.ADOPTION_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
  "BUG-34: a finalised case cannot change status and a reopen needs a reason",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const rollback = new Error("rollback BUG-34 fixtures");
    const actor = crypto.randomUUID();
    const caseId = crypto.randomUUID();
    const finalisedCaseId = crypto.randomUUID();
    const openId = crypto.randomUUID();
    const closeId = crypto.randomUUID();
    const outcomeId = crypto.randomUUID();
    const supporter = crypto.randomUUID();
    const profile = crypto.randomUUID();
    const animal = crypto.randomUUID();
    const key = (prefix: string, id: string) => `${prefix}_${id.replaceAll("-", "").slice(0, 12)}`;

    try {
      await db.begin(async (tx) => {
        await tx`insert into auth.users(id,email,email_confirmed_at) values(${actor}::uuid,${actor + "@example.invalid"},now())`;
        await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor + "@example.invalid"},'staff','active')`;
        await tx`insert into public.coordinator_status(id,category,key,label_zh,label_en,is_active,is_closing,is_final) values
          (${openId}::uuid,'adoption_case',${key("open", openId)},'Open','Open',true,false,false),
          (${closeId}::uuid,'adoption_case',${key("closed", closeId)},'Closed','Closed',true,true,false),
          (${outcomeId}::uuid,'final_outcome',${key("outcome", outcomeId)},'Adopted','Adopted',true,true,true)`;
        await tx`insert into public.supporter(id,name,email) values(${supporter}::uuid,'Synthetic',${supporter + "@example.invalid"})`;
        await tx`insert into public.adopter_profile(id,supporter_id,name_english) values(${profile}::uuid,${supporter}::uuid,'Synthetic')`;
        await tx`insert into public.animals(id,type,name,gender,age,status,publication_state) values(${animal}::uuid,'cat','Synthetic','female','adult','adopted','draft')`;
        await tx`insert into public.adoption_case(id,status_id,applicant_name,applicant_phone,closed_at) values
          (${caseId}::uuid,${closeId}::uuid,'Closed Case','91234567',now()),
          (${finalisedCaseId}::uuid,${closeId}::uuid,'Finalised Case','91234568',now())`;
        await tx`insert into public.successful_adoption(adoption_case_id,animal_id,adopter_profile_id,supporter_id,outcome_status_id,case_number,approval_date) values
          (${finalisedCaseId}::uuid,${animal}::uuid,${profile}::uuid,${supporter}::uuid,${outcomeId}::uuid,${key("AC", finalisedCaseId)},current_date)`;

        const refusal = async (id: string, statusId: string, note: string | null) => {
          try {
            await tx.savepoint(async (sp) => {
              await sp`select public.change_adoption_case_status(${id}::uuid,${statusId}::uuid,${actor}::uuid,${note},null)`;
            });
          } catch (error) {
            return (error as Error).message;
          }
          return null;
        };

        // A finalised case is refused whatever the status or note.
        expect(await refusal(finalisedCaseId, openId, "returned to screening")).toContain(
          "Finalized adoption case status cannot change",
        );
        expect(await refusal(finalisedCaseId, closeId, "rejected")).toContain(
          "Finalized adoption case status cannot change",
        );
        // A reopen with no or a blank note is refused; the case stays closed.
        expect(await refusal(caseId, openId, null)).toContain("reason_required");
        expect(await refusal(caseId, openId, "   ")).toContain("reason_required");
        expect(
          (
            await tx`select status_id,closed_at from public.adoption_case where id=${caseId}::uuid`
          )[0].status_id,
        ).toBe(closeId);
        // With a reason it reopens and clears closed_at.
        expect(await refusal(caseId, openId, "Applicant came back")).toBeNull();
        expect(
          (
            await tx`select status_id,closed_at from public.adoption_case where id=${caseId}::uuid`
          )[0],
        ).toMatchObject({ status_id: openId, closed_at: null });
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
