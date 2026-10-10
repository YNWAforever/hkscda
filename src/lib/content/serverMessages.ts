import type { AdminLanguage } from "../admin/language";

/**
 * The content API's messages and labels that are not English, which reach the admin content
 * screens. The server keeps sending the zh-HK text (`service.ts` and `repository.server.ts`), so
 * the admin screen finds the code here and writes the text for the admin's language. A test drives
 * the real service and repository to keep this table in step with what they send.
 *
 * Two kinds of text are here:
 * - the notice that comes back when a story update is saved with "create adopter drafts" ticked;
 * - the stand-in label the record search gives a record that has no name.
 *
 * Everything else the content routes send is already English, and the admin shows it as sent.
 * The drafts and social posts the service writes are outward copy for the people who read them,
 * not admin text: the admin shows them as stored.
 */
export type ContentServerMessageCode =
  | "internalUpdateNoDrafts"
  | "noAdoptersToContact"
  | "draftCreationFailed"
  | "unnamedAnimal"
  | "unnamedPerson"
  | "noCaseNumber"
  | "unnamedActivity";

const CONTENT_SERVER_MESSAGE_TEXT: Record<
  ContentServerMessageCode,
  Record<AdminLanguage, string>
> = {
  internalUpdateNoDrafts: {
    zh: "內部更新不會建立通知草稿。",
    en: "Internal updates do not create notification drafts. Make the update public if adopters should be told.",
  },
  noAdoptersToContact: {
    zh: "沒有可聯絡的領養者，已略過通知草稿。",
    en: "There are no adopters to contact, so no notification drafts were created. Check the adopters' contact details if you expected some.",
  },
  draftCreationFailed: {
    zh: "通知草稿建立失敗，更新已儲存。",
    en: "The update was saved, but its notification drafts could not be created. Select Create notification drafts on the update to try again.",
  },
  unnamedAnimal: { zh: "（未命名）", en: "(unnamed)" },
  // An adoption application and a supporter share this stand-in.
  unnamedPerson: { zh: "（未填姓名）", en: "(no name entered)" },
  noCaseNumber: { zh: "（無編號）", en: "(no case number)" },
  unnamedActivity: { zh: "（未命名活動）", en: "(unnamed activity)" },
};

/** The text for a server message code. Defaults to zh-HK, the text the API sends. */
export function contentServerMessageText(
  code: ContentServerMessageCode,
  language: AdminLanguage = "zh",
): string {
  return CONTENT_SERVER_MESSAGE_TEXT[code][language];
}

/** Every code, for a test that checks each one. */
export const contentServerMessageCodes = Object.keys(
  CONTENT_SERVER_MESSAGE_TEXT,
) as ContentServerMessageCode[];

/** The code for text that is exactly one of the zh-HK messages the content API sends, else `null`. */
export function contentServerMessageCode(text: unknown): ContentServerMessageCode | null {
  if (typeof text !== "string") return null;
  return (
    contentServerMessageCodes.find((code) => CONTENT_SERVER_MESSAGE_TEXT[code].zh === text) ?? null
  );
}

/**
 * A server message or stand-in label in the admin's language. Text that is not one of the known
 * messages (a record's own name, a reason in English) is returned as it came.
 */
export function contentServerMessage(text: string, language: AdminLanguage = "zh"): string {
  const code = contentServerMessageCode(text);
  return code ? contentServerMessageText(code, language) : text;
}
