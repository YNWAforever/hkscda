import { expect, test } from "bun:test";
import {
  verifyVolunteerAttendanceTarget,
  type VolunteerAttendanceTargetEvidence,
} from "./volunteer-attendance-work";

test.skipIf(process.env.VOLUNTEER_DW_FIXTURE_ACCEPTANCE!=="1")(
 "the owned daily-work session has pending, approved, waitlisted, cancelled and existing attendance cases",
 async()=>{
  const target=verifyVolunteerAttendanceTarget(await Bun.file(".local-policy-test/volunteer-daily-work-20261016/target-proof.json").json());
  const c=await Bun.file(".local-policy-test/volunteer-performance-20261015-credentials.json").json();
  const m=await Bun.file(target.manifestPath).json(),connection=new URL(c.DB_URL);
  expect(c.API_URL).toBe(target.apiOrigin);expect(m.fixtureId).toBe(target.runId);
  expect(connection.hostname).toBe(target.database.host);expect(Number(connection.port)).toBe(target.database.port);
  expect(connection.pathname.slice(1)).toBe(target.database.name);
  const {SQL}=await import("bun");const db=new SQL(c.DB_URL,{max:1,prepare:false});
  try{
   const row=(await db`select count(*) filter(where status='pending')::int pending,
    count(*) filter(where status='approved')::int approved,count(*) filter(where status='waitlisted')::int waitlisted,
    count(*) filter(where status='cancelled')::int cancelled,count(*) filter(where attendance_status<>'not_marked')::int recorded
    from public.volunteer_registration where activity_id=${m.cases.rosterActivityId}::uuid`)[0];
   expect(row.pending).toBeGreaterThanOrEqual(1);
   expect(row.approved).toBeGreaterThanOrEqual(1);expect(row.waitlisted).toBe(1);
   expect(row.cancelled).toBe(1);expect(row.recorded).toBeGreaterThanOrEqual(1);
  }finally{await db.close();}
 });

const worktree =
  "C:\\Users\\laich\\Documents\\HKCSDA\\HKCSDA\\hkscda\\.worktrees\\volunteer-admin-20261013";
const project = "hkscda-volunteer-perf-20261015";
const runId = "0939e5aa-2adb-45db-8ad1-de58ad146be9";
function proof(): VolunteerAttendanceTargetEvidence {
  return {
    worktree,
    runId,
    project,
    networkId: "a".repeat(64),
    apiOrigin: "http://127.0.0.1:56321",
    database: { host: "127.0.0.1", port: 56322, name: "postgres" },
    manifestPath: `${worktree}\\.local-policy-test\\volunteer-daily-work-20261016\\manifest.json`,
    containers: (["db", "kong", "auth", "rest"] as const).map((kind, index) => ({
      kind,
      id: String(index + 1).repeat(64),
      name: `supabase_${kind}_${project}`,
      project,
      workdir: `${worktree}\\node_modules\\.codex-volunteer-perf-20261015`,
      networkId: "a".repeat(64),
      publishedPort: kind === "db" ? 56322 : kind === "kong" ? 56321 : null,
    })),
    upstreams: {
      kongAuth: `http://supabase_auth_${project}:9999/`,
      kongRest: `http://supabase_rest_${project}:3000/`,
      authDatabase: `supabase_db_${project}`,
      restDatabase: `supabase_db_${project}`,
      authDatabaseName: "postgres",
      restDatabaseName: "postgres",
    },
    ownership: { mode: "new-run", runId, existingRecordIds: [] },
  };
}

test("accepts cross-checked containers and a new owned manifest without constructing clients", () => {
  const target = verifyVolunteerAttendanceTarget(proof());
  expect(target.apiOrigin).toBe("http://127.0.0.1:56321");
  expect(target.database.port).toBe(56322);
  expect(target.runId).toBe(runId);
  expect(Object.isFrozen(target)).toBe(true);
});

test("localhost alone cannot pass the target identity gate", () => {
  expect(() => verifyVolunteerAttendanceTarget({ apiOrigin: "http://127.0.0.1:56321" })).toThrow();
});

for (const [name, change] of [
  ["production origin", (p) => (p.apiOrigin = "https://iihqjzilgawhfdhdevam.supabase.co")],
  ["another container network", (p) => (p.containers[2].networkId = "b".repeat(64))],
  ["another worktree owner", (p) => (p.containers[1].workdir = "C:\\other-worktree")],
  ["a Kong route to production", (p) => (p.upstreams.kongRest = "https://example.org/rest/v1")],
  ["Auth using another DB", (p) => (p.upstreams.authDatabase = "another-db")],
  ["REST using another database", (p) => (p.upstreams.restDatabaseName = "another")],
  ["a mismatched port binding", (p) => (p.containers[0].publishedPort = 55322)],
  ["a manifest outside the owned lab", (p) => (p.manifestPath = "C:\\other\\manifest.json")],
  ["another fixture run", (p) => (p.ownership.runId = crypto.randomUUID())],
  ["preexisting IDs presented as a new run", (p) => p.ownership.existingRecordIds.push(runId)],
] satisfies Array<[string, (p: VolunteerAttendanceTargetEvidence) => unknown]>) {
  test(`refuses ${name} before any fixture client can be created`, () => {
    const evidence = proof();
    change(evidence);
    expect(() => verifyVolunteerAttendanceTarget(evidence)).toThrow();
  });
}
