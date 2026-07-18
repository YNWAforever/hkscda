import { z } from "zod";
import {
  donationContexts,
  donationPlacements,
  donationPurposes,
  donationTriggers,
  type DonationPlacement,
  type DonationTrigger,
} from "./contracts";
import type { DonationPromptProfile } from "./prompt";

export const donationAttributionSchema = z.object({
  source: z.literal("contextual-cta"),
  context: z.enum(donationContexts),
  purpose: z.enum(donationPurposes),
  placement: z.enum(donationPlacements),
  trigger: z.enum(donationTriggers),
});
export type DonationAttribution = z.infer<typeof donationAttributionSchema>;

export function buildDonationAttribution(
  profile: DonationPromptProfile,
  placement: DonationPlacement,
  trigger: DonationTrigger,
): DonationAttribution {
  return {
    source: "contextual-cta",
    context: profile.context,
    purpose: profile.purpose,
    placement,
    trigger,
  };
}

export function buildDonationPromptHref(value: DonationAttribution) {
  const attribution = donationAttributionSchema.parse(value);
  const params = new URLSearchParams([
    ["source", attribution.source],
    ["context", attribution.context],
    ["purpose", attribution.purpose],
    ["placement", attribution.placement],
    ["trigger", attribution.trigger],
  ]);
  return `/donate?${params.toString()}`;
}
