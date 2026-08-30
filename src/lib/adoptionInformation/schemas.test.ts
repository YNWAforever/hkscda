import { describe, expect, test } from "bun:test";

import {
  adminAdoptionInformationQuerySchema,
  adoptionFeeInputSchema,
  adoptionInformationMutationSchema,
  adoptionRuleInputSchema,
  careTopicInputSchema,
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
    expect(() =>
      adoptionFeeInputSchema.parse({
        animalType: "sponsor",
        itemName: "x",
        priceHkd: "0",
        sortOrder: 0,
      }),
    ).toThrow();
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

describe("adoptionRuleInputSchema", () => {
  test("accepts a valid bilingual rule", () => {
    const result = adoptionRuleInputSchema.parse({
      content: { "zh-HK": "規則內容", en: "Rule content" },
      sortOrder: 0,
      isPublished: true,
    });
    expect(result.content["zh-HK"]).toBe("規則內容");
    expect(result.content.en).toBe("Rule content");
  });

  test("defaults isPublished to true", () => {
    const result = adoptionRuleInputSchema.parse({
      content: { "zh-HK": "a", en: "b" },
      sortOrder: 0,
    });
    expect(result.isPublished).toBe(true);
  });

  test("rejects content over 500 characters", () => {
    expect(() =>
      adoptionRuleInputSchema.parse({
        content: { "zh-HK": "a".repeat(501), en: "b" },
        sortOrder: 0,
      }),
    ).toThrow();
  });

  test("rejects a missing English translation", () => {
    expect(() =>
      adoptionRuleInputSchema.parse({
        content: { "zh-HK": "a" },
        sortOrder: 0,
      }),
    ).toThrow();
  });
});

describe("careTopicInputSchema", () => {
  test("accepts a valid bilingual care topic", () => {
    const result = careTopicInputSchema.parse({
      animalType: "cat",
      label: { "zh-HK": "家居", en: "Home" },
      content: { "zh-HK": "內容", en: "Content" },
      sortOrder: 0,
      isPublished: true,
    });
    expect(result.animalType).toBe("cat");
    expect(result.label.en).toBe("Home");
  });

  test("rejects a label over 40 characters", () => {
    expect(() =>
      careTopicInputSchema.parse({
        animalType: "dog",
        label: { "zh-HK": "a".repeat(41), en: "b" },
        content: { "zh-HK": "a", en: "b" },
        sortOrder: 0,
      }),
    ).toThrow();
  });

  test("rejects content over 1000 characters", () => {
    expect(() =>
      careTopicInputSchema.parse({
        animalType: "dog",
        label: { "zh-HK": "a", en: "b" },
        content: { "zh-HK": "a".repeat(1001), en: "b" },
        sortOrder: 0,
      }),
    ).toThrow();
  });

  test("rejects an invalid animalType", () => {
    expect(() =>
      careTopicInputSchema.parse({
        animalType: "bird",
        label: { "zh-HK": "a", en: "b" },
        content: { "zh-HK": "a", en: "b" },
        sortOrder: 0,
      }),
    ).toThrow();
  });
});

describe("adminAdoptionInformationQuerySchema with the new resources", () => {
  test("accepts resource=rules", () => {
    expect(adminAdoptionInformationQuerySchema.parse({ resource: "rules" }).resource).toBe(
      "rules",
    );
  });

  test("accepts resource=careTopics", () => {
    expect(adminAdoptionInformationQuerySchema.parse({ resource: "careTopics" }).resource).toBe(
      "careTopics",
    );
  });
});

describe("adoptionInformationMutationSchema with the new resources", () => {
  test("accepts a rule mutation", () => {
    const parsed = adoptionInformationMutationSchema.parse({
      resource: "rule",
      input: { content: { "zh-HK": "a", en: "b" }, sortOrder: 0 },
    });
    expect(parsed.resource).toBe("rule");
  });

  test("accepts a careTopic mutation", () => {
    const parsed = adoptionInformationMutationSchema.parse({
      resource: "careTopic",
      input: {
        animalType: "cat",
        label: { "zh-HK": "a", en: "b" },
        content: { "zh-HK": "c", en: "d" },
        sortOrder: 0,
      },
    });
    expect(parsed.resource).toBe("careTopic");
  });
});
