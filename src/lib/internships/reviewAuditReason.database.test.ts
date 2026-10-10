import { SQL } from "bun";
import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

/**
 * Runs only against an isolated, disposable Postgres on 127.0.0.1 that already has the SP-5b-2
 * internship-review-audit-reason migration applied. Never point it at the shared local stack
 * (port 55321).
 */
const url = process.env.SP5B2_INTERNSHIP_REASON_TEST_DATABASE_URL;
if (url) {
  const target = new URL(url);
  if (
    target.protocol !== "postgresql:" ||
    target.hostname !== "127.0.0.1" ||
    target.port === "55321" ||
    target.search ||
    target.hash
  )
    throw new Error("Dedicated disposable database required");
}

const rollback = new Error("rollback internship review reason fixture");

async function inRollback(run: (tx: SQL) => Promise<void>) {
  const db = new SQL(url!, { max: 1, prepare: false });
  try {
    await db.begin(async (tx) => {
      await run(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    await db.close();
  }
}

async function submittedApplication(tx: SQL) {
  const admin = randomUUID();
  const student = randomUUID();
  const command = async (actor: string, body: object) =>
    (
      await tx`select public.internship_command(${actor}::uuid,${JSON.stringify(body)}::jsonb) result`
    )[0].result;
  for (const actor of [admin, student])
    await tx`insert into auth.users(id,email,email_confirmed_at) values(${actor}::uuid,${actor + "@example.invalid"},now())`;
  await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${admin}::uuid,${admin + "@example.invalid"},'admin','active')`;
  const initial = await command(admin, { action: "settings" });
  await command(admin, {
    action: "save_intake",
    expected_revision: initial.draft.revision,
    body: { ...initial.draft.body, enabled: true },
  });
  const preview = await command(admin, {
    action: "preview_intake",
    expected_revision: initial.draft.revision + 1,
  });
  const published = await command(admin, {
    action: "publish_intake",
    preview_id: preview.preview_id,
    reason: "Synthetic isolated intake acceptance",
    idempotency_key: randomUUID(),
  });
  await command(student, {
    action: "submit",
    intake_version_id: published.version_id,
    name: "Synthetic veterinary student",
    phone: "00000000",
    institution: "Synthetic University",
    course: "Veterinary medicine",
    shelter: "cat",
    statement: "Isolated student evidence",
    veterinary_student: true,
    idempotency_key: randomUUID(),
  });
  const app = (await command(student, { action: "mine" })).applications[0];
  return { admin, app: app.id as string, command };
}

async function reviewAuditDetails(tx: SQL, app: string): Promise<Record<string, unknown>[]> {
  const rows =
    await tx`select detail from public.audit_log where action='internship.review' and entity_id=${app}`;
  return rows.map((row: { detail: Record<string, unknown> }) => row.detail);
}

test.skipIf(!url)(
  "a rejection stores its status and trimmed reason in audit_log.detail",
  async () => {
    await inRollback(async (tx) => {
      const f = await submittedApplication(tx);
      const key = randomUUID();
      const review = {
        action: "review",
        application_id: f.app,
        expected_revision: 1,
        status: "rejected",
        reason: "  not a veterinary student  ",
        student_verified: false,
        evidence: "",
        idempotency_key: key,
      };
      const result = await f.command(f.admin, review);
      expect(result.kind).toBe("updated");
      const details = await reviewAuditDetails(tx, f.app);
      expect(details).toHaveLength(1);
      expect(details[0]).toMatchObject({
        kind: "updated",
        status: "rejected",
        reason: "not a veterinary student",
      });
      // A replay returns the stored result unchanged and writes no second audit row.
      expect(await f.command(f.admin, review)).toEqual(result);
      expect(await reviewAuditDetails(tx, f.app)).toHaveLength(1);
    });
  },
);

test.skipIf(!url)("a non-review command keeps its result as the audit detail", async () => {
  await inRollback(async (tx) => {
    const f = await submittedApplication(tx);
    const rows =
      await tx`select detail from public.audit_log where action='internship.submit' and entity_id=${f.app}`;
    expect(rows).toHaveLength(1);
    expect(rows[0].detail).not.toHaveProperty("reason");
  });
});
