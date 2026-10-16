import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";

// Real local Auth/HTTP/DB acceptance. The caller proves the target before constructing clients.
export async function verifyDailyWorkBrowser({
  browser,
  fixture,
  actors,
  service,
  local,
  createClient,
  origin,
  sha,
  out,
  onlyCase,
  onlyRole,
  onlyWidth,
}) {
  const results = [],
    receipts = [];
  let stopTarget;
  const save = () =>
    writeFile(
      join(out, "tasks.json"),
      JSON.stringify(
        {
          sha,
          fixtureId: fixture.fixtureId,
          environment: "owned local synthetic Auth/API/DB; external origins blocked",
          results,
          receipts,
        },
        null,
        2,
      ),
    );
  async function select(table, fields, ids, key = "id") {
    const result = await service.from(table).select(fields).in(key, ids).order("id");
    assert.ifError(result.error);
    return result.data;
  }
  async function facts(ids) {
    assert.ok(ids.every((id) => fixture.registrationIds.includes(id)));
    return {
      rows: await select("volunteer_registration", "id,status,attendance_status,updated_at", ids),
      events: await select(
        "volunteer_attendance_event",
        "id,registration_id,actor_user_id,before_fact,after_fact",
        ids,
        "registration_id",
      ),
      audit: await select(
        "audit_log",
        "id,actor_user_id,entity_id,action,detail",
        ids,
        "entity_id",
      ),
    };
  }
  async function api(token, path, body, method = "POST", expected = 200) {
    const response = await fetch(origin + path, {
      method,
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const value = await response.json();
    assert.equal(response.status, expected, JSON.stringify(value));
    return value;
  }
  const bulk = (token, body, expected) =>
    api(token, "/api/admin/volunteers/bulk", body, "POST", expected);
  function fault(action, kind, token, actor, object) {
    try {
      const output = execFileSync(
        "bun",
        ["scripts/fixtures/volunteer-daily-work-fault.ts", action, kind, token, actor, object],
        { encoding: "utf8", windowsHide: true },
      );
      receipts.push({ fault: JSON.parse(output.trim()) });
    } catch (error) {
      if (action === "remove") stopTarget = "Exact fault cleanup failed";
      throw error;
    }
  }
  async function detail(token, page = 1) {
    return bulk(token, {
      action: "detail",
      activity_id: fixture.cases.rosterActivityId,
      page,
      history_page: 1,
    });
  }
  async function attendance(token, id, target, reason) {
    const [row] = await select("volunteer_registration", "id,updated_at,attendance_status", [id]);
    return api(
      token,
      `/api/admin/volunteers/registrations/${id}/attendance`,
      {
        expectedUpdatedAt: row.updated_at,
        attendanceStatus: target,
        command: row.attendance_status === "not_marked" ? "record" : "correct",
        ...(reason ? { reason } : {}),
      },
      "PATCH",
    );
  }
  async function restore(token, before) {
    // Reasoned corrections preserve append-only evidence; never delete/reset history.
    const current = await facts(before.rows.map((r) => r.id));
    for (const row of before.rows) {
      const now = current.rows.find((r) => r.id === row.id);
      if (now.attendance_status !== row.attendance_status)
        await attendance(
          token,
          row.id,
          row.attendance_status,
          "Synthetic daily-work acceptance restoration; retain event/audit history",
        );
    }
  }
  async function signIn(actor) {
    const auth = createClient(local.API_URL, local.ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const response = await auth.auth.signInWithPassword({
      email: actor.email,
      password: actor.password,
    });
    assert.ifError(response.error);
    assert.equal(response.data.user.id, actor.id);
    return { auth, session: response.data.session, token: response.data.session.access_token };
  }
  const staffB = actors.filter((a) => a.role === "staff")[1];
  assert.ok(staffB);
  const competitor = await signIn(staffB);
  for (const actor of [
    actors.find((a) => a.role === "admin"),
    actors.find((a) => a.role === "staff"),
  ]) {
    if (onlyRole && actor.role !== onlyRole) continue;
    const login = await signIn(actor);
    for (const width of [1440, 390]) {
      if (onlyWidth && width !== Number(onlyWidth)) continue;
      for (const caseId of ["DW-A", "DW-B", "DW-C", "DW-D", "DW-E", "DW-F"]) {
        if (onlyCase && caseId !== onlyCase) continue;
        const context = await browser.newContext({
          viewport: { width, height: width === 390 ? 844 : 900 },
        });
        await context.route(/^https?:\/\/(?!127\.0\.0\.1:(?:56321|56548)(?:\/|$))/, (route) =>
          route.abort("blockedbyclient"),
        );
        await context.addInitScript(
          ({ key, session }) => {
            localStorage.setItem(key, JSON.stringify(session));
            localStorage.setItem("hkscda-admin-language", "zh");
            window.__dwClicks = 0;
            addEventListener("click", () => window.__dwClicks++);
          },
          { key: login.auth.auth.storageKey, session: login.session },
        );
        const page = await context.newPage();
        page.setDefaultTimeout(12000);
        const requests = [],
          errors = [];
        let documents = 0,
          routeTransitions = 0,
          previousPath = "";
        page.on("request", (request) => {
          if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents++;
          if (request.url().startsWith(origin + "/api/admin/volunteers")) {
            let body;
            try {
              body = request.postDataJSON();
            } catch {}
            requests.push({
              path: new URL(request.url()).pathname,
              method: request.method(),
              body,
              at: performance.now(),
            });
          }
        });
        page.on("pageerror", (e) => errors.push(e.message));
        page.on("framenavigated", (frame) => {
          if (frame !== page.mainFrame()) return;
          const path = new URL(frame.url()).pathname;
          if (previousPath && previousPath !== path) routeTransitions++;
          previousPath = path;
        });
        const artifacts = join(out, `${actor.role}-${width}-${caseId}`);
        await mkdir(artifacts, { recursive: true });
        const started = performance.now();
        const record = {
          caseId,
          role: actor.role,
          sha,
          environment: local.API_URL,
          fixtureId: fixture.fixtureId,
          viewport: { width, height: width === 390 ? 844 : 900 },
          expected: "approved spec DW-A–F",
          command: "node scripts/verify-volunteer-daily-work.mjs --mode candidate",
          artifactPath: artifacts,
          attempts: 1,
        };
        const panel = () => page.locator("[data-attendance-panel]");
        const card = (id) => panel().locator(`#registration-${id}`);
        const opSection = () =>
          panel()
            .getByRole("heading", { name: /逐人變更預覽|逐人操作結果/ })
            .locator("..");
        const saveShot = (name) =>
          page.screenshot({ path: join(artifacts, name + ".png"), fullPage: false });
        async function roster(pageNumber = 1) {
          await page.goto(
            origin +
              `/admin/volunteers/activities?date_scope=all&selected=${fixture.cases.rosterActivityId}${pageNumber > 1 ? "&detail_page=" + pageNumber : ""}`,
          );
          await panel().waitFor();
          await panel().locator("article").first().waitFor();
        }
        async function preview(ids) {
          for (const id of ids) await card(id).getByRole("checkbox").first().check();
          await panel().getByRole("button", { name: "預覽所選點名", exact: true }).click();
          await panel().getByRole("heading", { name: "逐人變更預覽", exact: true }).waitFor();
          return new URL(page.url()).searchParams.get("operation");
        }
        async function confirm() {
          await panel()
            .getByRole("checkbox", { name: "我已逐人核對原狀態、目標及跳過原因", exact: true })
            .check();
          await panel().getByRole("button", { name: "確認所選點名", exact: true }).click();
        }
        async function outcomes() {
          await panel().getByRole("heading", { name: "逐人操作結果", exact: true }).waitFor();
        }
        let before;
        try {
          if (caseId === "DW-A") {
            await page.goto(origin + "/admin/volunteers/tasks?pending_scope=upcoming&page=2");
            const pending = page.locator("#tasks-pending").locator("..");
            await pending.getByRole("article").first().waitFor();
            const target = pending.getByRole("article").first(),
              id = await target.getAttribute("id");
            const text = await target.innerText();
            record.navigationHref = await target
              .getByRole("link", { name: "查看／處理申請", exact: true })
              .getAttribute("href");
            assert.match(text, /AUDIT-DW/);
            assert.match(text, /名額 .*已批准 .*尚餘/);
            assert.match(text, /本次報名 \d+ 人/);
            assert.match(text, /未預留名額/);
            await target.getByRole("link", { name: "查看／處理申請", exact: true }).click();
            await page.getByRole("link", { name: "返回待審清單", exact: true }).waitFor();
            assert.equal(new URL(page.url()).searchParams.get("page"), "2");
            await page.getByRole("link", { name: "返回待審清單", exact: true }).click();
            await pending.locator("#" + id).waitFor();
            assert.equal(new URL(page.url()).searchParams.get("pending_scope"), "upcoming");
            assert.equal(new URL(page.url()).searchParams.get("page"), "2");
            await page.waitForFunction((recordId) => document.activeElement?.id === recordId, id);
            await pending
              .locator("#" + id)
              .getByRole("link", { name: "查看／處理申請", exact: true })
              .click();
            await page.getByRole("link", { name: "返回待審清單", exact: true }).waitFor();
            await page.goBack();
            await pending.locator("#" + id).waitFor();
            const q = pending.getByRole("searchbox", { name: "搜尋待審申請", exact: true });
            await q.fill(fixture.prefix);
            await page.waitForResponse(
              (r) => r.url().endsWith("/tasks") && r.request().postDataJSON()?.q === fixture.prefix,
            );
            await pending
              .getByRole("button", { name: "下一頁", exact: true })
              .waitFor({ state: "visible" });
            await page.waitForFunction(
              () => new URLSearchParams(location.search).get("page") !== "2",
            );
            await pending.getByRole("article").nth(24).waitFor();
            await pending
              .getByRole("link", { name: "查看／處理申請", exact: true })
              .first()
              .waitFor();
            const allNames = new Set(
              await pending
                .getByRole("article")
                .evaluateAll((rows) => rows.map((r) => r.querySelector("p")?.textContent)),
            );
            await pending.getByRole("button", { name: "下一頁", exact: true }).click();
            await page.waitForFunction(
              () => new URLSearchParams(location.search).get("page") === "2",
            );
            await pending.getByRole("article").nth(1).waitFor({ state: "hidden" });
            await pending.getByRole("article").first().waitFor();
            for (const name of await pending
              .getByRole("article")
              .evaluateAll((rows) => rows.map((r) => r.querySelector("p")?.textContent)))
              allNames.add(name);
            assert.equal(allNames.size, 26, "unique references across pages");
            assert.ok(!page.url().includes(fixture.prefix));
            assert.equal(await q.inputValue(), fixture.prefix);
            await saveShot("pending-page2");
            record.actual = {
              sameNameReferences: allNames.size,
              returnScope: "upcoming",
              returnPage: 2,
              focusRestored: true,
              qInUrl: false,
            };
          }
          if (caseId === "DW-B") {
            await roster();
            const data = await detail(login.token);
            assert.equal(data.registrations.length, 25);
            const beforeAll = await facts(fixture.registrationIds);
            await panel()
              .getByRole("button", { name: "選取本頁（25 筆報名）", exact: true })
              .click();
            await panel().getByRole("button", { name: "預覽所選點名", exact: true }).click();
            await panel().getByRole("heading", { name: "逐人變更預覽", exact: true }).waitFor();
            const op = await bulk(login.token, {
              action: "status",
              operation_id: new URL(page.url()).searchParams.get("operation"),
            });
            assert.deepEqual(
              new Set(op.operation.rows.map((r) => r.registration_id)),
              new Set(data.registrations.map((r) => r.id)),
            );
            for (const row of op.operation.rows) {
              const shown = opSection().locator("li").filter({ hasText: row.registration_id });
              assert.equal(await shown.count(), 1);
              assert.match(await shown.innerText(), /原出席.*目標出席/s);
              if (row.decision !== "ready") assert.ok(row.reason);
            }
            assert.ok(op.operation.rows.some((r) => r.decision === "ready"));
            assert.ok(op.operation.rows.some((r) => r.reason === "registration_not_approved"));
            assert.ok(op.operation.rows.some((r) => r.before.attendance_status !== "not_marked"));
            assert.ok(
              op.operation.rows.some((r) => r.participant_count === 2),
              "group registration remains one row with participant count",
            );
            assert.ok(
              await panel()
                .getByRole("checkbox", { name: "更正已有出席紀錄", exact: true })
                .count(),
            );
            await saveShot("per-person-preview");
            await panel().getByRole("button", { name: "取消預覽", exact: true }).click();
            assert.deepEqual(await facts(fixture.registrationIds), beforeAll);
            await page.getByRole("button", { name: "下一頁報名", exact: true }).click();
            await page.waitForFunction(
              () => new URLSearchParams(location.search).get("detail_page") === "2",
            );
            await panel().locator("article").waitFor();
            assert.equal(await panel().locator("article input[type=checkbox]:checked").count(), 0);
            record.actual = {
              selected: 25,
              ready: op.operation.rows.filter((r) => r.decision === "ready").length,
              skips: op.operation.rows.filter((r) => r.decision !== "ready").map((r) => r.reason),
              cancelDomainWrites: 0,
              page2Selected: 0,
            };
            assert.equal(
              requests.filter((r) => r.path.includes("/registrations/")).length,
              0,
              "no per-row detail requests for 25-row roster",
            );
          }
          if (caseId === "DW-C") {
            await roster();
            const data = await detail(login.token);
            const ids = data.registrations
              .filter((r) => r.status === "approved" && r.attendance_status === "not_marked")
              .slice(0, 2)
              .map((r) => r.id);
            assert.equal(ids.length, 2);
            before = await facts(ids);
            const opId = await preview(ids);
            await attendance(competitor.token, ids[1], "no_show");
            await confirm();
            await outcomes();
            const receipt = (await bulk(login.token, { action: "status", operation_id: opId }))
              .operation;
            assert.equal(receipt.results.filter((r) => r.kind === "applied").length, 1);
            assert.equal(receipt.results.filter((r) => r.kind === "conflicted").length, 1);
            assert.match(await opSection().innerText(), /版本衝突/);
            const savedFacts = await facts(ids);
            assert.deepEqual(
              (await bulk(login.token, { action: "attendance_apply", operation_id: opId }))
                .operation,
              receipt,
            );
            assert.deepEqual(await facts(ids), savedFacts);
            await saveShot("partial-conflict");
            await panel().getByRole("button", { name: "重新核對未完成項目", exact: true }).click();
            assert.equal(await panel().locator("article input[type=checkbox]:checked").count(), 1);
            receipts.push({ caseId, role: actor.role, width, operation: receipt, db: savedFacts });
            record.actual = {
              applied: 1,
              conflicted: 1,
              replayExtraEvents: 0,
              failedOnlySelected: 1,
            };
          }
          if (caseId === "DW-D") {
            await roster();
            const data = await detail(login.token);
            const id = data.registrations.find(
              (r) => r.status === "approved" && r.attendance_status === "not_marked",
            ).id;
            before = await facts([id]);
            let lost = false,
              blockStatus = true,
              opId;
            await context.route("**/api/admin/volunteers/bulk", async (route) => {
              const body = route.request().postDataJSON();
              if (body.action === "attendance_apply" && !lost) {
                lost = true;
                opId = body.operation_id;
                const response = await route.fetch();
                assert.equal(response.status(), 200);
                receipts.push({
                  caseId,
                  role: actor.role,
                  width,
                  lostReceipt: await response.json(),
                });
                await route.abort("connectionreset");
                return;
              }
              if (body.action === "status" && blockStatus && lost) {
                await route.fulfill({ status: 503, json: { error: "Synthetic status outage" } });
                return;
              }
              await route.continue();
            });
            await preview([id]);
            await confirm();
            await panel()
              .getByText("原操作結果尚未確認；先查詢原結果，請勿建立替代點名。", { exact: true })
              .waitFor();
            assert.equal(requests.filter((r) => r.body?.action === "attendance_apply").length, 1);
            assert.equal(
              await panel().getByRole("button", { name: "預覽所選點名", exact: true }).isDisabled(),
              true,
            );
            await saveShot("outcome-unknown");
            blockStatus = false;
            await panel().getByRole("button", { name: "查詢原操作結果", exact: true }).click();
            await outcomes();
            assert.equal(new URL(page.url()).searchParams.get("operation"), opId);
            const after = await facts([id]);
            assert.equal(after.events.length, before.events.length + 1);
            await page.reload();
            await outcomes();
            assert.equal(requests.filter((r) => r.body?.action === "attendance_apply").length, 1);
            assert.deepEqual(await facts([id]), after);
            await saveShot("recovered-receipt");
            await panel().getByRole("button", { name: "清除本頁選取", exact: true }).click();
            const next = (await detail(login.token)).registrations.find(
              (r) => r.status === "approved" && r.attendance_status === "not_marked",
            );
            const secondBefore = await facts([next.id]);
            before.rows.push(...secondBefore.rows);
            before.events.push(...secondBefore.events);
            // Browser storage is unavailable, so the original UUID/apply intent must survive in the URL.
            const noSessionStorage = () =>
              Object.defineProperty(window, "sessionStorage", {
                configurable: true,
                get() {
                  throw new DOMException("Synthetic unavailable storage", "SecurityError");
                },
              });
            await context.addInitScript(noSessionStorage);
            await page.evaluate(noSessionStorage);
            let refreshBlock = false,
              refreshFaultOnce = true;
            await context.route("**/api/admin/volunteers/bulk", async (route) => {
              const body = route.request().postDataJSON();
              if (body.action === "attendance_apply" && refreshFaultOnce) {
                refreshFaultOnce = false;
                const response = await route.fetch();
                assert.equal(response.status(), 200);
                refreshBlock = true;
                await route.fulfill({ response });
                return;
              }
              if (refreshBlock && ["detail", "list"].includes(body.action)) {
                await route.fulfill({
                  status: 503,
                  json: { error: "Synthetic roster refresh outage" },
                });
                return;
              }
              await route.fallback();
            });
            const secondOp = await preview([next.id]);
            await panel()
              .getByRole("checkbox", { name: "我已逐人核對原狀態、目標及跳過原因", exact: true })
              .check();
            await panel()
              .getByRole("button", { name: "確認所選點名", exact: true })
              .evaluate((button) => {
                button.click();
                button.click();
              });
            const dialog = page.getByRole("dialog");
            await dialog.getByText("已儲存，重新載入失敗。", { exact: true }).waitFor();
            await dialog.getByRole("heading", { name: "逐人操作結果", exact: true }).waitFor();
            assert.match(await dialog.innerText(), new RegExp(next.id));
            assert.equal(new URL(page.url()).searchParams.get("attendance_intent"), "apply");
            assert.equal(
              requests.filter((r) => r.body?.action === "attendance_apply").length,
              2,
              "double click sends one new apply",
            );
            const secondAfter = await facts([next.id]);
            assert.equal(secondAfter.events.length, secondBefore.events.length + 1);
            await saveShot("saved-refresh-failed");
            refreshBlock = false;
            await dialog.getByRole("button", { name: "只重新載入名單", exact: true }).click();
            await outcomes();
            await page.reload();
            await outcomes();
            assert.equal(new URL(page.url()).searchParams.get("operation"), secondOp);
            assert.equal(requests.filter((r) => r.body?.action === "attendance_apply").length, 2);
            assert.deepEqual(await facts([next.id]), secondAfter);
            await saveShot("url-recovery-without-storage");
            await panel().getByRole("button", { name: "清除本頁選取", exact: true }).click();
            const partialIds = (await detail(login.token)).registrations
              .filter((r) => r.status === "approved" && r.attendance_status === "not_marked")
              .slice(0, 2)
              .map((r) => r.id);
            assert.equal(partialIds.length, 2);
            const partialBefore = await facts(partialIds);
            before.rows.push(...partialBefore.rows);
            before.events.push(...partialBefore.events);
            const partialOp = await preview(partialIds);
            const auditFault = randomUUID();
            fault("install", "audit", auditFault, actor.id, partialIds[1]);
            try {
              await confirm();
              await outcomes();
            } finally {
              fault("remove", "audit", auditFault, actor.id, partialIds[1]);
            }
            const partialReceipt = (
              await bulk(login.token, { action: "status", operation_id: partialOp })
            ).operation;
            assert.equal(partialReceipt.results.filter((r) => r.kind === "applied").length, 1);
            assert.equal(partialReceipt.results.filter((r) => r.kind === "failed").length, 1);
            const failed = partialReceipt.results.find((r) => r.kind === "failed");
            assert.equal(failed.event_id, null);
            assert.ok(failed.audit_id);
            assert.match(await opSection().innerText(), /未能儲存/);
            const partialAfter = await facts(partialIds);
            assert.equal(partialAfter.events.length, partialBefore.events.length + 1);
            const failedAudit = partialAfter.audit.find((a) => a.id === failed.audit_id);
            assert.equal(failedAudit.actor_user_id, actor.id);
            assert.equal(failedAudit.detail.operationId, partialOp);
            assert.equal(failedAudit.detail.result.kind, "failed");
            assert.deepEqual(
              (await bulk(login.token, { action: "attendance_apply", operation_id: partialOp }))
                .operation,
              partialReceipt,
            );
            assert.deepEqual(await facts(partialIds), partialAfter);
            await saveShot("partial-single-failure");
            await panel().getByRole("button", { name: "重新核對未完成項目", exact: true }).click();
            assert.equal(await panel().locator("article input[type=checkbox]:checked").count(), 1);
            await panel().getByRole("button", { name: "預覽所選點名", exact: true }).click();
            await panel().getByRole("heading", { name: "逐人變更預覽", exact: true }).waitFor();
            const retryOp = new URL(page.url()).searchParams.get("operation");
            const receiptFault = randomUUID();
            fault("install", "receipt", receiptFault, actor.id, retryOp);
            try {
              const originalStatus = page.waitForResponse(
                (r) =>
                  r.url().endsWith("/bulk") &&
                  r.request().postDataJSON()?.action === "status" &&
                  r.request().postDataJSON()?.operation_id === retryOp,
              );
              await confirm();
              await originalStatus;
              await panel().getByRole("button", { name: "確認所選點名", exact: true }).waitFor();
              assert.deepEqual(
                await facts(partialIds),
                partialAfter,
                "receipt failure rolls back all domain facts and audit",
              );
              assert.equal(
                (await bulk(login.token, { action: "status", operation_id: retryOp })).operation
                  .state,
                "previewed",
              );
              await saveShot("receipt-failure-original-status");
            } finally {
              fault("remove", "receipt", receiptFault, actor.id, retryOp);
            }
            await confirm();
            await outcomes();
            assert.equal(new URL(page.url()).searchParams.get("operation"), retryOp);
            const retried = (await bulk(login.token, { action: "status", operation_id: retryOp }))
              .operation;
            assert.equal(retried.results[0].kind, "applied");
            assert.equal((await facts(partialIds)).events.length, partialBefore.events.length + 2);
            receipts.push({
              caseId,
              role: actor.role,
              width,
              partialReceipt,
              retried,
              partialAfter,
            });
            await saveShot("original-id-manual-retry");
            record.actual = {
              lostResponse: true,
              statusOutage: true,
              originalOperation: opId,
              applyRequests: requests.filter((r) => r.body?.action === "attendance_apply").length,
              eventDelta:
                (await facts(before.rows.map((r) => r.id))).events.length - before.events.length,
              reloadResends: 0,
              savedRefreshFailure: true,
              doubleClickExtraWrites: 0,
              urlRecoveryWithoutStorage: true,
              partialFailure: { applied: 1, failed: 1, failedAttemptAudit: true },
              receiptFailureRollback: true,
              explicitRetrySameOperation: true,
            };
          }
          if (caseId === "DW-E") {
            await roster();
            const data = await detail(login.token);
            const row = data.registrations.find((r) => r.attendance_status !== "not_marked");
            before = await facts([row.id]);
            await card(row.id)
              .getByRole("checkbox", { name: "更正已有出席紀錄", exact: true })
              .check();
            await card(row.id)
              .getByRole("combobox")
              .selectOption(row.attendance_status === "no_show" ? "attended" : "no_show");
            assert.equal(
              await panel().getByRole("button", { name: "預覽所選點名", exact: true }).isDisabled(),
              true,
            );
            const reason = "Synthetic correction review " + randomUUID();
            await card(row.id)
              .getByRole("textbox", { name: "更正原因（必填）", exact: true })
              .fill(reason);
            await panel().getByRole("button", { name: "預覽所選點名", exact: true }).click();
            await panel().getByRole("heading", { name: "逐人變更預覽", exact: true }).waitFor();
            await panel().getByRole("button", { name: "取消預覽", exact: true }).click();
            assert.deepEqual(await facts([row.id]), before);
            await panel().getByRole("button", { name: "預覽所選點名", exact: true }).click();
            await panel().getByRole("heading", { name: "逐人變更預覽", exact: true }).waitFor();
            await confirm();
            await outcomes();
            const receipt = (
              await bulk(login.token, {
                action: "status",
                operation_id: new URL(page.url()).searchParams.get("operation"),
              })
            ).operation;
            assert.equal(receipt.results[0].kind, "applied");
            const saved = await facts([row.id]);
            assert.equal(saved.events.length, before.events.length + 1);
            const audit = saved.audit.find((r) => r.id === receipt.results[0].audit_id);
            assert.ok(audit);
            assert.equal(audit.actor_user_id, login.session.user.id);
            assert.equal(audit.entity_id, row.id);
            assert.ok(JSON.stringify(audit).includes(reason));
            await saveShot("correction-result");
            receipts.push({ caseId, role: actor.role, width, operation: receipt, db: saved });
            record.actual = {
              blankReasonBlocked: true,
              cancelDomainWrites: 0,
              correctionEventDelta: 1,
              auditActor: true,
              auditReason: true,
            };
          }
          if (caseId === "DW-F") {
            const id = fixture.cases.pendingRosterRegistrationId;
            assert.ok(id);
            let releaseInitial,
              holdInitial = true;
            await context.route("**/api/admin/volunteers/tasks", async (route) => {
              if (holdInitial && route.request().postDataJSON()?.action === "list") {
                holdInitial = false;
                await new Promise((done) => (releaseInitial = done));
              }
              await route.continue();
            });
            await page.goto(origin + "/admin/volunteers/tasks?pending_scope=overdue&page=1");
            const search = page.getByRole("searchbox", { name: "搜尋待審申請", exact: true });
            await search.waitFor();
            await page.getByText("載入中…", { exact: true }).first().waitFor();
            assert.equal(typeof releaseInitial, "function");
            await saveShot("loading");
            releaseInitial();
            await page
              .locator("#tasks-pending")
              .locator("..")
              .getByRole("article")
              .first()
              .waitFor();
            const countBeforeComposition = requests.filter(
              (r) => r.body?.action === "list" && r.path.endsWith("/tasks"),
            ).length;
            await search.dispatchEvent("compositionstart");
            await search.fill("測試組字");
            // Exercise the real debounce boundary while IME is still composing.
            await page.waitForTimeout(380);
            assert.equal(
              requests.filter((r) => r.body?.action === "list" && r.path.endsWith("/tasks")).length,
              countBeforeComposition,
            );
            const emptyResponse = page.waitForResponse(
              (r) => r.url().endsWith("/tasks") && r.request().postDataJSON()?.q === "測試組字",
            );
            await search.dispatchEvent("compositionend", { data: "測試組字" });
            await emptyResponse;
            await page.getByText("目前沒有待審批報名。", { exact: true }).waitFor();
            await saveShot("empty");
            await search.fill("intermediate-a");
            await search.fill("intermediate-ab");
            await search.fill(id);
            const target = page.locator("#pending-" + id);
            await target.waitFor();
            assert.equal(
              requests.filter((r) => r.body?.q?.startsWith("intermediate-")).length,
              0,
              "debounce coalesces intermediate input",
            );
            const link = target.getByRole("link", { name: "查看／處理申請", exact: true });
            await link.focus();
            await page.keyboard.press("Enter");
            await page.getByRole("link", { name: "返回待審清單", exact: true }).click();
            await target.waitFor();
            const session = target.getByRole("link", { name: "開啟場次名單", exact: true });
            await session.focus();
            await page.keyboard.press("Enter");
            await panel().waitFor();
            const data = await detail(login.token);
            const row = data.registrations.find(
              (r) => r.status === "approved" && r.attendance_status === "not_marked",
            );
            before = await facts([row.id]);
            await card(row.id).getByRole("checkbox").first().focus();
            await page.keyboard.press("Space");
            await panel().getByRole("button", { name: "預覽所選點名", exact: true }).click();
            await panel().getByRole("heading", { name: "逐人變更預覽", exact: true }).waitFor();
            assert.equal(
              await page.evaluate(() => document.activeElement?.textContent),
              "逐人變更預覽",
            );
            await confirm();
            await outcomes();
            const receipt = (
              await bulk(login.token, {
                action: "status",
                operation_id: new URL(page.url()).searchParams.get("operation"),
              })
            ).operation;
            assert.equal(receipt.results[0].kind, "applied");
            const axe = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
            await writeFile(
              join(artifacts, "axe.json"),
              JSON.stringify({ violations: axe.violations, incomplete: axe.incomplete }, null, 2),
            );
            assert.equal(
              axe.violations.filter((v) => ["serious", "critical"].includes(v.impact)).length,
              0,
              "serious a11y violations",
            );
            assert.ok(
              await page.getByRole("dialog").evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
              "dialog horizontal overflow",
            );
            await saveShot("complete-journey");
            if (width === 1440) {
              await page.evaluate(() => (document.documentElement.style.zoom = "3"));
              await saveShot("css-zoom-300");
              assert.ok(
                await page
                  .getByRole("dialog")
                  .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
                "CSS 300% zoom overflow",
              );
              await page.evaluate(() => (document.documentElement.style.zoom = ""));
            }
            await page.keyboard.press("Escape");
            await page.getByRole("dialog").waitFor({ state: "hidden" });
            const journey = {
              clicks: await page.evaluate(() => window.__dwClicks),
              routeTransitions,
              documentNavigations: documents,
              elapsedMs: performance.now() - started,
            };
            assert.equal(documents, 1, "complete journey uses SPA navigation");
            let forbidden = true;
            await context.route("**/api/admin/volunteers/tasks", async (route) => {
              if (forbidden) await route.fulfill({ status: 403, json: { error: "forbidden" } });
              else await route.fallback();
            });
            await page.goto(origin + "/admin/volunteers/tasks?pending_scope=overdue&page=1");
            await page.getByText("未能載入待辦。", { exact: true }).waitFor();
            await saveShot("forbidden-read");
            forbidden = false;
            await page.getByRole("button", { name: "重新載入", exact: true }).click();
            await page.locator("#pending-" + id).waitFor();
            await saveShot("read-error-recovered");
            record.actual = {
              completeSameSession: true,
              keyboard: true,
              previewFocus: true,
              escape: true,
              axeSerious: 0,
              cssZoom: width === 1440 ? 3 : null,
              nativeBrowserZoom: "not-tested",
              spaDocuments: documents,
              journey,
              loading: true,
              empty: true,
              imeNoEarlyRequest: true,
              debounceCoalesced: true,
              forbiddenRead: true,
              readRetryRecovered: true,
            };
          }
          assert.deepEqual(errors, [], "browser runtime errors");
          record.status = "verified";
          record.completed = true;
          record.exitCode = 0;
          record.elapsedMs = performance.now() - started;
        } catch (error) {
          record.status = "failed";
          record.completed = false;
          record.exitCode = 1;
          record.error = String(error.stack ?? error);
          record.failureUrl = page.url();
          await saveShot("failure").catch(() => {});
          await writeFile(
            join(artifacts, "failure-dom.txt"),
            await page
              .locator("body")
              .innerText()
              .catch(() => "No DOM"),
          );
        } finally {
          record.observedElapsedMs = performance.now() - started;
          record.clicks = await page.evaluate(() => window.__dwClicks).catch(() => null);
          Object.assign(record, {
            routeTransitions,
            documentNavigations: documents,
            requestCounts: Object.fromEntries(
              [...new Set(requests.map((r) => r.body?.action ?? r.path))].map((key) => [
                key,
                requests.filter((r) => (r.body?.action ?? r.path) === key).length,
              ]),
            ),
          });
          await writeFile(join(artifacts, "requests.json"), JSON.stringify(requests, null, 2));
          if (before) {
            try {
              // Never "restore" while an original business write still has an uncertain outcome.
              for (const operationId of new Set(
                requests
                  .filter((r) => r.body?.action === "attendance_apply")
                  .map((r) => r.body.operation_id),
              )) {
                const original = await bulk(login.token, {
                  action: "status",
                  operation_id: operationId,
                });
                if (original.operation.state !== "completed") {
                  stopTarget =
                    "Original write outcome unresolved; retain fixture and reconcile read-only";
                  throw new Error(stopTarget);
                }
              }
              if (stopTarget) throw new Error(stopTarget);
              await restore(login.token, before);
              record.fixtureRestoration = "reasoned corrections; immutable history retained";
            } catch (error) {
              record.fixtureRestoration = String(error);
              record.status = "failed";
              record.completed = false;
              record.exitCode = 1;
            }
          }
          results.push(record);
          await save();
          await context.close();
          console.log(
            JSON.stringify({
              caseId,
              role: actor.role,
              width,
              status: record.status,
              error: record.error?.slice(0, 350),
            }),
          );
          if (stopTarget) throw new Error(stopTarget);
        }
      }
    }
  }
  return results;
}
