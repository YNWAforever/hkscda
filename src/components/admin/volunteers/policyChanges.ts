export type PolicyChange = { path: string; before: unknown; after: unknown };
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
export function policyChanges(before: unknown, after: unknown, path = ""): PolicyChange[] {
  if (object(before) && object(after))
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap((key) =>
      policyChanges(before[key], after[key], path ? `${path}.${key}` : key),
    );
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  return [{ path, before, after }];
}
