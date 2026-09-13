import { SQL } from "bun";
import { expect, test } from "bun:test";
import { initialPolicyCatalogue } from "./catalogue";
const url = process.env.VOLUNTEER_TEST_DATABASE_URL;
if (url) {
  const u = new URL(url);
  if (
    u.hostname !== "127.0.0.1" ||
    u.port !== "56322" ||
    u.pathname !== "/postgres" ||
    u.search ||
    u.hash
  )
    throw new Error("Isolated56322 required");
}
test.skipIf(!url || process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
  "common→shelter→template resolution, registry references and stale source publication",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    let complete = false;
    try {
      await db.begin(async (tx) => {
        const actor = crypto.randomUUID(),
          suffix = actor.replaceAll("-", "");
        await tx`insert into auth.users(id,email,email_confirmed_at)values(${actor}::uuid,${actor + "@example.invalid"},now())`;
        await tx`insert into public.admin_user(auth_user_id,email,role)values(${actor}::uuid,${actor + "@example.invalid"},'admin')`;
        const sc = async (command: object) =>
          (
            await tx`select public.volunteer_policy_source_command(${actor}::uuid,${JSON.stringify(command)}::jsonb) as r`
          )[0].r;
        const pc = async (command: object) =>
          (
            await tx`select public.volunteer_policy_command(${actor}::uuid,${JSON.stringify(command)}::jsonb) as r`
          )[0].r;
        const optionalParent = {
          booking: {
            scenario_templates: { with_group: "cat-cleaning-a", without_group: "cat-cleaning-b" },
          },
        };
        const optionalChild = { booking: {}, inheritance: ["booking.scenario_templates"] };
        const optionalResolved = (
          await tx`select public.volunteer_apply_source_fields(${JSON.stringify(optionalChild)}::jsonb,${JSON.stringify(optionalParent)}::jsonb,'template','{}'::jsonb) as r`
        )[0].r;
        expect(optionalResolved.value.booking.scenario_templates).toEqual(
          optionalParent.booking.scenario_templates,
        );
        const overlappingChild = {
          booking: {},
          inheritance: ["booking", "booking.scenario_templates"],
        };
        const overlappingResolved = (
          await tx`select public.volunteer_apply_source_fields(${JSON.stringify(overlappingChild)}::jsonb,${JSON.stringify(optionalParent)}::jsonb,'template','{}'::jsonb) as r`
        )[0].r;
        expect(overlappingResolved.value.booking).toEqual(optionalParent.booking);
        const base = structuredClone(initialPolicyCatalogue[0]);
        base.template_key = "source-" + suffix;
        base.capacity.volunteers = { state: "value", value: 6 };
        expect(
          (
            await pc({
              action: "save",
              template_key: base.template_key,
              expected_revision: 0,
              body: base,
            })
          ).kind,
        ).toBe("saved");
        const publishSource = async (
          scope_key: string,
          template_key: string,
          draft_revision: number,
          expected_revision: number,
        ) => {
          const preview = await sc({
            action: "preview_source",
            scope_key,
            template_key,
            draft_revision,
            expected_revision,
          });
          expect(preview.kind).toBe("preview");
          const command = {
            action: "publish_source",
            preview_id: preview.preview_id,
            idempotency_key: crypto.randomUUID(),
            reason: "Synthetic source review",
          };
          const result = await sc(command);
          expect(result.kind).toBe("published");
          expect(await sc(command)).toEqual(result);
          return result;
        };
        const commonRevision = Number(
          (
            await tx`select revision from public.volunteer_policy_source where scope_key='common'`
          )[0]?.revision ?? 0,
        );
        await publishSource("common", base.template_key, 1, commonRevision);
        const shelter = "site-" + suffix;
        expect(
          (
            await sc({
              action: "registry_save",
              kind: "shelter",
              key: shelter,
              label: "Synthetic site",
              timezone: "Asia/Hong_Kong",
              location: "Synthetic location",
              expected_revision: 0,
              reason: "Synthetic site",
            })
          ).kind,
        ).toBe("saved");
        expect(
          (
            await sc({
              action: "registry_save",
              kind: "credential",
              key: "skill-" + suffix,
              label: "Synthetic skill",
              expected_revision: 0,
              reason: "Synthetic skill",
            })
          ).kind,
        ).toBe("saved");
        const site = structuredClone(base);
        site.template_key = "site-source-" + suffix;
        site.shelter = shelter;
        site.inheritance = ["capacity.volunteers"];
        site.eligibility.min_age = 25;
        await pc({
          action: "save",
          template_key: site.template_key,
          expected_revision: 0,
          body: site,
        });
        await publishSource(shelter, site.template_key, 1, 0);
        const child = structuredClone(site);
        child.template_key = "inherited-" + suffix;
        child.capacity.volunteers = { state: "value", value: 0 };
        child.eligibility.min_age = 0;
        child.inheritance = ["capacity.volunteers", "eligibility.min_age"];
        await pc({
          action: "save",
          template_key: child.template_key,
          expected_revision: 0,
          body: child,
        });
        const resolved = await sc({ action: "resolve", body: child });
        expect(resolved.body.capacity.volunteers.value).toBe(6);
        expect(resolved.body.eligibility.min_age).toBe(25);
        expect(resolved.body.inheritance).toBeUndefined();
        expect(resolved.provenance["capacity.volunteers"]).toBe("common");
        const command = {
          action: "preview",
          template_key: child.template_key,
          expected_revision: 1,
          effective_from: new Date(Date.now() + 86400000).toISOString(),
          effective_until: null,
          activity_ids: [],
        };
        const preview = await pc(command);
        expect(preview.kind).toBe("preview");
        const published = await pc({
          action: "publish",
          preview_id: preview.preview_id,
          idempotency_key: crypto.randomUUID(),
          reason: "Synthetic effective snapshot",
        });
        expect(published.kind).toBe("published");
        const generated = await pc({
          action: "generate",
          template_key: child.template_key,
          date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
          idempotency_key: crypto.randomUUID(),
        });
        expect(generated.kind).toBe("generated");
        const [session] =
          await tx`select shelter_key,capacity from public.volunteer_activity where id=${generated.activity_id}::uuid`;
        expect(session.shelter_key).toBe(shelter);
        expect(session.capacity).toBe(6);
        const stale = await pc(command);
        expect(stale.kind).toBe("preview");
        base.capacity.volunteers = { state: "value", value: 8 };
        await pc({
          action: "save",
          template_key: base.template_key,
          expected_revision: 1,
          body: base,
        });
        await publishSource("common", base.template_key, 2, commonRevision + 1);
        expect(
          (
            await pc({
              action: "publish",
              preview_id: stale.preview_id,
              idempotency_key: crypto.randomUUID(),
              reason: "Stale source",
            })
          ).kind,
        ).toBe("conflict");
        const updated = await sc({ action: "resolve", body: child });
        expect(updated.body.capacity.volunteers.value).toBe(8);
        const [fact] =
          await tx`select body,provenance from public.volunteer_policy_version where id=${published.version_id}::uuid`;
        expect(fact.body.capacity.volunteers.value).toBe(6);
        expect(fact.provenance.source_revisions.common).toBeTruthy();
        const invalid = structuredClone(base);
        invalid.eligibility.credentials = { mode: "all", keys: ["missing_credential"] };
        expect(
          (
            await tx`select public.volunteer_validate_policy(${JSON.stringify(invalid)}::jsonb) as issues`
          )[0].issues,
        ).toContain("unknown_credential:missing_credential");
        complete = true;
        throw new Error("rollback sources fixture");
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "rollback sources fixture") throw error;
    } finally {
      await db.close({ timeout: 1 });
    }
    expect(complete).toBe(true);
  },
);
