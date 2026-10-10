import type { PolicyLookups, policyChangeCopy } from "./policyChangeCopy";

/** One language's half of the policy change copy: the words and the rules for naming values. */
export type PolicyChangeCopy = (typeof policyChangeCopy)["zh"];

/** The key at the end of a path, such as `weekdays` for `schedule.weekdays`. */
export function lastKeyOf(path: string): string {
  return path.split(".").at(-1) ?? path;
}

/**
 * A value of a policy as the comparison writes it: nothing is "not set", a boolean is yes or no, a
 * list is its items one after the other, an object is its named parts, and any other value is named
 * by `copy.leaf`. `key` is the key that holds the value; it decides how a text or a number is named.
 */
export function describePolicyValue(
  value: unknown,
  copy: PolicyChangeCopy,
  lookups: PolicyLookups = {},
  key = "",
): string {
  if (value === undefined || value === null) return copy.notSet;
  if (typeof value === "boolean") return value ? copy.yes : copy.no;
  if (Array.isArray(value)) {
    return value.length
      ? value.map((item) => describePolicyValue(item, copy, lookups, key)).join(copy.itemSeparator)
      : copy.noItems;
  }
  if (typeof value === "object") {
    return Object.entries(value)
      .map(([name, part]) =>
        copy.field(copy.label(name), describePolicyValue(part, copy, lookups, name)),
      )
      .join(copy.fieldSeparator);
  }
  return copy.leaf(value as string | number, key, lookups);
}
