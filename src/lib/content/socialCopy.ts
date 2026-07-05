import type { ContentDetail, SocialPlatform, StoryUpdate } from "./types";

export type SocialCopyDraft = {
  platform: SocialPlatform;
  language: "zh-HK";
  copyText: string;
  hashtags: string[];
};

export type GenerateSocialCopyInput = {
  content: ContentDetail;
  storyUpdate?: StoryUpdate | null;
  publicUrl: string;
};

const baseTags = ["#香港拯救貓狗協會", "#領養代替購買", "#支持救援"] as const;

function present(value: string | null | undefined): value is string {
  return Boolean(value);
}

function buildStoryLines(content: ContentDetail, storyUpdate: StoryUpdate | null | undefined) {
  const storyLine = content.storyProfile?.rescueRegion
    ? `救援地區：${content.storyProfile.rescueRegion}`
    : null;

  return [
    content.title,
    content.summary,
    storyLine,
    storyUpdate ? `最新近況：${storyUpdate.title}` : null,
    storyUpdate?.body,
  ].filter(present);
}

export function generateSocialCopyVariants(input: GenerateSocialCopyInput): SocialCopyDraft[] {
  const { content, publicUrl } = input;
  const storyUpdate =
    input.storyUpdate === undefined ? content.latestPublicUpdate : input.storyUpdate;
  const storyLines = buildStoryLines(content, storyUpdate);

  return [
    {
      platform: "facebook",
      language: "zh-HK",
      copyText: [...storyLines, `詳情：${publicUrl}`].join("\n"),
      hashtags: [...baseTags],
    },
    {
      platform: "instagram",
      language: "zh-HK",
      copyText: [...storyLines, "詳情請到 bio 或網站查看。", baseTags.join(" ")].join("\n"),
      hashtags: [...baseTags],
    },
    {
      platform: "whatsapp",
      language: "zh-HK",
      copyText: [...storyLines, `可按以下連結了解：${publicUrl}`].join("\n"),
      hashtags: [],
    },
  ];
}
