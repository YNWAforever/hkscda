import { SQL } from "bun";
import { expect, test } from "bun:test";
const url = process.env.VOLUNTEER_TEST_DATABASE_URL;
if (
  url &&
  (new URL(url).hostname !== "127.0.0.1" ||
    new URL(url).port !== "56322" ||
    new URL(url).pathname !== "/postgres")
)
  throw new Error("Dedicated isolated database required");
test.skipIf(!url || process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES !== "1")(
  "OPS02 independent internship intake/student verification/roles/idempotency/history",
  async () => {
    const db = new SQL(url!, { max: 1, prepare: false });
    const admin = crypto.randomUUID(),
      staff = crypto.randomUUID(),
      student = crypto.randomUUID(),
      other = crypto.randomUUID();
    const command = async (actor: string, body: object) =>
      (
        await db`select public.internship_command(${actor}::uuid,${JSON.stringify(body)}::jsonb) result`
      )[0].result;
    try {
      for (const actor of [admin, staff, student, other])
        await db`insert into auth.users(id,email,email_confirmed_at) values(${actor}::uuid,${actor + "@example.invalid"},now())`;
      await db`insert into public.admin_user(auth_user_id,email,role,status) values(${admin}::uuid,${admin + "@example.invalid"},'admin','active'),(${staff}::uuid,${staff + "@example.invalid"},'staff','active')`;
      const initial = await command(admin, { action: "settings" });
      const body = { ...initial.draft.body, enabled: true };
      expect(
        (
          await command(admin, {
            action: "save_intake",
            expected_revision: initial.draft.revision,
            body,
          })
        ).kind,
      ).toBe("saved");
      const preview = await command(admin, {
        action: "preview_intake",
        expected_revision: initial.draft.revision + 1,
      });
      expect(preview.after.enabled).toBe(true);
      let forbidden = false;
      try {
        await command(staff, {
          action: "publish_intake",
          preview_id: preview.preview_id,
          reason: "Forbidden",
          idempotency_key: crypto.randomUUID(),
        });
      } catch {
        forbidden = true;
      }
      expect(forbidden).toBe(true);
      const published = await command(admin, {
        action: "publish_intake",
        preview_id: preview.preview_id,
        reason: "Synthetic isolated intake acceptance",
        idempotency_key: crypto.randomUUID(),
      });
      expect(published.kind).toBe("published");
      const input = {
        action: "submit",
        intake_version_id: published.version_id,
        name: "Synthetic veterinary student",
        phone: "00000000",
        institution: "Synthetic University",
        course: "Veterinary medicine",
        shelter: "cat",
        statement: "Isolated student evidence",
        veterinary_student: false,
        idempotency_key: crypto.randomUUID(),
      };
      expect((await command(student, input)).reason).toBe("veterinary_student_required");
      input.veterinary_student = true;
      const submitted = await command(student, input);
      expect(submitted.kind).toBe("submitted");
      expect(await command(student, input)).toEqual(submitted);
      expect((await command(other, { action: "mine" })).applications).toHaveLength(0);
      const app = (await command(student, { action: "mine" })).applications[0];
      expect(app.contact_snapshot.email).toBe(student + "@example.invalid");
      expect(
        (
          await db`select count(*)::int n from public.volunteer_profile where auth_user_id=${student}::uuid`
        )[0].n,
      ).toBe(0);
      const review = {
        action: "review",
        application_id: app.id,
        expected_revision: 1,
        status: "approved",
        reason: "Synthetic school evidence reviewed",
        student_verified: false,
        evidence: "",
        idempotency_key: crypto.randomUUID(),
      };
      expect((await command(staff, review)).reason).toBe("verified_student_evidence_required");
      review.student_verified = true;
      review.evidence = "School enrolment verified in synthetic fixture";
      expect((await command(staff, review)).kind).toBe("updated");
      expect(await command(staff, review)).toEqual(expect.objectContaining({ revision: 2 }));
      expect((await command(student, { action: "mine" })).applications[0].status).toBe("approved");
      let immutable = false;
      try {
        await db`update public.internship_application set student_snapshot='{}' where id=${app.id}::uuid`;
      } catch {
        immutable = true;
      }
      expect(immutable).toBe(true);
      expect(
        (
          await db`select has_table_privilege('anon','public.internship_attachment','select') allowed`
        )[0].allowed,
      ).toBe(false);
      expect(
        (await db`select public from storage.buckets where id='internship-private'`)[0].public,
      ).toBe(false);
      expect(
        (
          await command(student, {
            action: "withdraw",
            application_id: app.id,
            expected_revision: 2,
            idempotency_key: crypto.randomUUID(),
          })
        ).kind,
      ).toBe("updated");
      expect((await command(student, { action: "mine" })).applications[0].events).toHaveLength(3);
      // Restore the original intake through a new version, preserving the synthetic application/history.
      const latest = await command(admin, { action: "settings" });
      await command(admin, {
        action: "save_intake",
        expected_revision: latest.draft.revision,
        body: initial.draft.body,
      });
      const restore = await command(admin, {
        action: "preview_intake",
        expected_revision: latest.draft.revision + 1,
      });
      await command(admin, {
        action: "publish_intake",
        preview_id: restore.preview_id,
        reason: "Restore isolated intake after acceptance",
        idempotency_key: crypto.randomUUID(),
      });
    } finally {
      await db.close();
    }
  },
  30000,
);
