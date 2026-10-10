import type { PolicyDraft } from "../../../lib/volunteers/policy/schemas";
import { policyAdvancedCopy } from "./policyAdvancedCopy";
import { policySettingsCopy } from "./policySettingsCopy";

/**
 * Text that a click writes into a policy. A policy is data that every language reads (the public
 * volunteer sign-up page shows the label of a role), so what is stored does not depend on the language
 * of the admin who clicked: it is always the zh-HK default. These functions take no language for that
 * reason, and the screens show the stored text as it is, like any name staff typed.
 */

/** A role as "Add role" creates it. */
export function newPolicyRole(): PolicyDraft["roles"][number] {
  return {
    key: "new_role",
    label: policyAdvancedCopy.zh.newRole,
    minimum: 0,
    reserved: 0,
    maximum: { state: "unlimited" },
    allowed_tiers: ["regular"],
    credentials: { mode: "all", keys: [] },
  };
}

/** A copy of a template under a new key, named after the template it copies. */
export function copyOfTemplate(draft: PolicyDraft, templateKey: string): PolicyDraft {
  const next = structuredClone(draft);
  next.template_key = templateKey;
  next.name = policySettingsCopy.zh.copyName(draft.name);
  return next;
}
