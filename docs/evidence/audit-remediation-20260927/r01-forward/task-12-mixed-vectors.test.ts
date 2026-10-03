import { expect, test } from "bun:test";
import { unknownMixedVectors } from "./task-12-mixed-vectors";
import { isDeepStrictEqual } from "node:util";
const native = { catalog: "modern-catalog", helpers: "component-helper", native: "396", auth: "auth" };
const hosted = { catalog: "hosted-catalog", helpers: "hosted-helper", native: "396", auth: "auth" };
const modern = { catalog: "modern-catalog", helpers: "modern-helper", native: "392", auth: "auth" };
const component = { ...modern, helpers: "component-helper" };
test("equal catalog facet is not an unknown correlated vector", () => {
  expect(isDeepStrictEqual({ ...native, catalog: modern.catalog }, native)).toBe(true);
  const mixed = unknownMixedVectors(native, hosted, modern, [hosted, modern, component, native]);
  expect(mixed).toHaveLength(2);
  expect(mixed.every(m => [hosted, modern, component, native].every(p => !isDeepStrictEqual(p, m.vector)))).toBe(true);
});
test("an observed selected combination is refused before execution", () => {
  const admitted = { ...native, helpers: modern.helpers };
  expect(() => unknownMixedVectors(native, hosted, modern, [hosted, modern, component, native, admitted])).toThrow("actually observed");
});
