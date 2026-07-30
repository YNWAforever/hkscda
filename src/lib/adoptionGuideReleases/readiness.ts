import type {
  AdoptionGuideAssetVerification,
  AdoptionGuideReadiness,
  AdoptionGuideReadinessIssue,
  AdoptionGuideRelease,
  AdoptionGuideSpecies,
} from "./types";

const slotKeys: Record<AdoptionGuideSpecies, string> = {
  cat: "post_adoption_guide_cat",
  dog: "post_adoption_guide_dog",
  general: "post_adoption_guide_general",
};

export function slotKeyForSpecies(species: AdoptionGuideSpecies) {
  return slotKeys[species];
}

type AdoptionGuideReadinessAssets = {
  zhHk: AdoptionGuideAssetVerification | null;
  en: AdoptionGuideAssetVerification | null;
};

type AssetRequirement = {
  verification: AdoptionGuideAssetVerification | null;
  releaseAssetId: string | null;
  field: "zhHkAssetId" | "enAssetId";
  language: "zh-HK" | "en";
  label: "Chinese (Hong Kong)" | "English";
  codePrefix: "chinese" | "english";
};

function validateAsset(requirement: AssetRequirement, issues: AdoptionGuideReadinessIssue[]) {
  const { codePrefix, field, label, language, releaseAssetId, verification } = requirement;

  if (!releaseAssetId || !verification) {
    issues.push({
      field,
      code: `${codePrefix}_asset_required`,
      message: `${label} PDF is required before submission.`,
    });
    return;
  }

  if (verification.asset.id !== releaseAssetId) {
    issues.push({
      field,
      code: `${codePrefix}_asset_id_mismatch`,
      message: `${label} PDF does not match the release asset.`,
    });
  }

  if (verification.asset.kind !== "adoption_guide") {
    issues.push({
      field: "assets",
      code: `${codePrefix}_asset_kind_invalid`,
      message: `${label} asset must be an adoption guide.`,
    });
  }

  if (verification.asset.language !== language) {
    issues.push({
      field: "assets",
      code: `${codePrefix}_asset_language_invalid`,
      message: `${label} asset must use the ${language} language.`,
    });
  }

  if (verification.asset.mimeType !== "application/pdf") {
    issues.push({
      field: "assets",
      code: `${codePrefix}_asset_mime_type_invalid`,
      message: `${label} asset must be a PDF.`,
    });
  }

  if (!verification.objectVerified) {
    issues.push({
      field: "assets",
      code: `${codePrefix}_asset_unverified`,
      message: `${label} PDF must be verified in Storage before submission.`,
    });
  }
}

export function evaluateAdoptionGuideReadiness(
  release: AdoptionGuideRelease,
  assets: AdoptionGuideReadinessAssets,
): AdoptionGuideReadiness {
  const issues: AdoptionGuideReadinessIssue[] = [];

  validateAsset(
    {
      verification: assets.zhHk,
      releaseAssetId: release.zhHkAssetId,
      field: "zhHkAssetId",
      language: "zh-HK",
      label: "Chinese (Hong Kong)",
      codePrefix: "chinese",
    },
    issues,
  );
  validateAsset(
    {
      verification: assets.en,
      releaseAssetId: release.enAssetId,
      field: "enAssetId",
      language: "en",
      label: "English",
      codePrefix: "english",
    },
    issues,
  );

  if (!release.knowledgeTitle.trim()) {
    issues.push({
      field: "knowledgeTitle",
      code: "knowledge_title_required",
      message: "Knowledge title is required before submission.",
    });
  }

  if (!release.knowledgeTopic.trim()) {
    issues.push({
      field: "knowledgeTopic",
      code: "knowledge_topic_required",
      message: "Knowledge topic is required before submission.",
    });
  }

  if (!release.knowledgeShortIntro.trim()) {
    issues.push({
      field: "knowledgeShortIntro",
      code: "knowledge_short_intro_required",
      message: "Knowledge short introduction is required before submission.",
    });
  }

  return { ready: issues.length === 0, issues };
}
