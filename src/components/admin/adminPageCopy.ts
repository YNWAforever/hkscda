import { useAdminLanguage, type AdminLanguage } from "./adminI18n";
import { defineAdminCopy, pickAdminCopy } from "./i18n/copy";
import { casePageCopy } from "./pageCopy/caseCopy";
import { coordinatorPageCopy } from "./pageCopy/coordinatorCopy";
import { pledgePageCopy } from "./pageCopy/pledgeCopy";
import { sharedPageCopy } from "./pageCopy/sharedCopy";
import { supporterPageCopy } from "./pageCopy/supporterCopy";
import { taskPageCopy } from "./pageCopy/taskCopy";

export { formatAdminNumber } from "./i18n/format";

/**
 * The page copy for the coordinator, sponsorship and supporter screens in both
 * languages. It is written in the area modules under `./pageCopy/`, each built with
 * `defineAdminCopy` so that `tsc` rejects a missing translation; this module puts them
 * together under the one name the screens already import.
 */
export const adminPageCopy = defineAdminCopy({
  zh: {
    ...sharedPageCopy.zh,
    ...casePageCopy.zh,
    ...taskPageCopy.zh,
    ...coordinatorPageCopy.zh,
    ...pledgePageCopy.zh,
    ...supporterPageCopy.zh,
  },
  en: {
    ...sharedPageCopy.en,
    ...casePageCopy.en,
    ...taskPageCopy.en,
    ...coordinatorPageCopy.en,
    ...pledgePageCopy.en,
    ...supporterPageCopy.en,
  },
});

export function useAdminPageCopy() {
  const { language } = useAdminLanguage();
  return { language, pageCopy: pickAdminCopy(adminPageCopy, language) };
}

type StatusLabels = { labelZh?: string | null; labelEn?: string | null; key?: string };

/** Which label is shown first in each language, and which is the fallback behind it. */
const STATUS_LABEL_ORDER = {
  zh: ["labelZh", "labelEn"],
  en: ["labelEn", "labelZh"],
} as const;

export function statusDisplayName(status: StatusLabels, language: AdminLanguage) {
  const [primary, fallback] = STATUS_LABEL_ORDER[language];
  return status[primary] || status[fallback] || status.key || "-";
}

/**
 * The label of a status in a select or a list. Chinese lists both labels, the Chinese one
 * first, as the Chinese admin always has. English lists only the English label (the Chinese
 * label when the English one is empty), so no Chinese shows beside it.
 */
export function bilingualStatusName(status: StatusLabels, language: AdminLanguage) {
  const primary = statusDisplayName(status, language);
  if (language === "en") return primary;
  const secondary = status[STATUS_LABEL_ORDER[language][1]];
  if (!secondary || secondary === primary) return primary;
  return `${primary} / ${secondary}`;
}
