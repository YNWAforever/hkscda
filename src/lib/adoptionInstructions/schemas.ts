import { z } from "zod";

const forbiddenPlainText = /<|>|javascript:|https:\/\/|http:\/\/|www\./i;
const idPattern = /^[a-z0-9][a-z0-9_-]{0,79}$/;

const plainText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !forbiddenPlainText.test(value), "Must be plain text");

const stableId = z.string().regex(idPattern);

const ruleSchema = z.object({ id: stableId, text: plainText(1_000) }).strict();
const careTopicSchema = z
  .object({
    id: stableId,
    value: stableId,
    label: plainText(120),
    content: plainText(2_000),
  })
  .strict();

const uniqueIds = <T extends { id: string }>(items: T[]) =>
  new Set(items.map((item) => item.id)).size === items.length;
const uniqueValues = (items: Array<{ value: string }>) =>
  new Set(items.map((item) => item.value)).size === items.length;

const careSectionSchema = z
  .object({ title: plainText(180), topics: z.array(careTopicSchema).max(30) })
  .strict()
  .superRefine(({ topics }, ctx) => {
    if (!uniqueIds(topics)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Topic IDs must be unique", path: ["topics"] });
    }
    if (!uniqueValues(topics)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Topic values must be unique", path: ["topics"] });
    }
  });

export const adoptionInstructionContentSchema = z
  .object({
    hero: z
      .object({ eyebrow: plainText(120), title: plainText(180), description: plainText(500) })
      .strict(),
    fees: z
      .object({
        sectionTitle: plainText(180),
        dogTitle: plainText(180),
        catTitle: plainText(180),
        itemLabel: plainText(120),
        amountLabel: plainText(120),
        notice: plainText(500),
      })
      .strict(),
    estates: z
      .object({
        sectionTitle: plainText(180),
        introduction: plainText(500),
        estateLabel: plainText(120),
        districtLabel: plainText(120),
        notesLabel: plainText(120),
        emptyState: plainText(500),
      })
      .strict(),
    guides: z
      .object({
        sectionTitle: plainText(180),
        catTitle: plainText(180),
        dogTitle: plainText(180),
        generalTitle: plainText(180),
        zhHkActionLabel: plainText(120),
        enActionLabel: plainText(120),
      })
      .strict(),
    rules: z
      .object({ title: plainText(180), items: z.array(ruleSchema).max(50) })
      .strict()
      .superRefine(({ items }, ctx) => {
        if (!uniqueIds(items)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Rule IDs must be unique", path: ["items"] });
        }
      }),
    care: z.object({ cat: careSectionSchema, dog: careSectionSchema }).strict(),
  })
  .strict();
