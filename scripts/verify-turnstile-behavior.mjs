// Run with node; builds only the isolated fixture, never the application.
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
execFileSync(
  "bun",
  [
    "build",
    "scripts/fixtures/turnstile-behavior.tsx",
    "--target",
    "browser",
    "--define",
    'import.meta.env.VITE_TURNSTILE_SITE_KEY="synthetic-test-key"',
    "--outfile",
    "docs/evidence/frontend-coverage/turnstile-fixture.js",
  ],
  { stdio: "pipe", windowsHide: true },
);
const bundle = await readFile("docs/evidence/frontend-coverage/turnstile-fixture.js", "utf8");
const server = createServer((req, res) => {
  res.setHeader("content-type", req.url === "/fixture.js" ? "text/javascript" : "text/html");
  res.end(
    req.url === "/fixture.js"
      ? bundle
      : '<div id="root"></div><script type="module" src="/fixture.js"></script>',
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch();
const page = await browser.newPage();
const results = [];
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
try {
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort(),
  );
  await page.addInitScript(() => {
    window.fixtureWidgets = [];
    window.fixtureRemoved = [];
    window.turnstile = {
      render: (_el, options) => {
        const id = String(window.fixtureWidgets.length);
        window.fixtureWidgets.push({ id, options });
        return id;
      },
      remove: (id) => window.fixtureRemoved.push(id),
      reset: () => {},
    };
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => window.fixtureWidgets?.length === 1);
  const verify = () =>
    page.evaluate(() => window.fixtureWidgets.at(-1).options.callback("synthetic-token"));
  const token = async (expected = "") => {
    await page.waitForFunction(
      (value) => document.querySelector("[data-token]")?.textContent === value,
      expected,
      { timeout: 3000 },
    );
    return page.locator("[data-token]").textContent();
  };
  await verify();
  await page.evaluate(() => window.fixtureWidgets.at(-1).options["expired-callback"]());
  results.push({ scenario: "expiry", token: await token(), expected: "" });
  await verify();
  await page.getByText("reset", { exact: true }).click();
  await page.waitForFunction(() => window.fixtureWidgets.length === 2);
  results.push({ scenario: "reset", token: await token(), expected: "" });
  await verify();
  await page.getByText("language", { exact: true }).click();
  await page.waitForFunction(() => window.fixtureWidgets.length === 3);
  results.push({
    scenario: "language",
    token: await token(),
    expected: "",
    language: await page.evaluate(() => window.fixtureWidgets.at(-1).options.language),
  });
  await page.evaluate(() => window.fixtureWidgets[1].options.callback("stale-token"));
  results.push({ scenario: "removed-callback", token: await token(), expected: "" });
  await verify();
  await page.getByText("toggle", { exact: true }).click();
  results.push({
    scenario: "unmount",
    token: await token(),
    expected: "",
    removed: await page.evaluate(() => window.fixtureRemoved.length),
  });
  await page.getByText("toggle", { exact: true }).click();
  await page.waitForFunction(() => window.fixtureWidgets.length === 4);
  results.push({ scenario: "remount", token: await token(), expected: "" });
  await verify();
  await page.evaluate(() => {
    window.fixtureWidgets[1].options["expired-callback"]();
    window.fixtureWidgets[1].options["error-callback"]();
  });
  results.push({
    scenario: "removed-expiry-error-cannot-clear-new-token",
    token: await token("synthetic-token"),
    expected: "synthetic-token",
  });
  if (errors.length) throw new Error(JSON.stringify(errors));
  await mkdir("docs/evidence/frontend-coverage", { recursive: true });
  await writeFile(
    "docs/evidence/frontend-coverage/turnstile-behavior.json",
    JSON.stringify(results, null, 2) + "\n",
  );
  console.log(JSON.stringify(results));
  if (results.some((x) => x.token !== x.expected)) process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
