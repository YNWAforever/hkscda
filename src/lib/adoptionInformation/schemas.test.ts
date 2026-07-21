import { describe, expect, test } from "bun:test";

import {
  adminAdoptionInformationQuerySchema,
  adoptionFeeInputSchema,
  estateInputSchema,
} from "./schemas";

describe("adoption information schemas", () => {
  test("trims filters and bounds admin pagination", () => {
    expect(
      adminAdoptionInformationQuerySchema.parse({
        resource: "estates",
        q: "  Sai Kung  ",
        page: "0",
        pageSize: "500",
      }),
    ).toEqual({ resource: "estates", q: "Sai Kung", animalType: undefined, page: 1, pageSize: 50 });
  });

  test("preserves fee prices as text and allows only dog or cat", () => {
    expect(
      adoptionFeeInputSchema.parse({
        animalType: "dog",
        itemName: "  PROHEART Injection  ",
        priceHkd: " 300–600 ",
        sortOrder: 2,
        isPublished: true,
      }),
    ).toMatchObject({ itemName: "PROHEART Injection", priceHkd: "300–600" });
    expect(() => adoptionFeeInputSchema.parse({ animalType: "sponsor", itemName: "x", priceHkd: "0", sortOrder: 0 })).toThrow();
  });

  test("trims estate fields while retaining optional notes", () => {
    expect(
      estateInputSchema.parse({
        estateName: "  Harbour View  ",
        district: "  Sai Kung  ",
        notes: "  Ask management  ",
        sortOrder: 1,
        isPublished: false,
      }),
    ).toMatchObject({ estateName: "Harbour View", district: "Sai Kung", notes: "Ask management" });
  });
});
