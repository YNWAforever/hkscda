import { describe, expect, test } from "bun:test";

import {
  aboutPageContentSchema,
  aboutPageUpsertRequestSchema,
  cccpPageContentSchema,
  tnrPageContentSchema,
} from "./schemas";

const validAbout = {
  hero: { eyebrow: "e", title: "t", description: "d" },
  mission: { eyebrow: "e", title: "t", body: "b", sideBadge: "s", sideBody: "s" },
  impact: { eyebrow: "e", title: "t", description: "d" },
  journey: {
    eyebrow: "e",
    title: "t",
    steps: [
      { title: "1", description: "d" },
      { title: "2", description: "d" },
      { title: "3", description: "d" },
      { title: "4", description: "d" },
    ],
  },
  communityBand: {
    eyebrow: "e",
    title: "t",
    description: "d",
    cccpCard: { title: "t", description: "d" },
    tnrCard: { title: "t", description: "d" },
  },
  responsibleAdoption: {
    eyebrow: "e",
    title: "t",
    body: "b",
    linkLabel: "l",
    sideTitle: "s",
    principles: ["1", "2", "3"],
  },
  helpPaths: {
    eyebrow: "e",
    title: "t",
    items: [
      { title: "1", description: "d", label: "l" },
      { title: "2", description: "d", label: "l" },
      { title: "3", description: "d", label: "l" },
      { title: "4", description: "d", label: "l" },
    ],
  },
  closing: { title: "t", description: "d", buttonLabel: "b" },
};

const validTnr = {
  hero: { eyebrow: "e", title: "t", description: "d" },
  stages: [
    { title: "1", description: "d" },
    { title: "2", description: "d" },
    { title: "3", description: "d" },
  ],
  chapter: { title: "t", description: "d", bullets: ["1", "2", "3"] },
  cta: { eyebrow: "e", title: "t", descriptionPrefix: "p" },
};

const validCccp = {
  hero: { eyebrow: "e", title: "t", description: "d" },
  chapters: [
    { title: "1", description: "d" },
    { title: "2", description: "d" },
  ],
  workRows: [
    { scope: "s", method: "m", result: "r" },
    { scope: "s", method: "m", result: "r" },
    { scope: "s", method: "m", result: "r" },
  ],
  workSectionTitle: "w",
  cta: { eyebrow: "e", title: "t", description: "d", points: ["1", "2", "3"] },
};

describe("aboutPageContentSchema", () => {
  test("accepts the full valid shape", () => {
    expect(aboutPageContentSchema.safeParse(validAbout).success).toBe(true);
  });

  test("rejects a journey with only 3 steps", () => {
    const invalid = {
      ...validAbout,
      journey: { ...validAbout.journey, steps: validAbout.journey.steps.slice(0, 3) },
    };
    expect(aboutPageContentSchema.safeParse(invalid).success).toBe(false);
  });

  test("rejects an empty hero title", () => {
    const invalid = { ...validAbout, hero: { ...validAbout.hero, title: "" } };
    expect(aboutPageContentSchema.safeParse(invalid).success).toBe(false);
  });

  test("rejects a mission body over 500 characters", () => {
    const invalid = { ...validAbout, mission: { ...validAbout.mission, body: "x".repeat(501) } };
    expect(aboutPageContentSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("tnrPageContentSchema", () => {
  test("accepts the full valid shape", () => {
    expect(tnrPageContentSchema.safeParse(validTnr).success).toBe(true);
  });

  test("rejects only 2 stages", () => {
    const invalid = { ...validTnr, stages: validTnr.stages.slice(0, 2) };
    expect(tnrPageContentSchema.safeParse(invalid).success).toBe(false);
  });

  test("rejects only 2 chapter bullets", () => {
    const invalid = { ...validTnr, chapter: { ...validTnr.chapter, bullets: ["1", "2"] } };
    expect(tnrPageContentSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("cccpPageContentSchema", () => {
  test("accepts the full valid shape", () => {
    expect(cccpPageContentSchema.safeParse(validCccp).success).toBe(true);
  });

  test("rejects only 1 chapter", () => {
    const invalid = { ...validCccp, chapters: validCccp.chapters.slice(0, 1) };
    expect(cccpPageContentSchema.safeParse(invalid).success).toBe(false);
  });

  test("rejects only 2 work rows", () => {
    const invalid = { ...validCccp, workRows: validCccp.workRows.slice(0, 2) };
    expect(cccpPageContentSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("aboutPageUpsertRequestSchema", () => {
  test("routes each pageSlug to its own content schema", () => {
    expect(
      aboutPageUpsertRequestSchema.safeParse({ pageSlug: "about", content: validAbout }).success,
    ).toBe(true);
    expect(
      aboutPageUpsertRequestSchema.safeParse({ pageSlug: "tnr", content: validTnr }).success,
    ).toBe(true);
    expect(
      aboutPageUpsertRequestSchema.safeParse({ pageSlug: "cccp", content: validCccp }).success,
    ).toBe(true);
  });

  test("rejects tnr content submitted under the about slug", () => {
    expect(
      aboutPageUpsertRequestSchema.safeParse({ pageSlug: "about", content: validTnr }).success,
    ).toBe(false);
  });

  test("rejects an unknown pageSlug", () => {
    expect(
      aboutPageUpsertRequestSchema.safeParse({ pageSlug: "team", content: validAbout }).success,
    ).toBe(false);
  });
});
