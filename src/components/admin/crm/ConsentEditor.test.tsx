import { describe, expect, mock, test } from "bun:test";

import { renderAdminInEnglish } from "../i18n/testing";

process.env.VITE_SUPABASE_URL ??= "https://example.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY ??= "test-anon-key";

const realReactQuery = await import("@tanstack/react-query");

type MutationOptions = { onSuccess?: () => unknown };
let captured: MutationOptions | null = null;
let releaseInvalidation: () => void = () => {};
const invalidated: unknown[] = [];

mock.module("@tanstack/react-query", () => ({
  ...realReactQuery,
  useQueryClient: () => ({
    invalidateQueries: (filters: unknown) => {
      invalidated.push(filters);
      return new Promise<void>((resolve) => {
        releaseInvalidation = resolve;
      });
    },
  }),
  useMutation: (options: MutationOptions) => {
    captured = options;
    return { mutate: () => {}, isPending: false, isError: false, error: null };
  },
}));

const { ConsentEditor } = await import("./ConsentEditor");

describe("ConsentEditor", () => {
  test("BUG-48: a saved consent stays pending until the supporter refetch has settled", async () => {
    renderAdminInEnglish(
      <ConsentEditor supporterId="supporter-1" emailConsent="opt_out" whatsappConsent={null} />,
    );
    const onSuccess = captured?.onSuccess;
    expect(onSuccess).toBeDefined();

    // react-query keeps the mutation pending (and the button disabled) while the
    // promise onSuccess returns is unsettled; a fire-and-forget invalidation let a
    // double click append the same consents twice.
    let settled = false;
    const result = onSuccess?.();
    expect(result).toBeInstanceOf(Promise);
    void Promise.resolve(result).then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(invalidated).toEqual([{ queryKey: ["crm-supporter", "supporter-1"] }]);

    releaseInvalidation();
    await result;
    expect(settled).toBe(true);
  });
});
