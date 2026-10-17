import { expect, test } from "bun:test";
import { resolve } from "node:path";

test("an approved registration with failed refresh still says saved and retries only the read", async () => {
  const bundle = await Bun.build({
    entrypoints: [import.meta.dir + "/__test-fixtures__/registrationRefresh.tsx"],
    target: "browser",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "registration-local-auth",
        setup(build) {
          build.onResolve({ filter: /supabase$/ }, (args) =>
            resolve(args.resolveDir, args.path) === resolve(import.meta.dir, "../supabase")
              ? { path: "auth-fixture", namespace: "fixture" }
              : undefined,
          );
          build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            loader: "js",
            contents:
              'export const supabase={auth:{getSession:async()=>({data:{session:{access_token:"fixture",user:{id:"fixture"}}}})}};',
          }));
        },
      },
    ],
  });
  expect(bundle.success).toBe(true);
  let status = "pending",
    reads = 0,
    writes = 0;
  let failedRead = false;
  const registration = () => ({
    id: "00000000-0000-4000-8000-000000000001",
    profileId: null,
    contactName: "Synthetic registration",
    contactEmail: "fixture@example.invalid",
    contactPhone: "00000000",
    status,
    statusReason: null,
    attendanceStatus: "not_marked",
    participantCount: 1,
    registrationType: "individual",
    updatedAt: "2026-10-17T00:00:00.000Z",
    createdAt: "2026-10-16T00:00:00.000Z",
    activity: {
      title: "Synthetic session",
      startsAt: "2026-10-16T00:00:00Z",
      endsAt: "2026-10-16T01:00:00Z",
      status: "published",
      remainingCapacity: 1,
      approvedParticipants: 0,
      capacity: 2,
      waitlistedParticipants: 0,
    },
  });
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/fixture.js")
        return new Response(bundle.outputs[0], { headers: { "content-type": "text/javascript" } });
      if (path.endsWith("/status") && request.method === "PATCH") {
        writes++;
        const body = (await request.json()) as { status: string };
        status = body.status;
        return Response.json({ registration: registration() });
      }
      if (path.startsWith("/api/admin/volunteers/registrations/")) {
        reads++;
        if (writes && !failedRead) {
          failedRead = true;
          return Response.json({ error: "Synthetic refresh failure" }, { status: 503 });
        }
        return Response.json({ registration: registration() });
      }
      return new Response(
        '<div id="root"></div><script type="module" src="/fixture.js"></script>',
        { headers: { "content-type": "text/html" } },
      );
    },
  });
  const child = Bun.spawn(
    [
      "node",
      "--input-type=module",
      "-e",
      `
import {chromium} from "playwright";
const browser=await chromium.launch({channel:"chrome",headless:true});
try{
 const page=await browser.newPage();page.setDefaultTimeout(8000);const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(process.env.REGISTRATION_FIXTURE_ORIGIN);
 await page.getByRole("button",{name:"已批准",exact:true}).click();
 await page.getByRole("button",{name:"重試",exact:true}).waitFor();
 const savedVisible=await page.getByText("已儲存，重新載入失敗。請重新載入資料，毋須重送操作。",{exact:true}).count();
 await page.getByRole("button",{name:"重試",exact:true}).click();
 await page.getByRole("heading",{name:"Synthetic registration",exact:true}).waitFor();
 await page.waitForFunction(()=>!document.body.textContent.includes("已儲存，重新載入失敗。請重新載入資料，毋須重送操作。"));
 console.log(JSON.stringify({savedVisible,approved:await page.getByText("已批准",{exact:true}).count(),errors}));
}finally{await browser.close();}`,
    ],
    {
      env: { ...process.env, REGISTRATION_FIXTURE_ORIGIN: `http://127.0.0.1:${server.port}` },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  try {
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(err).toBe("");
    expect(code).toBe(0);
    const result = JSON.parse(out) as { savedVisible: number; approved: number; errors: string[] };
    expect(result.errors).toEqual([]);
    expect(writes).toBe(1);
    expect(reads).toBe(3);
    expect(status).toBe("approved");
    expect(result.approved).toBeGreaterThan(0);
    expect(result.savedVisible).toBe(1);
  } finally {
    if (child.exitCode === null) child.kill();
    await server.stop(true);
  }
}, 25_000);
