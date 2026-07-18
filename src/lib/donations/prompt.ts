import type { DonationContext, DonationPurpose } from "./contracts";

export type DonationPromptProfile = {
  context: DonationContext;
  purpose: DonationPurpose;
  zh: { message: string; action: string };
  en: { message: string; action: string };
};

const profiles: Record<DonationContext, DonationPromptProfile> = {
  general: {
    context: "general",
    purpose: "general",
    zh: { message: "每一份支持，都讓救援走得更遠", action: "立即捐助" },
    en: { message: "Every gift helps rescue work go further", action: "Donate now" },
  },
  story: {
    context: "story",
    purpose: "general",
    zh: { message: "讓下一個生命也迎來轉機", action: "支持救援" },
    en: { message: "Help the next rescued life find a new start", action: "Support rescue" },
  },
  animal: {
    context: "animal",
    purpose: "medical",
    zh: { message: "支持醫療、暫託及日常照護", action: "幫助牠們" },
    en: { message: "Support medical care, fostering, and daily care", action: "Help them" },
  },
  sponsor: {
    context: "sponsor",
    purpose: "sponsor",
    zh: { message: "未能助養，也可支持整體救援工作", action: "捐助支持" },
    en: { message: "Not ready to sponsor? You can still support rescue", action: "Donate" },
  },
  transparency: {
    context: "transparency",
    purpose: "general",
    zh: { message: "讓透明而持續的救援工作走得更遠", action: "立即捐助" },
    en: { message: "Help transparent, sustainable rescue work continue", action: "Donate now" },
  },
  community: {
    context: "community",
    purpose: "general",
    zh: { message: "支持前線救援及社區工作", action: "支持我們" },
    en: { message: "Support frontline rescue and community work", action: "Support us" },
  },
};

const excluded = [
  "/donate",
  "/admin",
  "/api",
  "/adoption/apply",
  "/adoption/status",
  "/sponsors/pledge",
  "/sponsors/status",
  "/volunteer/status",
];
const matches = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

export function resolveDonationPrompt(pathname: string): DonationPromptProfile | null {
  if (excluded.some((prefix) => matches(pathname, prefix))) return null;
  if (matches(pathname, "/stories")) return profiles.story;
  if (matches(pathname, "/animals") || matches(pathname, "/adoption")) return profiles.animal;
  if (matches(pathname, "/sponsors")) return profiles.sponsor;
  if (matches(pathname, "/about") || matches(pathname, "/reports")) return profiles.transparency;
  if (
    matches(pathname, "/volunteer") ||
    matches(pathname, "/help") ||
    matches(pathname, "/contact")
  )
    return profiles.community;
  return profiles.general;
}
