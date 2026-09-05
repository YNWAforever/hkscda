import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const cases = [
  ["donation", "src/routes/donate.tsx", "handleSubmit"],
  ["volunteer", "src/routes/volunteer.tsx", "handleSubmit"],
  ["group enquiry", "src/components/site/volunteer/GroupEnquiryForm.tsx", "handleSubmit"],
  ["sponsorship", "src/components/site/sponsorship/PledgeWizard.tsx", "handleSubmit"],
  ["adoption", "src/components/site/adoption/ApplicationWizard.tsx", "onSubmit"],
] as const;

// Execute each current production submit callback in isolation. Every state setter
// is observed: an error may change status/token only, never entered field state.
// This covers callback behavior, not browser rendering or real upload transport.
for (const [name, path, functionName] of cases) {
  test(`${name} failed submission preserves entered fields and requests fresh verification`, async () => {
    const source = readFileSync(
      fileURLToPath(new URL(`../../../${path}`, import.meta.url)),
      "utf8",
    );
    const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let callback = "";
    const visit = (node: ts.Node) => {
      if (ts.isFunctionDeclaration(node) && node.name?.text === functionName)
        callback = node.getText(ast);
      ts.forEachChild(node, visit);
    };
    visit(ast);
    expect(callback).not.toBe("");
    const compiled = new Bun.Transpiler({ loader: "ts" }).transformSync(callback);
    const calls: Array<[string, unknown]> = [];
    let attempts = 0;
    const fail = async () => {
      attempts++;
      throw new Error("Synthetic submit failure");
    };
    const scope: Record<string, unknown> = {
      checkoutEnabled: true,
      turnstileEnabled: true,
      turnstileToken: "synthetic-token",
      amountHkd: 100,
      selectedActivity: { id: "activity" },
      photos: [new File(["fixture"], "photo.jpg")],
      sponsorshipItems: [{ rank: 1, id: "animal", name: "Fixture" }],
      expandedAdoptionApplicationSchema: { parse: (value: unknown) => value },
      submitAdoptionApplication: fail,
      fetch: fail,
      isDonationMethodAvailable: () => true,
      checkoutExperienceFromViewport: () => "desktop",
      createDonationRequest: (value: unknown) => value,
      buildVolunteerRegistrationPayload: (value: unknown) => value,
      buildGroupEnquiryPayload: (value: unknown) => value,
      resolvePledgeSubmissionIds: async () => ({ pledgeId: "fixture", proof: null }),
      saveDraft: () => {},
      t: { submitError: "Synthetic error" },
      window: { innerWidth: 1024 },
      console: { error: () => {} },
      Number,
      JSON,
      Error,
      Math,
    };
    const context = new Proxy(scope, {
      has: () => true,
      get(target, key) {
        if (key === Symbol.unscopables) return undefined;
        if (typeof key === "string" && (key.startsWith("set") || key === "reset"))
          return (value: unknown) =>
            calls.push([key, typeof value === "function" ? value(0) : value]);
        return target[key as string];
      },
    });
    const run = new Function("scope", `with(scope) { ${compiled}; return ${functionName}; }`)(
      context,
    );
    const entered = {
      preventDefault() {},
      contact: { name: "Synthetic Ada", email: "ada@example.invalid" },
      notes: "Keep this draft",
    };
    const before = JSON.stringify(entered);
    await run(entered);
    expect(attempts).toBe(1);
    expect(JSON.stringify(entered)).toBe(before);
    expect(calls).toContainEqual(["setTurnstileToken", null]);
    expect(calls).toContainEqual(["setTurnstileResetKey", 1]);
    const allowed = new Set([
      "setError",
      "setServerError",
      "setSubmitError",
      "setLoading",
      "setSubmitting",
      "setTurnstileToken",
      "setTurnstileResetKey",
      "setSuccess",
      "setSuccessUrl",
      "setManualResult",
    ]);
    expect(calls.filter(([setter]) => !allowed.has(setter))).toEqual([]);
    expect(
      calls.some(
        ([setter, value]) =>
          ["setError", "setServerError", "setSubmitError"].includes(setter) && value,
      ),
    ).toBe(true);
  });
}
