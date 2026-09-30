import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";
const syntheticTokens = (sub, expires = 3600) => {
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  return { access_token: encode({alg:"HS256"}) + "." + encode({sub,session_id:"session-"+sub,exp:Math.floor(Date.now()/1000)+expires,aud:"authenticated",role:"authenticated"}) + ".synthetic-signature", refresh_token:"synthetic-"+sub };
};
const syntheticUser = sub => ({id:sub,aud:"authenticated",role:"authenticated",email:sub+"@example.invalid",email_confirmed_at:"2026-01-01T00:00:00Z",user_metadata:{},app_metadata:{},created_at:"2026-01-01T00:00:00Z"});

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
  let releaseLogout, startedLogout;
  const logoutStarted = new Promise((resolve) => {
    startedLogout = resolve;
  });
  const logoutHeld = new Promise((resolve) => {
    releaseLogout = resolve;
  });
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
      if (route.request().url().includes("/auth/v1/token")) {
        const body = route.request().postDataJSON();
        const sub = route.request().url().includes("grant_type=password") ? "b" : body.refresh_token.replace("synthetic-", "");
        await route.fulfill({json:{...syntheticTokens(sub),token_type:"bearer",expires_in:3600,user:syntheticUser(sub)}});
        return;
      }
      if (route.request().url().includes("/auth/v1/logout")) {
        const bearer = route.request().headers().authorization;
        const sub = JSON.parse(Buffer.from(bearer.split(".")[1], "base64url").toString()).sub;
        if (sub === "logout-a") {
          startedLogout();
          await logoutHeld;
        }
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
      window.actualEventKinds = [];
      window.actualActor = null;
      window.actualClient.auth.onAuthStateChange((event, session) => {
        window.actualEventKinds.push(event);
        window.actualActor = session?.user.id ?? null;
        if (event === "SIGNED_IN") window.actualEvents.push(session?.user.id);
      });
      window.syntheticTokens = (sub, expires = 3600) => {
        const encode = (value) =>
          btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
        return {
          access_token:
            encode({ alg: "HS256", typ: "JWT" }) +
            "." +
            encode({
              sub,
              session_id: "session-" + sub,
              exp: Math.floor(Date.now() / 1000) + expires,
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
        () => "success",
        (error) => error.constructor.name,
      );
  });
  await started;
  await b.evaluate(() => {
    window.pendingLogin = window.actualClient.auth.setSession(window.syntheticTokens("b"));
  });
  await b.waitForFunction(async () => (await navigator.locks.query()).pending.some(lock => lock.name.startsWith("hkscda-auth-operation:")));
  releaseA();
  assert.equal(await a.evaluate(() => window.pendingRecovery), "success");
  assert.equal(await b.evaluate(async () => (await window.pendingLogin).error), null);
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
  assert.equal(
    await a.evaluate(() => {
      const keys = Object.keys(localStorage).filter((key) => /^sb-.*-auth-token$/.test(key));
      return keys.length === 1 && JSON.parse(localStorage.getItem(keys[0])).user.id === "b";
    }),
    true,
    "SDK default session key preserved",
  );
  result.crossTabNewActorPreserved = true;
  result.sessionInstallationOperationsSerialized = true;
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
  await a.evaluate(async () => {
    const tokens = window.syntheticTokens("logout-a");
    await window.actualClient.auth.setSession(tokens);
    window.actualEventKinds = [];
    window.pendingLogout = window.actualRecovery.signOutCurrentSession(tokens.access_token).then(
      result => result.error ? "failed" : "success",
      (error) => error.constructor.name,
    );
  });
  await logoutStarted;
  await b.evaluate(() => {
    window.pendingLogin = window.actualClient.auth.signInWithPassword({ email:"b@example.invalid", password:"synthetic-only" });
  });
  await b.waitForFunction(async () => (await navigator.locks.query()).pending.some(lock => lock.name.startsWith("hkscda-auth-operation:")));
  releaseLogout();
  assert.equal(await a.evaluate(() => window.pendingLogout), "success");
  assert.equal(await b.evaluate(async () => (await window.pendingLogin).error), null);
  await a.waitForFunction(() => window.actualActor === "b");
  assert.equal(
    await a.evaluate(
      async () => (await window.actualClient.auth.getSession()).data.session.user.id,
    ),
    "b",
  );
  assert.equal(await a.evaluate(() => window.actualEventKinds.at(-1)), "SIGNED_IN");
  result.lateOldActorLogoutPreservesNewActor = true;
  result.passwordLoginWaitsForLogoutNotification = true;
  const refreshedLogout = await a.evaluate(async () => {
    const tokens = window.syntheticTokens("refresh-a", 30);
    await window.actualClient.auth.setSession(tokens);
    const result = await window.actualRecovery.signOutCurrentSession(tokens.access_token);
    return {error:result.error,session:(await window.actualClient.auth.getSession()).data.session};
  });
  assert.deepEqual(refreshedLogout, {error:null,session:null});
  result.sameSessionRefreshLogout = true;
  await a.evaluate(() => window.actualClient.auth.setSession(window.syntheticTokens("b")));
  const runtimeQuota = await a.evaluate(async () => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Synthetic runtime quota", "QuotaExceededError");
    };
    const { data } = await window.actualClient.auth.getSession();
    const signedOut = await window.actualRecovery.signOutCurrentSession(data.session.access_token);
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
