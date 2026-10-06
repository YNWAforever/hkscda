import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("lockfile excludes vulnerable TanStack Start versions (GHSA-qx66-fv34-fjm8)", () => {
  const lockfile = readFileSync(join(process.cwd(), "bun.lock"), "utf8");
  const minimums = {
    "@tanstack/react-start": [1, 168, 60],
    "@tanstack/start-server-core": [1, 169, 39],
  } as const;
  const resolved = [
    ...lockfile.matchAll(/"(@tanstack\/(?:react-start|start-server-core))@([^"]+)"/g),
  ];

  for (const [name, minimum] of Object.entries(minimums)) {
    const versions = resolved.filter((match) => match[1] === name).map((match) => match[2]);
    expect(versions.length, `${name} must be present in the resolved lockfile`).toBeGreaterThan(0);
    for (const version of versions) {
      expect(version, `${name} must resolve to a reviewed stable version`).toMatch(
        /^\d+\.\d+\.\d+$/,
      );
      const parts = version.split(".").map(Number);
      const atLeastMinimum =
        parts[0] > minimum[0] ||
        (parts[0] === minimum[0] && parts[1] > minimum[1]) ||
        (parts[0] === minimum[0] && parts[1] === minimum[1] && parts[2] >= minimum[2]);
      expect(
        atLeastMinimum,
        `${name}@${version} is below the security patch ${minimum.join(".")}`,
      ).toBe(true);
    }
  }
});
