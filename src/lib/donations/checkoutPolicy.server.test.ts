import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPublicCheckoutState } from "./checkoutPolicy.server";

const configId = "9a78c87c-1e3a-4c02-b551-71a9b69a5412";
const validApproval = {
  method: "stripe",
  purpose: "donation",
  config_id: configId,
  config_version: 3,
  enabled: true,
};
const validConfig = {
  id: configId,
  method: "stripe",
  state: "published",
  is_publicly_visible: true,
  version: 3,
  display_label_zh: "信用卡",
  display_label_en: "Card",
  details: {},
};
function fakeClient(input: {
  policy?: { data: unknown; error: unknown };
  approvals?: { data: unknown; error: unknown };
  configs?: { data: unknown; error: unknown };
}) {
  const reads: string[] = [];
  const responses: Record<string, { data: unknown; error: unknown }> = {
    checkout_policy: input.policy ?? { data: { enabled: false, version: 1 }, error: null },
    checkout_method_approval: input.approvals ?? { data: [validApproval], error: null },
    payment_public_config: input.configs ?? { data: [validConfig], error: null },
  };
  const client = {
    from(table: string) {
      reads.push(table);
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        in() {
          return Promise.resolve(responses[table]);
        },
        maybeSingle() {
          return Promise.resolve(responses[table]);
        },
        then(resolve: (result: { data: unknown; error: unknown }) => unknown) {
          return Promise.resolve(responses[table]).then(resolve);
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
  return { client, reads };
}

describe("loadPublicCheckoutState", () => {
  test("disabled policy returns no payment methods without reading configuration", async () => {
    const { client, reads } = fakeClient({});
    expect(await loadPublicCheckoutState(client)).toEqual({ state: "disabled", methods: [] });
    expect(reads).toEqual(["checkout_policy"]);
  });
  test("missing policy table is unavailable, never enabled", async () => {
    const { client } = fakeClient({ policy: { data: null, error: { code: "PGRST205" } } });
    expect(await loadPublicCheckoutState(client)).toEqual({ state: "unavailable", methods: [] });
  });
  test("enabled policy with no approved methods is not configured", async () => {
    const { client } = fakeClient({
      policy: { data: { enabled: true, version: 2 }, error: null },
      approvals: { data: [], error: null },
    });
    expect(await loadPublicCheckoutState(client)).toEqual({ state: "not_configured", methods: [] });
  });
  test("only matching published config is projected", async () => {
    const { client } = fakeClient({ policy: { data: { enabled: true, version: 2 }, error: null } });
    expect(await loadPublicCheckoutState(client)).toEqual({
      state: "ready",
      methods: [
        {
          method: "stripe",
          displayLabelZh: "信用卡",
          displayLabelEn: "Card",
          details: {},
          configId,
          configVersion: 3,
          purposes: ["donation"],
        },
      ],
    });
  });
  test("stale, hidden or malformed config makes availability unknown", async () => {
    for (const invalid of [
      { ...validConfig, version: 4 },
      { ...validConfig, is_publicly_visible: false },
      { ...validConfig, details: [] },
    ]) {
      const { client } = fakeClient({
        policy: { data: { enabled: true, version: 2 }, error: null },
        configs: { data: [invalid], error: null },
      });
      expect(await loadPublicCheckoutState(client)).toEqual({ state: "unavailable", methods: [] });
    }
  });
});
