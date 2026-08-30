import { z } from "zod";

import {
  aboutPageContentSchema,
  cccpChapterSchema,
  cccpPageContentSchema,
  helpPathItemSchema,
  journeyStepSchema,
  tnrPageContentSchema,
  tnrStageSchema,
  workRowSchema,
} from "./schemas";

export type AboutPageSlug = "about" | "tnr" | "cccp";

export type JourneyStep = z.infer<typeof journeyStepSchema>;
export type HelpPathItem = z.infer<typeof helpPathItemSchema>;
export type TnrStage = z.infer<typeof tnrStageSchema>;
export type CccpChapter = z.infer<typeof cccpChapterSchema>;
export type WorkRow = z.infer<typeof workRowSchema>;

export type AboutPageContent = z.infer<typeof aboutPageContentSchema>;
export type TnrPageContent = z.infer<typeof tnrPageContentSchema>;
export type CccpPageContent = z.infer<typeof cccpPageContentSchema>;

export type AnyAboutPageContent = AboutPageContent | TnrPageContent | CccpPageContent;
