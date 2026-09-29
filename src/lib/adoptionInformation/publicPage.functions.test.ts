import { expect, mock, test } from "bun:test";
import { createAdoptionInstructionsLoader } from "./publicPage.loader";
mock.module("@tanstack/react-start", () => ({
  createServerFn: () => ({ handler: (fn: () => Promise<unknown>) => fn }),
}));
mock.module("./publicPage.server", () => ({
  loadPublicAdoptionPage: async () => {
    throw Object.assign(new Error("private alice@example.invalid"), { code: "42501" });
  },
}));
const { getPublicAdoptionPageResult } = await import("./publicPage.functions");
test("server read emits a sanitized reference envelope shared by client navigation and private logs", async () => {
  const logs: unknown[] = [];
  const previous = console.error;
  console.error = (...args: unknown[]) => void logs.push(args);
  try {
    // Execute the server-function handler, then serialize exactly what crosses the wire.
    const response = await getPublicAdoptionPageResult();
    const transferred = JSON.parse(JSON.stringify(response));
    expect(transferred.status).toBe("error");
    expect(typeof transferred.referenceId).toBe("string");
    const serverLog = JSON.stringify(logs);
    expect(serverLog).toContain(transferred.referenceId);
    expect(serverLog).toContain("42501");
    expect(serverLog).not.toContain("alice@example.invalid");
    expect(JSON.stringify(transferred)).not.toContain("42501");
    expect(JSON.stringify(transferred)).not.toContain("alice@example.invalid");
    logs.length = 0;
    const result = await createAdoptionInstructionsLoader(async () => transferred)();
    expect(result).toEqual(transferred);
    expect(logs).toHaveLength(0);
  } finally {
    console.error = previous;
  }
});
