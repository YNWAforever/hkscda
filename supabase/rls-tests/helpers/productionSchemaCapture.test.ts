import { expect, spyOn, test } from "bun:test";
import { captureProductionSchema } from "./productionSchemaClone";

const catalog = {
  schemas: [],
  relations: [],
  columns: [],
  sequences: [],
  functions: [],
  constraints: [],
  indexes: [],
  triggers: [],
  policies: [],
  defaults: null,
  types: [],
  views: [],
  extensions: null,
  extensionMembers: [],
  databaseOwner: "postgres",
  roles: [],
  memberships: [],
};
const schema = "CREATE SCHEMA IF NOT EXISTS public;";

// Capture's only external dependency is process stdout. Intercept every spawn;
// no child process, connection, function invocation or provider request occurs.
async function withCaptureOutput(
  first: unknown,
  second: unknown,
  assertResult: () => Promise<void>,
  schemaOutput = schema,
) {
  let reads = 0;
  const commands: string[][] = [];
  const spawn = spyOn(Bun, "spawn").mockImplementation((...parameters: unknown[]) => {
    const argv: unknown = parameters[0];
    if (!Array.isArray(argv) || !argv.every((v: unknown) => typeof v === "string"))
      throw new Error("Unexpected capture process shape; no real spawn allowed");
    const args = argv as string[];
    commands.push([...args]);
    if (args[0] !== "bun" || args[1] !== "x" || args[2] !== "supabase@2.118.0")
      throw new Error("Unexpected capture executable; no real spawn allowed");
    const value = args.includes("query")
      ? JSON.stringify(reads++ === 0 ? first : second)
      : args.includes("dump")
        ? schemaOutput
        : undefined;
    if (value === undefined) throw new Error("Unexpected capture operation; no real spawn allowed");
    return {
      stdout: new Blob([value]).stream(),
      stderr: new Blob([]).stream(),
      exited: Promise.resolve(0),
    } as unknown as ReturnType<typeof Bun.spawn>;
  });
  try {
    await assertResult();
    expect(commands.length).toBeGreaterThan(0);
    expect(commands.every((args) => !args.includes("--data-only"))).toBe(true);
  } finally {
    spawn.mockRestore();
  }
}

test("production capture decodes the pinned CLI one-row array and keeps catalog stable", async () => {
  await withCaptureOutput([{ catalog }], [{ catalog }], async () => {
    const result = await captureProductionSchema();
    expect(result.catalog).toEqual(catalog);
    expect(result.schema).toBe(schema);
  });
});

for (const [label, payload] of [
  ["empty result", []],
  ["duplicate rows", [{ catalog }, { catalog }]],
  ["legacy unmeasured envelope", { rows: [{ catalog }] }],
  ["no catalog", [{}]],
  ["extra row field", [{ catalog, unexpected: true }]],
  ["null catalog", [{ catalog: null }]],
  ["scalar catalog", [{ catalog: "invalid" }]],
  ["missing catalog facet", [{ catalog: { defaults: null, extensions: null } }]],
  ["unknown catalog facet", [{ catalog: { ...catalog, unmeasured: [] } }]],
  ["invalid facet shape", [{ catalog: { ...catalog, relations: "invalid" } }]],
  ["invalid owner shape", [{ catalog: { ...catalog, databaseOwner: null } }]],
] as const) {
  test(`production capture refuses ${label}`, async () => {
    await withCaptureOutput(payload, payload, async () => {
      await expect(captureProductionSchema()).rejects.toThrow();
    });
  });
}

test("production capture still refuses catalog change across schema export", async () => {
  await withCaptureOutput(
    [{ catalog }],
    [{ catalog: { ...catalog, roles: [{ name: "changed" }] } }],
    async () => {
      await expect(captureProductionSchema()).rejects.toThrow("Production catalog changed");
    },
  );
});

test("production capture still refuses data-bearing schema statements", async () => {
  await withCaptureOutput(
    [{ catalog }],
    [{ catalog }],
    async () => {
      await expect(captureProductionSchema()).rejects.toThrow("Unsupported schema-only statement");
    },
    "INSERT INTO public.donation VALUES ('synthetic');",
  );
});
