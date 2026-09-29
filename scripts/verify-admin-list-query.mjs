import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { chromium } from "playwright";

const bundlePath = resolve(".local-policy-test/t15-admin-list-query.js");
if (typeof Bun !== "undefined") {
  await mkdir(resolve(".local-policy-test"), { recursive: true });
  const built = await Bun.build({
    entrypoints: ["scripts/fixtures/admin-list-query.tsx"],
    target: "browser",
    plugins: [
      {
        name: "synthetic-admin-list",
        setup(builder) {
          builder.onLoad({ filter: /[\\/]components[\\/]admin[\\/]crm[\\/]api\.ts$/ }, () => ({
            loader: "ts",
            contents:
              "export async function fetchAdminJson(path,init){const response=await fetch(path,init);if(!response.ok)throw Error('synthetic list failed');return response.json();}",
          }));
          builder.onLoad(
            {
              filter: /[\\/]components[\\/]admin[\\/]crm[\\/](ExportBar|SupporterFormDialog)\.tsx$/,
            },
            () => ({
              loader: "tsx",
              contents:
                "export function ExportBar(){return null};export function SupporterFormDialog(){return null}",
            }),
          );
          builder.onLoad({ filter: /[\\/]components[\\/]admin[\\/]adminPageCopy\.ts$/ }, () => ({
            loader: "ts",
            contents:
              "export function useAdminPageCopy(){return {language:'zh',pageCopy:{supporters:{title:'支持者',subtitle:'合成列表',columns:{supporter:'支持者',consent:'同意',roles:'角色',lifetime:'累計',lastGift:'最近',receipts:'收據',action:'操作'},roleLabels:{donor:'捐款者',adopter:'領養人',volunteer:'義工',foster:'暫養'},email:'電郵',whatsapp:'WhatsApp',needsReview:'待處理',clear:'完成',lastGift:'最近捐款',receipts:'收據',searchLabel:'搜尋支持者',searchPlaceholder:'搜尋',roleFilterLabel:'角色',allRoles:'全部',loadError:'載入失敗',empty:'沒有支持者'},common:{action:'操作',open:'開啟',totalSupporters:(n)=>'合共'+n}}};}",
          }));
        },
      },
    ],
  });
  if (!built.success) throw Error("List fixture bundle failed: " + built.logs.join("\n"));
  await writeFile(bundlePath, await built.outputs[0].text());
  console.log("T15 list fixture built");
  process.exit(0);
}
const bundle = await readFile(bundlePath, "utf8");
const server = createServer((request, response) => {
  if (request.url === "/bundle.js") {
    response.setHeader("content-type", "text/javascript");
    response.end(bundle);
  } else {
    response.setHeader("content-type", "text/html");
    response.end(
      '<!doctype html><html lang="zh-HK"><body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>',
    );
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(15000);
  const requests = [];
  const failures = [];
  await page.route("**/api/admin/supporters?*", async (route) => {
    const url = new URL(route.request().url());
    const request = {
      q: url.searchParams.get("q") ?? "",
      role: url.searchParams.get("role") ?? "",
      page: url.searchParams.get("page") ?? "",
    };
    requests.push(request);
    if (request.q === "slow") await new Promise((done) => setTimeout(done, 900));
    try {
      if (request.q === "error")
        await route.fulfill({ status: 500, json: { error: "synthetic failure" } });
      else await route.fulfill({ json: { supporters: [], total: request.q === "fast" ? 2 : 60 } });
    } catch (error) {
      if (request.q !== "slow") failures.push(String(error));
    }
  });
  await page.goto("http://127.0.0.1:" + server.address().port);
  const search = page.getByRole("textbox", { name: "搜尋支持者" });
  await search.waitFor();
  await search.fill("a");
  await search.fill("ab");
  await page.waitForTimeout(450);
  assert.deepEqual(
    requests.filter((r) => r.q).map((r) => r.q),
    ["ab"],
    "Rapid typing must produce one debounced request",
  );
  assert.equal(
    new URL(page.url()).searchParams.has("q"),
    false,
    "Private query must not enter URL",
  );
  assert.equal(
    await page.evaluate(() => sessionStorage.getItem("hkscda.admin.list.query.supporters")),
    "ab",
  );

  const beforeIme = requests.length;
  await search.dispatchEvent("compositionstart");
  await search.fill("香港");
  await page.waitForTimeout(430);
  assert.equal(requests.length, beforeIme, "IME composition must not issue a query");
  await search.dispatchEvent("compositionend");
  await page.waitForFunction(
    () => sessionStorage.getItem("hkscda.admin.list.query.supporters") === "香港",
  );
  await page.waitForTimeout(100);
  assert.equal(
    requests.filter((r) => r.q === "香港").length,
    1,
    "Committed Chinese text should issue one query",
  );

  await search.fill("slow");
  await page.waitForTimeout(350);
  assert.equal(
    requests.some((r) => r.q === "slow"),
    true,
  );
  await search.fill("fast");
  await page.getByText("合共2").waitFor();
  await page.waitForTimeout(1000);
  assert.equal(
    await page.getByText("合共2").count(),
    1,
    "Cancelled slow response cannot replace new result",
  );

  await search.fill("error");
  await page.getByRole("alert").waitFor();
  assert.equal(
    await page.getByText("沒有支持者").count(),
    0,
    "Failure must not look like an empty result",
  );
  assert.equal(new URL(page.url()).searchParams.has("q"), false);

  await search.fill("");
  await page.getByText("合共60").waitFor();
  await page.getByRole("button", { name: "下一頁" }).click();
  await page.waitForFunction(() => new URL(location.href).searchParams.get("page") === "2");
  await page.goBack();
  await page.waitForFunction(() => !new URL(location.href).searchParams.has("page"));
  await page.goForward();
  await page.waitForFunction(() => new URL(location.href).searchParams.get("page") === "2");
  assert.equal(
    requests.some((r) => r.page === "2"),
    true,
    "Pagination request should track URL state",
  );

  await page.evaluate(() => history.pushState(history.state, "", "?role=donor&page=2"));
  await page.dispatchEvent("body", "popstate");
  await page.waitForTimeout(100);
  assert.equal(
    requests.some((r) => r.role === "donor" && r.page === "2"),
    true,
    "Route filters should restore on popstate",
  );
  await page.evaluate(() => history.pushState(history.state, "", "?role=adopter&page=3"));
  await page.dispatchEvent("body", "popstate");
  await page.waitForTimeout(100);
  assert.equal(
    requests.some((r) => r.role === "adopter" && r.page === "3"),
    true,
  );
  assert.equal(new URL(page.url()).searchParams.has("q"), false);
  assert.deepEqual(failures, []);
  await page.getByRole("button", { name: "Select synthetic" }).click();
  await page.getByText("selection-active").waitFor();
  await page.getByRole("button", { name: "Filter synthetic" }).click();
  await page.getByText("selection-cleared").waitFor();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  assert.equal(overflow, false, "390px list view should not overflow horizontally");
  await mkdir(resolve("docs/evidence/audit-remediation-20260927/ui"), { recursive: true });
  await page.screenshot({
    path: resolve("docs/evidence/audit-remediation-20260927/ui/t15-list-query-synthetic-390.png"),
    fullPage: true,
  });
  const blocked = await browser.newPage({ viewport: { width: 390, height: 844 } });
  blocked.setDefaultTimeout(5000);
  await blocked.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException("Blocked", "SecurityError");
    };
    Storage.prototype.setItem = () => {
      throw new DOMException("Quota", "QuotaExceededError");
    };
  });
  let blockedQuery = "";
  await blocked.route("**/api/admin/supporters?*", async (route) => {
    blockedQuery = new URL(route.request().url()).searchParams.get("q") ?? "";
    await route.fulfill({ json: { supporters: [], total: 7 } });
  });
  await blocked.goto("http://127.0.0.1:" + server.address().port);
  await blocked.getByText("合共7").waitFor();
  await blocked.getByRole("textbox", { name: "搜尋支持者" }).fill("storage-unavailable");
  await blocked.waitForTimeout(500);
  assert.equal(
    blockedQuery,
    "storage-unavailable",
    "Storage denial must not break in-memory searching",
  );
  await blocked.close();
  console.log(
    JSON.stringify({
      unavailableStorageWorks: true,
      rapidTypingCollapsed: true,
      imeCommittedOnce: true,
      slowResponseIgnored: true,
      privateQuery: true,
      routeRestore: true,
      realBackForward: true,
      errorDistinctFromEmpty: true,
      filterClearsSelection: true,
      noMobileOverflow: true,
      requests: requests.length,
    }),
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  server.close();
}
