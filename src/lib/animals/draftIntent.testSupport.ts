/** Task 5 only: SQL actors and inert Storage; no remote client is constructed. */
import type { SQL } from "bun";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

export async function savepoint<T>(tx: SQL, run: (sql: SQL) => Promise<T>): Promise<T> {
  const name = "r01_sp_" + randomUUID().replaceAll("-", "");
  await tx.unsafe(`savepoint ${name}`);
  try {
    const result = await run(tx);
    await tx.unsafe(`release savepoint ${name}`);
    return result;
  } catch (error) {
    await tx.unsafe(`rollback to savepoint ${name}`);
    await tx.unsafe(`release savepoint ${name}`);
    throw error;
  }
}
export async function seedAnimal(tx: SQL) {
  const actor = randomUUID(),
    animal = randomUUID(),
    other = randomUUID();
  for (const id of [actor, other])
    await tx`insert into auth.users(id,email,email_confirmed_at) values(${id}::uuid,${id + "@example.invalid"},now())`;
  await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor + "@example.invalid"},'staff','active')`;
  await tx`insert into public.animals(id,type,name,gender,age,adoption_eligible,sponsorship_eligible,publication_state) values(${animal}::uuid,'cat','Synthetic preserved animal','female','adult',true,true,'draft')`;
  return { actor, animal, other };
}
export async function seedLinkedAnimalFacts(tx: SQL, animal: string) {
  const supporter = randomUUID(),
    pledge = randomUUID(),
    application = randomUUID(),
    adoptionCase = randomUUID();
  const match = randomUUID(),
    followup = randomUUID(),
    caseStatus = randomUUID(),
    matchStatus = randomUUID(),
    followupStatus = randomUUID();
  await tx`update public.animals set publication_state='published' where id=${animal}::uuid`;
  await tx`insert into public.supporter(id,name) values(${supporter}::uuid,'Synthetic preserved sponsor')`;
  await tx`insert into public.sponsorship_pledge(id,supporter_id,monthly_tier,amount_cents,language) values(${pledge}::uuid,${supporter}::uuid,'100',10000,'zh-HK')`;
  await tx`insert into public.sponsorship_preference(pledge_id,sponsor_animal_id,rank,animal_name_snapshot,animal_type_snapshot) values(${pledge}::uuid,${animal}::uuid,1,'Synthetic preserved animal','cat')`;
  await tx`insert into public.adoption_applications(id,animal_id,animal_name,animal_type,applicant_name,phone,email,address,housing_type,reason) values(${application}::uuid,${animal}::uuid,'Synthetic animal','cat','Synthetic adopter','00000000','synthetic@example.invalid','Synthetic address','synthetic','Synthetic reason')`;
  await tx`insert into public.adoption_application_animal_preference(public_application_id,animal_id,rank,animal_name_snapshot,animal_type_snapshot) values(${application}::uuid,${animal}::uuid,1,'Synthetic retained preference','cat')`;
  for (const [id, category] of [
    [caseStatus, "adoption_case"],
    [matchStatus, "match"],
    [followupStatus, "followup"],
  ])
    await tx`insert into public.coordinator_status(id,category,key,label_zh,label_en) values(${id}::uuid,${category},${"synthetic_" + id.replaceAll("-", "")},'Synthetic','Synthetic')`;
  await tx`insert into public.adoption_case(id,status_id,applicant_name,applicant_phone,public_application_id,requested_animal_id) values(${adoptionCase}::uuid,${caseStatus}::uuid,'Synthetic adopter','00000000',${application}::uuid,${animal}::uuid)`;
  await tx`insert into public.animal_match(id,adoption_case_id,animal_id,status_id) values(${match}::uuid,${adoptionCase}::uuid,${animal}::uuid,${matchStatus}::uuid)`;
  await tx`insert into public.adoption_followup(id,adoption_case_id,animal_id,status_id,title) values(${followup}::uuid,${adoptionCase}::uuid,${animal}::uuid,${followupStatus}::uuid,'Synthetic retained followup')`;
  return { supporter, pledge, application, adoptionCase, match, followup };
}
export async function linkedAnimalFacts(tx: SQL, animal: string) {
  const [row] = await tx`select jsonb_build_object(
    'profile',(select jsonb_agg(to_jsonb(t)) from public.animal_profile_internal t where animal_id=${animal}::uuid),
    'draft',(select jsonb_agg(to_jsonb(t)) from public.animal_draft t where id=${animal}::uuid),
    'sponsor',(select jsonb_agg(to_jsonb(t)) from public.sponsorship_preference t where sponsor_animal_id=${animal}::uuid),
    'match',(select jsonb_agg(to_jsonb(t)) from public.animal_match t where animal_id=${animal}::uuid),
    'followup',(select jsonb_agg(to_jsonb(t)) from public.adoption_followup t where animal_id=${animal}::uuid),
    'application',(select jsonb_agg(to_jsonb(t)) from public.adoption_applications t where animal_id=${animal}::uuid),
    'adoptionPreference',(select jsonb_agg(to_jsonb(t)) from public.adoption_application_animal_preference t where animal_id=${animal}::uuid)
  ) facts`;
  return row.facts;
}
export async function archive(tx: SQL, actor: string, animal: string, archived = true) {
  return savepoint(tx, async (s) => {
    await s`set local role service_role`;
    const [row] =
      await s`select public.set_animal_archived_with_audit(p_actor_user_id=>${actor}::uuid,p_animal_id=>${animal}::uuid,p_archived=>${archived}) result`;
    await s`set local role postgres`;
    return row.result;
  });
}
export async function expiredIntent(tx: SQL, animal: string, suffix = randomUUID()) {
  const path = animal + "/" + suffix + "/synthetic.jpg";
  await tx`insert into public.animal_draft_image_upload_intent(storage_path,animal_id,created_at,expires_at) values(${path},${animal}::uuid,clock_timestamp()-interval '3 days',clock_timestamp()-interval '2 days')`;
  return path;
}
export async function reserve(tx: SQL, animal: string, path: string) {
  return savepoint(tx, async (s) => {
    await s`set local role service_role`;
    await s`select public.reserve_animal_draft_image_upload(p_animal_id=>${animal}::uuid,p_storage_path=>${path})`;
    await s`set local role postgres`;
  });
}
export function sqlAnimalClient(
  tx: SQL,
  faults: { remove?: Set<string>; finish?: boolean; signed?: boolean } = {},
) {
  const signed: string[] = [],
    removed: string[] = [];
  const client = {
    async rpc(name: string, args: Record<string, unknown>) {
      try {
        if (name === "reserve_animal_draft_image_upload") {
          await reserve(tx, String(args.p_animal_id), String(args.p_storage_path));
          return { data: null, error: null };
        }
        if (name !== "claim_expired_animal_draft_image_uploads") throw new Error("Unexpected RPC");
        const rows = await savepoint(tx, async (s) => {
          await s`set local role service_role`;
          // PostgREST preserves timestamp microseconds; raw Bun Date would lose them.
          const rows =
            await s`select to_jsonb(r) value from public.claim_expired_animal_draft_image_uploads(${String(args.p_cutoff)}::timestamptz,${Number(args.p_limit)}::int) r`;
          await s`set local role postgres`;
          return rows.map((r: { value: unknown }) => r.value);
        });
        return { data: rows, error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
    storage: {
      from(bucket: string) {
        if (bucket !== "animal-draft-images") throw new Error("Unexpected Storage bucket");
        return {
          async createSignedUploadUrl(path: string) {
            const [row] =
              await tx`select count(*)::int count from public.animal_draft_image_upload_intent where storage_path=${path}`;
            if (row.count !== 1) throw new Error("Storage preceded SQL reservation");
            if (faults.signed) return { data: null, error: new Error("inert signed failure") };
            signed.push(path);
            return {
              data: { path, signedUrl: "http://inert.invalid/upload", token: "synthetic" },
              error: null,
            };
          },
          async remove(paths: string[]) {
            removed.push(...paths);
            return {
              error: paths.some((p) => faults.remove?.has(p))
                ? new Error("ambiguous inert removal")
                : null,
            };
          },
        };
      },
    },
    from(table: string) {
      if (table !== "animal_draft_image_upload_intent") throw new Error("Unexpected table");
      return {
        delete() {
          const values = new Map<string, unknown>();
          const query = {
            eq(key: string, value: unknown) {
              values.set(key, value);
              return query;
            },
            async is(key: string, value: unknown) {
              if (key !== "attached_at" || value !== null || values.size !== 2)
                throw new Error("Unexpected finish predicate");
              if (faults.finish) return { error: new Error("inert finish failure") };
              try {
                await savepoint(tx, async (s) => {
                  await s`set local role service_role`;
                  await s`delete from public.animal_draft_image_upload_intent where storage_path=${String(values.get("storage_path"))} and cleanup_claimed_at=${String(values.get("cleanup_claimed_at"))}::timestamptz and attached_at is null`;
                  await s`set local role postgres`;
                });
                return { error: null };
              } catch (error) {
                return { error };
              }
            },
          };
          return query;
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, signed, removed };
}
