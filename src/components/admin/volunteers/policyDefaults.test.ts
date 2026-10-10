import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { initialPolicyCatalogue } from "../../../lib/volunteers/policy/catalogue";
import { findChineseRuns } from "../i18n/testing";
import { policyAdvancedCopy } from "./policyAdvancedCopy";
import { copyOfTemplate, newPolicyRole } from "./policyDefaults";
import { policySettingsCopy } from "./policySettingsCopy";

const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

describe("the text a click writes into a policy", () => {
  // A policy is data that every language reads: the public sign-up page shows the label of a role. So
  // what the admin stores must not depend on the language that admin happened to read.
  test("a new role is labelled in Chinese whatever language the admin reads", () => {
    const role = newPolicyRole();
    expect(role.label).toBe(policyAdvancedCopy.zh.newRole);
    expect(role.label).not.toBe(policyAdvancedCopy.en.newRole);
    expect(findChineseRuns(role.label).length).toBeGreaterThan(0);
    expect(role).toEqual({
      key: "new_role",
      label: policyAdvancedCopy.zh.newRole,
      minimum: 0,
      reserved: 0,
      maximum: { state: "unlimited" },
      allowed_tiers: ["regular"],
      credentials: { mode: "all", keys: [] },
    });
  });

  test("a copy of a template is named in Chinese after the template it copies", () => {
    const draft = structuredClone(initialPolicyCatalogue[0]);
    const before = structuredClone(draft);
    const copy = copyOfTemplate(draft, "template-new");
    expect(copy.template_key).toBe("template-new");
    expect(copy.name).toBe(policySettingsCopy.zh.copyName(draft.name));
    expect(copy.name).not.toBe(policySettingsCopy.en.copyName(draft.name));
    expect(copy.name.endsWith("（副本）")).toBe(true);
    // The rest is a deep copy, and the template it copies is left as it was.
    expect({ ...copy, template_key: draft.template_key, name: draft.name }).toEqual(draft);
    expect(draft).toEqual(before);
    expect(copy.roles).not.toBe(draft.roles);
  });

  test("the screens write these defaults and not the text of the language being read", () => {
    const advanced = read("./PolicyAdvancedFields.tsx");
    const settings = read("./VolunteerPolicySettings.tsx");
    expect(advanced).toContain("newPolicyRole()");
    expect(settings).toContain("copyOfTemplate(");
    for (const source of [advanced, settings]) {
      expect(source).not.toMatch(/\bcopy\.(newRole|copyName)\b/);
    }
  });
});
