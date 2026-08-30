import { z } from "zod";

const shortText = (max: number) => z.string().trim().min(1).max(max);

export const journeyStepSchema = z.object({
  title: shortText(40),
  description: shortText(300),
});

export const helpPathItemSchema = z.object({
  title: shortText(40),
  description: shortText(200),
  label: shortText(40),
});

export const aboutPageContentSchema = z.object({
  hero: z.object({ eyebrow: shortText(40), title: shortText(100), description: shortText(300) }),
  mission: z.object({
    eyebrow: shortText(40),
    title: shortText(100),
    body: shortText(500),
    sideBadge: shortText(60),
    sideBody: shortText(300),
  }),
  impact: z.object({ eyebrow: shortText(40), title: shortText(100), description: shortText(300) }),
  journey: z.object({
    eyebrow: shortText(40),
    title: shortText(100),
    steps: z.tuple([journeyStepSchema, journeyStepSchema, journeyStepSchema, journeyStepSchema]),
  }),
  communityBand: z.object({
    eyebrow: shortText(40),
    title: shortText(100),
    description: shortText(300),
    cccpCard: z.object({ title: shortText(40), description: shortText(200) }),
    tnrCard: z.object({ title: shortText(40), description: shortText(200) }),
  }),
  responsibleAdoption: z.object({
    eyebrow: shortText(40),
    title: shortText(100),
    body: shortText(500),
    linkLabel: shortText(40),
    sideTitle: shortText(100),
    principles: z.tuple([shortText(200), shortText(200), shortText(200)]),
  }),
  helpPaths: z.object({
    eyebrow: shortText(40),
    title: shortText(100),
    items: z.tuple([
      helpPathItemSchema,
      helpPathItemSchema,
      helpPathItemSchema,
      helpPathItemSchema,
    ]),
  }),
  closing: z.object({
    title: shortText(100),
    description: shortText(300),
    buttonLabel: shortText(40),
  }),
});

export const tnrStageSchema = z.object({ title: shortText(40), description: shortText(300) });

export const tnrPageContentSchema = z.object({
  hero: z.object({ eyebrow: shortText(40), title: shortText(100), description: shortText(500) }),
  stages: z.tuple([tnrStageSchema, tnrStageSchema, tnrStageSchema]),
  chapter: z.object({
    title: shortText(100),
    description: shortText(500),
    bullets: z.tuple([shortText(200), shortText(200), shortText(200)]),
  }),
  cta: z.object({
    eyebrow: shortText(40),
    title: shortText(100),
    descriptionPrefix: shortText(300),
  }),
});

export const cccpChapterSchema = z.object({ title: shortText(100), description: shortText(500) });
export const workRowSchema = z.object({
  scope: shortText(100),
  method: shortText(100),
  result: shortText(100),
});

export const cccpPageContentSchema = z.object({
  hero: z.object({ eyebrow: shortText(40), title: shortText(100), description: shortText(500) }),
  chapters: z.tuple([cccpChapterSchema, cccpChapterSchema]),
  workRows: z.tuple([workRowSchema, workRowSchema, workRowSchema]),
  workSectionTitle: shortText(60),
  cta: z.object({
    eyebrow: shortText(40),
    title: shortText(100),
    description: shortText(300),
    points: z.tuple([shortText(200), shortText(200), shortText(200)]),
  }),
});

export const ABOUT_PAGE_SLUGS = ["about", "tnr", "cccp"] as const;

export const PAGE_CONTENT_SCHEMAS = {
  about: aboutPageContentSchema,
  tnr: tnrPageContentSchema,
  cccp: cccpPageContentSchema,
} as const;

export const aboutPageUpsertRequestSchema = z.discriminatedUnion("pageSlug", [
  z.object({ pageSlug: z.literal("about"), content: aboutPageContentSchema }),
  z.object({ pageSlug: z.literal("tnr"), content: tnrPageContentSchema }),
  z.object({ pageSlug: z.literal("cccp"), content: cccpPageContentSchema }),
]);
