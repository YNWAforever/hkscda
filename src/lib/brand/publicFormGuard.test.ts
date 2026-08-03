import { describe, expect, test } from "bun:test";

const files = [
  "src/components/site/adoption/ApplicationWizard.tsx",
  "src/components/site/adoption/WizardFields.tsx",
  "src/components/site/sponsorship/PledgeWizard.tsx",
  "src/routes/volunteer.tsx",
  "src/routes/donate.tsx",
];

describe("public transactional UI", () => {
  test("uses explicit alert semantics and no deprecated CTA/card system", async () => {
    const source = (await Promise.all(files.map((path) => Bun.file(path).text()))).join("\n");

    expect(source).toContain('role="alert"');
    expect(source).not.toContain("card-dashed");
    expect(source).not.toContain("btn-cta");
  });
});
