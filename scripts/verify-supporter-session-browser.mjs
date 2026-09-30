import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";

// Actual browser SDK + application factory, synthetic transport only. No provider request.
const browser = await chromium.launch();
const context = await browser.newContext();
const result = {
  status: "failed",
  environment:
    "Chromium / actual installed Supabase SDK / same-origin localStorage and Web Locks / synthetic Auth transport",
  providerRequests: 0,
};
try {
  const a = await context.newPage(),
    b = await context.newPage();
  let releaseA, startedA;
  const started = new Promise((resolve) => {
    startedA = resolve;
  });
  const held = new Promise((resolve) => {
    releaseA = resolve;
  });
  const errors = [];
  for (const page of [a, b]) {
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/auth/v1/**", async (route) => {
      if (route.request().url().includes("/auth/v1/logout")) {
        await route.fulfill({ status: 204 });
        return;
      }
      assert.ok(
        route.request().url().endsWith("/auth/v1/user"),
        "No refresh/provider endpoint may be reached",
      );
      const authorization = route.request().headers().authorization;
      const sub = JSON.parse(Buffer.from(authorization.split(".")[1], "base64url").toString()).sub;
      if (sub === "a") {
        startedA();
        await held;
      }
      await route.fulfill({
        json: {
          id: sub,
          aud: "authenticated",
          role: "authenticated",
          email: sub + "@example.invalid",
          email_confirmed_at: "2026-01-01T00:00:00Z",
          user_metadata: {},
          app_metadata: {},
          created_at: "2026-01-01T00:00:00Z",
        },
      });
    });
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === "http://127.0.0.1:56553" || url.pathname.includes("/auth/v1/"))
        await route.fallback();
      else await route.abort();
    });
    await page.goto("http://127.0.0.1:56553/scripts/fixtures/supporter-recovery.html");
    await page.evaluate(async () => {
      // The query bypasses the UI fixture's synthetic factory, preserving actual source/options.
      window.actualRecovery = await import("/src/lib/supabase.ts?actual-session-fence");
      window.actualClient = window.actualRecovery.getSupabaseClient();
      await window.actualClient.auth.getSession();
      window.actualEvents = [];
      window.actualClient.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_IN") window.actualEvents.push(session?.user.id);
      });
      window.syntheticTokens = (sub) => {
        const encode = (value) =>
          btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
        return {
          access_token:
            encode({ alg: "HS256", typ: "JWT" }) +
            "." +
            encode({
              sub,
              exp: Math.floor(Date.now() / 1000) + 3600,
              aud: "authenticated",
              role: "authenticated",
            }) +
            ".synthetic-signature",
          refresh_token: "synthetic-" + sub,
        };
      };
    });
  }
  assert.equal(await a.evaluate(() => Boolean(navigator.locks)), true);
  await a.evaluate(async () => {
    const snapshot = await window.actualRecovery.captureRecoverySessionAttempt(() => true);
    window.pendingRecovery = window.actualRecovery
      .installRecoverySession(window.syntheticTokens("a"), () => true, snapshot)
      .then(
        () => "unexpected-success",
        (error) => error.constructor.name,
      );
  });
  await started;
  assert.equal(
    await b.evaluate(
      async () => (await window.actualClient.auth.setSession(window.syntheticTokens("b"))).error,
    ),
    null,
  );
  releaseA();
  assert.equal(await a.evaluate(() => window.pendingRecovery), "StaleRecoverySessionError");
  assert.equal(
    await a.evaluate(
      async () => (await window.actualClient.auth.getSession()).data.session?.user.id,
    ),
    "b",
  );
  assert.equal(
    await b.evaluate(
      async () => (await window.actualClient.auth.getSession()).data.session?.user.id,
    ),
    "b",
  );
  assert.equal(await a.evaluate(() => window.actualEvents.includes("a")), false);
  assert.equal(
    await a.evaluate(() => {
      const keys = Object.keys(localStorage).filter((key) => /^sb-.*-auth-token$/.test(key));
      return keys.length === 1 && JSON.parse(localStorage.getItem(keys[0])).user.id === "b";
    }),
    true,
    "SDK default session key preserved",
  );
  result.crossTabNewActorPreserved = true;
  result.noStaleSignedInEvent = true;
  result.existingSdkStorageKeyCompatible = true;
  assert.equal(
    await a.evaluate(async () => {
      try {
        await window.actualRecovery.captureRecoverySessionAttempt(() => true);
        return "unexpected-success";
      } catch (error) {
        return error.constructor.name;
      }
    }),
    "StaleRecoverySessionError",
  );
  await b.evaluate(() => window.actualClient.auth.signOut({ scope: "local" }));
  await a.evaluate(async () => {
    window.httpSnapshot = await window.actualRecovery.captureRecoverySessionAttempt(() => true);
  });
  await b.evaluate(() => window.actualClient.auth.setSession(window.syntheticTokens("b")));
  assert.equal(
    await a.evaluate(async () => {
      try {
        await window.actualRecovery.installRecoverySession(
          window.syntheticTokens("a"),
          () => true,
          window.httpSnapshot,
        );
        return "unexpected-success";
      } catch (error) {
        return error.constructor.name;
      }
    }),
    "StaleRecoverySessionError",
  );
  assert.equal(
    await a.evaluate(
      async () => (await window.actualClient.auth.getSession()).data.session.user.id,
    ),
    "b",
  );
  result.actorChangeDuringHttpWaitRefused = true;
  const runtimeQuota = await a.evaluate(async () => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Synthetic runtime quota", "QuotaExceededError");
    };
    const signedOut = await window.actualClient.auth.signOut({ scope: "local" });
    return {
      error: signedOut.error,
      session: (await window.actualClient.auth.getSession()).data.session,
    };
  });
  assert.deepEqual(runtimeQuota, { error: null, session: null });
  result.runtimeQuotaLogoutRemovesCredentials = true;
  const unavailable = await context.newPage();
  await unavailable.goto("http://127.0.0.1:56553/scripts/fixtures/supporter-recovery.html");
  await unavailable.evaluate(() => Object.defineProperty(navigator, "locks", { value: undefined }));
  const refusal = await unavailable.evaluate(async () => {
    const m = await import("/src/lib/supabase.ts?actual-session-fence-no-locks");
    const encode = (v) => btoa(JSON.stringify(v)).replaceAll("=", "");
    const tokens = {
      access_token:
        encode({ alg: "HS256" }) +
        "." +
        encode({ sub: "c", exp: Math.floor(Date.now() / 1000) + 3600 }) +
        ".synthetic-signature",
      refresh_token: "synthetic-c",
    };
    try {
      await m.captureRecoverySessionAttempt(() => true);
      return "unexpected-success";
    } catch (error) {
      return error.constructor.name;
    }
  });
  assert.equal(refusal, "RecoverySessionUnavailableError");
  result.missingWebLocksFailsClosed = true;
  const quota = await context.newPage();
  await quota.route("**/auth/v1/user", async (route) =>
    route.fulfill({
      json: {
        id: "q",
        aud: "authenticated",
        role: "authenticated",
        email: "q@example.invalid",
        user_metadata: {},
        app_metadata: {},
        created_at: "2026-01-01T00:00:00Z",
      },
    }),
  );
  await quota.goto("http://127.0.0.1:56553/scripts/fixtures/supporter-recovery.html");
  await quota.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Synthetic quota", "QuotaExceededError");
    };
  });
  const fallback = await quota.evaluate(async () => {
    const m = await import("/src/lib/supabase.ts?actual-session-fence-quota");
    const client = m.getSupabaseClient();
    const encode = (v) => btoa(JSON.stringify(v)).replaceAll("=", "");
    const tokens = {
      access_token:
        encode({ alg: "HS256" }) +
        "." +
        encode({ sub: "q", exp: Math.floor(Date.now() / 1000) + 3600, aud: "authenticated" }) +
        ".synthetic-signature",
      refresh_token: "synthetic-q",
    };
    const installed = await client.auth.setSession(tokens);
    let recovery;
    try {
      await m.captureRecoverySessionAttempt(() => true);
      recovery = "unexpected-success";
    } catch (error) {
      recovery = error.constructor.name;
    }
    return {
      error: installed.error,
      actor: (await client.auth.getSession()).data.session?.user.id,
      recovery,
    };
  });
  assert.deepEqual(fallback, {
    error: null,
    actor: "q",
    recovery: "RecoverySessionUnavailableError",
  });
  result.unwritableStorageKeepsOrdinaryAuthFallback = true;
  assert.deepEqual(errors, []);
  result.status = "passed";
} finally {
  await context.close();
  await browser.close();
  await writeFile(
    "docs/evidence/audit-remediation-20260927/t22-session-browser.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
}
