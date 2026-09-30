import { expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";
import { createSupabasePortalRepository } from "./portalRepository.server";

test("equal-time marketing withdrawal takes precedence over opt-in in the portal", async () => {
  const consentRows: Array<Record<string, string>> = [
    {
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      timestamp: "2026-09-27T00:00:00Z",
      status: "opt_in",
    },
    {
      id: "00000000-0000-4000-8000-000000000001",
      timestamp: "2026-09-27T00:00:00Z",
      status: "opt_out",
    },
  ];
  const client = createClient("https://example.invalid", "synthetic-key", {
    global: {
      fetch: Object.assign(
        async (input: Parameters<typeof fetch>[0]) => {
          const url = new URL(String(input));
          if (url.pathname.endsWith("/supporter"))
            return Response.json({ id: "synthetic-supporter" });
          if (!url.pathname.endsWith("/consent")) return Response.json([]);
          const order = (url.searchParams.get("order") ?? "").split(",");
          const sorted = [...consentRows].sort((a, b) => {
            for (const criterion of order) {
              const [column, direction] = criterion.split(".");
              const comparison = a[column].localeCompare(b[column]);
              if (comparison) return direction === "desc" ? -comparison : comparison;
            }
            return 0;
          });
          return Response.json(sorted.slice(0, Number(url.searchParams.get("limit"))));
        },
        { preconnect: () => undefined },
      ),
    },
  });
  const result = await createSupabasePortalRepository(client).listByEmail(
    "synthetic@example.invalid",
  );
  expect(result.marketingEmail).toBe("opt_out");
});
