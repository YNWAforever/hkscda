import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const origin = process.env.VOLUNTEER_AUTH_STARTUP_TEST_ORIGIN;
test(
  "workspace navigation shares the shell initial Auth read while retaining fresh API authorization",
  { skip: !origin, timeout: 30_000 },
  async () => {
    assert.equal(origin, "http://127.0.0.1:56338");
    // Verify the existing owned disposable target before creating a real client.
    const containers = JSON.parse(
      execFileSync(
        "docker",
        [
          "inspect",
          "supabase_db_hkscda-volunteer-perf-20261015",
          "supabase_kong_hkscda-volunteer-perf-20261015",
        ],
        { encoding: "utf8" },
      ),
    );
    assert.equal(
      containers[0].Id,
      "97347e44e3b09bf042726fd14bcf9951a64b1ef013e5af6f112943bda39be977",
    );
    assert.equal(
      containers[1].Id,
      "0924d47aec54e1621d14369e1c01f1946711300c6116e9573711404ad49405ec",
    );
    assert.equal(containers[0].NetworkSettings.Ports["5432/tcp"][0].HostPort, "56322");
    assert.equal(containers[1].NetworkSettings.Ports["8000/tcp"][0].HostPort, "56321");
    const credentials = JSON.parse(
      await readFile(".local-policy-test/volunteer-performance-20261015-credentials.json", "utf8"),
    );
    const fixture = JSON.parse(
      await readFile(
        ".local-policy-test/volunteer-performance-20261015-fixture-private.json",
        "utf8",
      ),
    );
    assert.equal(credentials.API_URL, "http://127.0.0.1:56321");
    const actor = fixture.privateActors.find((candidate) => candidate.role === "admin");
    assert.ok(actor, "Owned synthetic admin fixture missing");
    const auth = createClient(credentials.API_URL, credentials.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const login = await auth.auth.signInWithPassword({
      email: actor.email,
      password: actor.password,
    });
    assert.equal(login.error, null);
    assert.ok(login.data.session);
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const blocked = [];
      await context.route(/^https?:\/\/(?!127\.0\.0\.1:(?:56321|56338)(?:\/|$))/, (route) => {
        blocked.push(new URL(route.request().url()).origin);
        return route.abort("blockedbyclient");
      });
      await context.addInitScript(
        ({ key, session }) => {
          localStorage.setItem(key, JSON.stringify(session));
          window.__authStartupSpans = [];
          const request = navigator.locks.request.bind(navigator.locks);
          navigator.locks.request = (name, options, callback) => {
            if (typeof options === "function") {
              callback = options;
              options = {};
            }
            const span = { begin: performance.now() };
            if (name.startsWith("hkscda-auth-operation:")) window.__authStartupSpans.push(span);
            return request(name, options, async (lock) => {
              try {
                return await callback(lock);
              } finally {
                span.end = performance.now();
              }
            });
          };
        },
        { key: auth.auth.storageKey, session: login.data.session },
      );
      const page = await context.newPage();
      let documents = 0;
      page.on("request", (request) => {
        if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents++;
      });
      const listResponse = () =>
        page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === "/api/admin/volunteers/bulk" &&
            response.request().postDataJSON()?.action === "list",
        );
      const first = listResponse();
      await page.goto(origin + "/admin/volunteers/calendar");
      assert.equal((await first).status(), 200);
      await page.locator("#volunteer-page-content h1").waitFor();
      const settle = async () => {
        await page.evaluate(
          () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
        );
        await page.waitForFunction(() =>
          window.__authStartupSpans.every((span) => span.end !== undefined),
        );
      };
      await settle();
      for (const path of ["/admin/volunteers/activities", "/admin/volunteers/calendar"]) {
        const before = await page.evaluate(() => window.__authStartupSpans.length);
        const next = listResponse();
        await page.locator(`.vw-nav-link[href="${path}"]`).click();
        assert.equal((await next).status(), 200);
        await page.locator("#volunteer-page-content h1").waitFor();
        await settle();
        const after = await page.evaluate(() => window.__authStartupSpans.length);
        // Two parent checks, one list token read, one shared INITIAL_SESSION read.
        // The two independent shell subscriptions used five operation locks.
        assert.equal(after - before, 4, "one shared shell initial Auth read per navigation");
        assert.equal(new URL(page.url()).pathname, path);
      }
      assert.equal(documents, 1);
      assert.deepEqual(blocked, []);
    } finally {
      await browser.close();
    }
  },
);
