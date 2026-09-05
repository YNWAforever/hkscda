import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repo = resolve(process.cwd());
const ref = process.env.BASELINE_REF;
const read = (path) => ref
  ? execFileSync("git", ["show", `${ref}:${path}`], { cwd: repo, encoding: "utf8" })
  : readFileSync(resolve(repo, path), "utf8");

const checks = [];
const check = (name, pass) => checks.push({ name, pass });
for (const path of [
  "src/routes/donate.tsx",
  "src/components/site/adoption/ApplicationWizard.tsx",
  "src/components/site/sponsorship/PledgeWizard.tsx",
  "src/components/site/volunteer/GroupEnquiryForm.tsx",
  "src/routes/volunteer.tsx",
]) {
  const source = read(path);
  check(`${path} clears consumed token`, source.includes("setTurnstileToken(null)"));
  check(`${path} remounts Turnstile after failure`, source.includes("turnstileResetKey"));
}
const widget = read("src/components/site/TurnstileWidget.tsx");
check("Turnstile exposes recovery action", widget.includes("resetKey") && widget.includes("重新載入人機驗證"));
const donate = read("src/routes/donate.tsx");
check("donation submit validates current published methods", donate.includes("isDonationMethodAvailable(method, initialMethods)"));
for (const path of [
  "src/routes/animals/cat_.$id.tsx",
  "src/routes/animals/dog_.$id.tsx",
  "src/routes/sponsors_.$id.tsx",
]) {
  const source = read(path);
  check(`${path} separates true 404 from outage`, source.includes("loadPublicDetailOrNotFound") && source.includes("notFoundComponent"));
}
for (const result of checks) console.log(`${result.pass ? "PASS" : "FAIL"} ${result.name}`);
const failed = checks.filter(({ pass }) => !pass).length;
console.log(`RESULT ${checks.length - failed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
