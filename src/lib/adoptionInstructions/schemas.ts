import { z } from "zod";

const forbiddenPlainText = /<|>|javascript:|https:\/\/|http:\/\/|www\./i;
const plainText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !forbiddenPlainText.test(value), "Must be plain text");

const careSectionSchema = z.object({ title: plainText(180) }).strict();

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
    rules: z.object({ title: plainText(180) }).strict(),
    care: z.object({ cat: careSectionSchema, dog: careSectionSchema }).strict(),
  })
  .strict();
