import type { ValidatorAdapter } from "@tanstack/react-router";
import type { z } from "zod";

/**
 * A TanStack Router search validator for a zod schema.
 *
 * zod 4 implements Standard Schema, and the router's Standard-Schema path infers the parsed
 * output as the route's search *input*: every defaulted/caught filter (`page`, `filter`, …)
 * becomes a required `<Link search>` prop, which breaks every link to the route. The adapter
 * exposes the schema's input side (all keys optional) separately from its parsed output, so
 * navigation keeps working while `Route.useSearch()` still sees the parsed values. The schema
 * still parses every URL search, with the same defaults and catches as before.
 */
export function searchValidator<T extends z.ZodType>(
  schema: T,
): ValidatorAdapter<Partial<z.output<T>>, z.output<T>> {
  return {
    parse: (input: unknown) => schema.parse(input),
    // Type carriers only; the values are never read at runtime.
    types: { input: {}, output: {} } as {
      input: Partial<z.output<T>>;
      output: z.output<T>;
    },
  };
}
