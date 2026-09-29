import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { chromium } from "playwright";

const bundlePath = resolve(".local-policy-test/t15-supporter-edit-bundle.js");
const output = resolve("docs/evidence/audit-remediation-20260927/ui");
if (typeof Bun !== "undefined") {
  await mkdir(resolve(".local-policy-test"), { recursive: true });
  const built = await Bun.build({
    entrypoints: ["scripts/fixtures/supporter-edit-ui.tsx"],
    target: "browser",
    plugins: [
      {
        name: "synthetic-crm-api",
        setup(builder) {
          builder.onLoad({ filter: /[\\/]components[\\/]admin[\\/]crm[\\/]api\.ts$/ }, () => ({
            loader: "ts",
            contents:
              "export async function fetchAdminJson(path,init){const response=await fetch(path,init);const body=await response.json();if(!response.ok){const error=new Error(body.error?.message??body.error??'Request failed');error.status=response.status;throw error;}return body;}",
          }));
          builder.onLoad({ filter: /[\\/]components[\\/]admin[\\/]adminPageCopy\.ts$/ }, () => ({
            loader: "ts",
            contents:
              "export function useAdminPageCopy(){return {language:'zh',pageCopy:{supporters:{editSupporter:'編輯支持者',newSupporter:'新增支持者',loadError:'載入失敗',saveSupporter:'儲存支持者',form:{name:'姓名',email:'電郵',phone:'電話',language:'語言',tags:'標籤',roles:'角色'},roleLabels:{donor:'捐款者',adopter:'領養人',volunteer:'義工',foster:'暫養'}}}};}",
          }));
        },
      },
    ],
  });
  if (!built.success) throw new Error("T15 fixture build failed: " + built.logs.join("\n"));
  await writeFile(bundlePath, await built.outputs[0].text());
  console.log("T15 synthetic UI fixture built");
  process.exit(0);
}
const bundle = await readFile(bundlePath, "utf8");
const server = createServer((request, response) => {
  if (request.url === "/bundle.js") {
    response.setHeader("content-type", "text/javascript");
    response.end(bundle);
    return;
  }
  response.setHeader("content-type", "text/html");
  response.end(
    '<!doctype html><html lang="zh-HK"><body><div id="root"></div><script type="module" src="/bundle.js"></script></body></html>',
  );
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const base = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({ headless: true });
const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const rows = {
  [a]: {
    id: a,
    name: "Ada Original",
    email: "ada@example.invalid",
    phone: "1111",
    language: "en",
    tags: ["first"],
    roles: ["donor"],
    editVersion: 2,
  },
  [b]: {
    id: b,
    name: "Ben Current",
    email: "ben@example.invalid",
    phone: "2222",
    language: "en",
    tags: [],
    roles: ["donor"],
    editVersion: 8,
  },
};
let gets = 0;
const patches = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => {
    throw error;
  });
  await page.route("**/api/admin/supporters/*", async (route) => {
    const id = route.request().url().split("/").at(-1);
    if (!(id in rows)) throw new Error("Unexpected synthetic supporter");
    if (route.request().method() === "GET") {
      gets++;
      return route.fulfill({ json: { supporter: rows[id] } });
    }
    const body = route.request().postDataJSON();
    patches.push({ id, body });
    if (body.expectedVersion !== rows[id].editVersion)
      return route.fulfill({
        status: 409,
        json: { error: { code: "version_conflict", message: "Conflict" } },
      });
    rows[id] = { ...rows[id], ...body, editVersion: rows[id].editVersion + 1 };
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto(base);
  const edit = page.getByRole("button", { name: "編輯支持者" });
  await edit.click();
  await page.getByLabel("姓名").waitFor();
  assert.equal(await page.getByLabel("姓名").inputValue(), "Ada Original");
  await page.getByLabel("姓名").fill("Local unsaved");
  await page.keyboard.press("Escape");
  await page.getByText("尚有未儲存更改").waitFor();
  await page.getByRole("button", { name: "繼續編輯" }).click();
  assert.equal(await page.getByLabel("姓名").inputValue(), "Local unsaved");
  await page.getByRole("button", { name: "取消" }).click();
  await page.getByRole("button", { name: "放棄更改" }).click();
  rows[a] = { ...rows[a], name: "Ada External", editVersion: 3 };
  await edit.click();
  await page.getByLabel("姓名").waitFor();
  assert.equal(await page.getByLabel("姓名").inputValue(), "Ada External");
  await page.getByLabel("姓名").fill("Ada Local");
  rows[a] = { ...rows[a], name: "Ada Colleague", editVersion: 4 };
  await page.getByRole("button", { name: "儲存支持者" }).click();
  await page.getByText("資料已由其他職員更新").waitFor();
  assert.equal(await page.getByLabel("姓名").inputValue(), "Ada Local");
  assert.equal(patches.at(-1).body.expectedVersion, 3);
  await page.getByRole("button", { name: "放棄本次修改並重新載入" }).click();
  await page.getByLabel("姓名").waitFor();
  assert.equal(await page.getByLabel("姓名").inputValue(), "Ada Colleague");
  await page.getByRole("button", { name: "取消" }).click();
  await page.getByRole("button", { name: "Switch supporter" }).click();
  await edit.click();
  await page.getByLabel("姓名").waitFor();
  assert.equal(await page.getByLabel("姓名").inputValue(), "Ben Current");
  await page.getByLabel("姓名").fill("Ben Saved");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: resolve(output, "t15-supporter-edit-ready.png") });
  await page.getByRole("button", { name: "儲存支持者" }).click();
  await edit.waitFor();
  assert.equal(rows[b].name, "Ben Saved");
  assert.equal(patches.at(-1).body.expectedVersion, 8);
  assert.equal(gets, 4);
  console.log(
    JSON.stringify({
      mode: "synthetic mobile 390x844",
      gets,
      patches: patches.length,
      staleConflict: true,
      dirtyGuard: true,
      switchIsolation: true,
    }),
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  server.close();
}
