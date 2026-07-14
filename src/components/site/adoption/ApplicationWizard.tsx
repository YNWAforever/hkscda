import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  PawPrint,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm, type FieldErrors, type FieldPath, type Resolver } from "react-hook-form";

import { useShortlist } from "../ShortlistContext";
import { TurnstileWidget, turnstileEnabled } from "../TurnstileWidget";
import {
  ADOPTION_DRAFT_STORAGE_KEY,
  parseDraft,
  serializeDraft,
} from "../../../lib/publicAdoption/draft";
import {
  ADOPTION_TERMS_VERSION,
  expandedAdoptionApplicationSchema,
  MAX_ADOPTION_PREFERENCES,
  type ExpandedAdoptionApplication,
} from "../../../lib/publicAdoption/schemas";
import { cn } from "../../../lib/utils";
import { GuidancePanel } from "./GuidancePanel";
import { PhotoUploader } from "./PhotoUploader";
import type { SelectedPhoto } from "./photoUploaderLogic";
import {
  AnimalRankingFields,
  ContactFields,
  HomeFields,
  ReadinessFields,
  ReviewFields,
  VisitFields,
  type ApplicationFormValues,
  type RankedAnimalCard,
} from "./WizardFields";

const WIZARD_STEPS = [
  { id: "animals", zh: "動物排序", en: "Animal ranking" },
  { id: "contact", zh: "聯絡及家庭", en: "Contact and household" },
  { id: "home", zh: "家居環境", en: "Home environment" },
  { id: "readiness", zh: "照顧準備", en: "Care readiness" },
  { id: "visit", zh: "探望偏好", en: "Visit preferences" },
  { id: "photos", zh: "環境相片", en: "Photos" },
  { id: "review", zh: "檢查提交", en: "Review" },
] as const;

type WizardStepId = (typeof WIZARD_STEPS)[number]["id"];

const STEP_FIELDS: Record<WizardStepId, FieldPath<ApplicationFormValues>[]> = {
  animals: ["animalPreferences"],
  contact: [
    "language",
    "contact.applicantName",
    "contact.phone",
    "contact.email",
    "contact.address",
    "contact.preferredContactMethod",
    "contact.householdSize",
  ],
  home: [
    "home.housingType",
    "home.landlordRestrictions",
    "home.windowDoorSafety",
    "home.indoorSpaceNotes",
    "home.homeModificationsPossible",
  ],
  readiness: [
    "readiness.currentPets",
    "readiness.petCareExperience",
    "readiness.householdAgreement",
    "readiness.dailySchedule",
    "readiness.monthlyBudgetHkd",
    "readiness.emergencyCarePlan",
    "readiness.reason",
  ],
  visit: [
    "visit.dateRangeStart",
    "visit.dateRangeEnd",
    "visit.preferredTimeWindows",
    "visit.notes",
  ],
  photos: [],
  review: ["terms.agreed"],
};

type SubmissionResult = {
  applicationId: string;
  reference: string;
  statusUrl: string;
};

async function submitAdoptionApplication(
  payload: unknown,
  photos: SelectedPhoto[],
  turnstileToken: string | null,
) {
  const payloadObject =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  const body = new FormData();
  body.set(
    "payload",
    JSON.stringify({ ...payloadObject, turnstileToken: turnstileToken ?? undefined }),
  );
  for (const photo of photos) {
    body.append(`photo:${photo.category}`, photo.file, photo.file.name);
  }

  const response = await fetch("/api/adoption/applications", {
    method: "POST",
    body,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof result.error === "string" ? result.error : "提交失敗，請稍後再試。");
  }
  return result as { applicationId: string; reference: string; statusUrl: string };
}

function datePlusDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function createDefaultValues(): ApplicationFormValues {
  return {
    language: "zh-HK",
    animalPreferences: [],
    contact: {
      applicantName: "",
      phone: "",
      email: "",
      address: "",
      preferredContactMethod: "whatsapp",
      householdSize: undefined,
    },
    home: {
      housingType: "私人樓宇",
      landlordRestrictions: "",
      windowDoorSafety: "",
      indoorSpaceNotes: "",
      homeModificationsPossible: null,
    },
    readiness: {
      currentPets: "",
      petCareExperience: "",
      householdAgreement: "",
      dailySchedule: "",
      monthlyBudgetHkd: undefined,
      emergencyCarePlan: "",
      reason: "",
    },
    visit: {
      dateRangeStart: datePlusDays(3),
      dateRangeEnd: datePlusDays(17),
      preferredTimeWindows: [],
      notes: "",
    },
    terms: {
      agreed: false,
      version: ADOPTION_TERMS_VERSION,
    },
    sourceMetadata: {
      source: "public_adoption_wizard",
      draftVersion: ADOPTION_DRAFT_STORAGE_KEY,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeDraftValues(defaultValues: ApplicationFormValues, draft: Record<string, unknown>) {
  const contact = isRecord(draft.contact) ? draft.contact : {};
  const home = isRecord(draft.home) ? draft.home : {};
  const readiness = isRecord(draft.readiness) ? draft.readiness : {};
  const visit = isRecord(draft.visit) ? draft.visit : {};
  const terms = isRecord(draft.terms) ? draft.terms : {};
  const sourceMetadata = isRecord(draft.sourceMetadata) ? draft.sourceMetadata : {};

  return {
    ...defaultValues,
    language: draft.language === "en" || draft.language === "zh-HK" ? draft.language : "zh-HK",
    contact: { ...defaultValues.contact, ...contact },
    home: { ...defaultValues.home, ...home },
    readiness: { ...defaultValues.readiness, ...readiness },
    visit: {
      ...defaultValues.visit,
      ...visit,
      preferredTimeWindows: Array.isArray(visit.preferredTimeWindows)
        ? visit.preferredTimeWindows
        : defaultValues.visit.preferredTimeWindows,
    },
    terms: {
      ...defaultValues.terms,
      ...terms,
      version:
        typeof terms.version === "string" && terms.version ? terms.version : ADOPTION_TERMS_VERSION,
    },
    animalPreferences: [],
    sourceMetadata: { ...defaultValues.sourceMetadata, ...sourceMetadata },
  } as ApplicationFormValues;
}

function getErrorAtPath(errors: FieldErrors<ApplicationFormValues>, path: string) {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!isRecord(current)) return undefined;
    return current[key];
  }, errors);
}

function hasExpectedSubmissionResult(result: SubmissionResult) {
  return Boolean(result.applicationId && result.reference && result.statusUrl);
}

export function ApplicationWizard() {
  const { items, clearIntent, reorderAdoptions } = useShortlist();
  const defaultValues = useMemo(() => createDefaultValues(), []);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [submission, setSubmission] = useState<SubmissionResult | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"idle" | "restored" | "saved" | "unavailable">(
    "idle",
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    getValues,
    reset,
    setValue,
    trigger,
    watch,
  } = useForm<ApplicationFormValues>({
    defaultValues,
    resolver: zodResolver(expandedAdoptionApplicationSchema) as Resolver<ApplicationFormValues>,
    mode: "onTouched",
  });

  const currentStep = WIZARD_STEPS[currentStepIndex] ?? WIZARD_STEPS[0];
  const progress = ((currentStepIndex + 1) / WIZARD_STEPS.length) * 100;
  const watchedValues = watch();
  const language = watch("language");

  const adoptionItems = useMemo(
    () =>
      items
        .filter(
          (item): item is typeof item & { animalType: "cat" | "dog" } =>
            item.intent === "adoption" && (item.animalType === "cat" || item.animalType === "dog"),
        )
        .sort((left, right) => left.rank - right.rank)
        .slice(0, MAX_ADOPTION_PREFERENCES),
    [items],
  );

  const rankedAnimals = useMemo<RankedAnimalCard[]>(
    () =>
      adoptionItems.map((item, index) => ({
        animalId: item.id,
        animalName: item.name,
        animalType: item.animalType,
        imageUrl: item.imageUrl,
        rank: index + 1,
      })),
    [adoptionItems],
  );

  const rankedPreferences = useMemo(
    () =>
      rankedAnimals.map((animal) => ({
        rank: animal.rank,
        animalId: animal.animalId,
        animalName: animal.animalName,
        animalType: animal.animalType,
      })),
    [rankedAnimals],
  );

  const saveDraft = useCallback(() => {
    if (!storageReady || submission) return;
    try {
      window.localStorage.setItem(ADOPTION_DRAFT_STORAGE_KEY, serializeDraft(getValues()));
      setDraftStatus("saved");
    } catch {
      setDraftStatus("unavailable");
    }
  }, [getValues, storageReady, submission]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const restoredDraft = parseDraft(window.localStorage.getItem(ADOPTION_DRAFT_STORAGE_KEY));
        reset(mergeDraftValues(defaultValues, restoredDraft));
        setDraftStatus(Object.keys(restoredDraft).length > 0 ? "restored" : "idle");
      } catch {
        setDraftStatus("unavailable");
      } finally {
        setStorageReady(true);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [defaultValues, reset]);

  useEffect(() => {
    if (!storageReady) return;
    setValue("animalPreferences", rankedPreferences, {
      shouldDirty: true,
      shouldValidate: currentStep.id === "animals",
    });
  }, [currentStep.id, rankedPreferences, setValue, storageReady]);

  useEffect(() => {
    if (!storageReady || submission) return;
    const subscription = watch(() => saveDraft());
    return () => subscription.unsubscribe();
  }, [saveDraft, storageReady, submission, watch]);

  useEffect(() => {
    if (rankedAnimals.length === 0) setCurrentStepIndex(0);
  }, [rankedAnimals.length]);

  function moveAnimal(animalId: string, direction: "up" | "down") {
    const animalIds = rankedAnimals.map((animal) => animal.animalId);
    const currentIndex = animalIds.indexOf(animalId);
    const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= animalIds.length) return;

    const nextAnimalIds = [...animalIds];
    [nextAnimalIds[currentIndex], nextAnimalIds[nextIndex]] = [
      nextAnimalIds[nextIndex],
      nextAnimalIds[currentIndex],
    ];
    reorderAdoptions(nextAnimalIds);

    const nextPreferences = nextAnimalIds
      .map((id, index) => {
        const animal = rankedAnimals.find((item) => item.animalId === id);
        if (!animal) return null;
        return {
          rank: index + 1,
          animalId: animal.animalId,
          animalName: animal.animalName,
          animalType: animal.animalType,
        };
      })
      .filter((animal): animal is (typeof rankedPreferences)[number] => Boolean(animal));

    setValue("animalPreferences", nextPreferences, { shouldDirty: true, shouldValidate: true });
    saveDraft();
  }

  async function goToNextStep() {
    setServerError(null);
    if (currentStep.id === "photos" && photos.length === 0) {
      setServerError("請上載至少一張家居或窗門相片。");
      return;
    }
    const fields = STEP_FIELDS[currentStep.id];
    const valid = fields.length === 0 ? true : await trigger(fields, { shouldFocus: true });
    if (!valid) return;
    saveDraft();
    setCurrentStepIndex((index) => Math.min(index + 1, WIZARD_STEPS.length - 1));
  }

  function goToPreviousStep() {
    setServerError(null);
    saveDraft();
    setCurrentStepIndex((index) => Math.max(index - 1, 0));
  }

  function focusFirstInvalidStep(invalidErrors: FieldErrors<ApplicationFormValues>) {
    const invalidStepIndex = WIZARD_STEPS.findIndex((step) =>
      STEP_FIELDS[step.id].some((path) => Boolean(getErrorAtPath(invalidErrors, path))),
    );
    if (invalidStepIndex >= 0) setCurrentStepIndex(invalidStepIndex);
    setServerError("請檢查紅色提示，再提交申請。");
  }

  async function onSubmit(values: ApplicationFormValues) {
    setServerError(null);
    if (photos.length === 0) {
      setCurrentStepIndex(WIZARD_STEPS.findIndex((step) => step.id === "photos"));
      setServerError("請上載至少一張家居或窗門相片。");
      return;
    }
    if (turnstileEnabled && !turnstileToken) {
      setServerError("請先完成人機驗證。");
      return;
    }

    let result: SubmissionResult;
    try {
      const payload: ExpandedAdoptionApplication = expandedAdoptionApplicationSchema.parse(values);
      result = await submitAdoptionApplication(payload, photos, turnstileToken);
      if (!hasExpectedSubmissionResult(result)) {
        throw new Error("提交回覆不完整，請稍後再試。");
      }
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "提交失敗，請稍後再試。");
      return;
    }

    try {
      window.localStorage.removeItem(ADOPTION_DRAFT_STORAGE_KEY);
      setDraftStatus("idle");
    } catch {
      setDraftStatus("unavailable");
    }
    clearIntent("adoption");
    setSubmission(result);
  }

  function renderStep() {
    switch (currentStep.id) {
      case "animals":
        return <AnimalRankingFields animals={rankedAnimals} onMove={moveAnimal} />;
      case "contact":
        return <ContactFields register={register} errors={errors} />;
      case "home":
        return <HomeFields register={register} errors={errors} setValue={setValue} watch={watch} />;
      case "readiness":
        return <ReadinessFields register={register} errors={errors} />;
      case "visit":
        return (
          <VisitFields register={register} errors={errors} setValue={setValue} watch={watch} />
        );
      case "photos":
        return <PhotoUploader photos={photos} onPhotosChange={setPhotos} />;
      case "review":
        return (
          <ReviewFields
            values={watchedValues}
            photos={photos}
            register={register}
            errors={errors}
            turnstileSlot={
              <TurnstileWidget
                onVerify={setTurnstileToken}
                onExpire={() => setTurnstileToken(null)}
                language={language === "en" ? "en" : "zh-tw"}
                className="min-h-16"
              />
            }
          />
        );
    }
  }

  if (submission) {
    return (
      <main className="container-wide py-10">
        <section className="mx-auto max-w-2xl rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center shadow-soft">
          <CheckCircle2 className="mx-auto h-14 w-14 text-[var(--color-success)]" />
          <h1 className="mt-4 text-2xl font-bold text-[var(--color-panel)]">申請已提交</h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            參考編號：
            <span className="font-semibold text-[var(--color-panel)]">{submission.reference}</span>
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <a href={submission.statusUrl} className="btn-primary min-h-11">
              <ClipboardCheck className="h-4 w-4" />
              查看申請狀態
            </a>
            <Link to="/animals/cat" className="btn-outline">
              <PawPrint className="h-4 w-4" />
              返回動物列表
            </Link>
          </div>
        </section>
      </main>
    );
  }

  if (!storageReady) {
    return (
      <main className="container-wide py-10">
        <section className="mx-auto max-w-2xl rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center shadow-soft">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[var(--color-primary)]" />
          <h1 className="mt-4 text-2xl font-bold text-[var(--color-panel)]">領養申請</h1>
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">正在準備申請表...</p>
        </section>
      </main>
    );
  }

  if (rankedAnimals.length === 0) {
    return (
      <main className="container-wide py-10">
        <section className="mx-auto max-w-2xl rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center shadow-soft">
          <PawPrint className="mx-auto h-12 w-12 text-[var(--color-primary)]" />
          <h1 className="mt-4 text-2xl font-bold text-[var(--color-panel)]">
            請先選擇想領養的動物
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            申請表會根據你的領養清單建立動物排序，最多可選三隻。
          </p>
          <Link to="/animals/cat" className="btn-primary min-h-11 mt-6">
            <PawPrint className="h-4 w-4" />
            瀏覽可領養貓隻
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="bg-[var(--color-bg)] py-8">
      <div className="container-wide">
        <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold text-[var(--color-primary)]">Public adoption</p>
            <h1 className="text-3xl font-bold text-[var(--color-panel)]">領養申請</h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-text-muted)]">
              草稿會自動儲存在本機瀏覽器；環境相片不會被草稿保存，提交前請保持分頁開啟。
            </p>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]" role="status">
            {draftStatus === "restored"
              ? "已載入本機草稿"
              : draftStatus === "saved"
                ? "草稿已儲存"
                : draftStatus === "unavailable"
                  ? "本機草稿暫時不可用"
                  : "填寫後會自動儲存草稿"}
          </p>
        </header>

        <form
          onSubmit={handleSubmit(onSubmit, focusFirstInvalidStep)}
          className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]"
        >
          <input type="hidden" {...register("terms.version")} />

          <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-soft">
            <div className="border-b border-[var(--color-divider)] p-4">
              <div className="mb-3 h-2 overflow-hidden rounded-full bg-[var(--color-surface-offset)]">
                <div
                  className="h-full rounded-full bg-[var(--color-primary)] transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
                {WIZARD_STEPS.map((step, index) => {
                  const complete = index < currentStepIndex;
                  const active = index === currentStepIndex;
                  return (
                    <li
                      key={step.id}
                      aria-current={active ? "step" : undefined}
                      className={cn(
                        "rounded-md border px-3 py-2 text-xs",
                        active
                          ? "border-[var(--color-primary)] bg-[var(--color-primary-highlight)] text-[var(--color-panel)]"
                          : complete
                            ? "border-[var(--color-border)] bg-[var(--color-surface-offset)] text-[var(--color-panel)]"
                            : "border-[var(--color-border)] text-[var(--color-text-muted)]",
                      )}
                    >
                      <span className="block font-semibold">
                        {index + 1}. {step.zh}
                      </span>
                      <span>{step.en}</span>
                    </li>
                  );
                })}
              </ol>
            </div>

            <div className="p-4 sm:p-6">
              <div className="mb-5">
                <p className="text-sm font-semibold text-[var(--color-primary)]">
                  Step {currentStepIndex + 1} of {WIZARD_STEPS.length}
                </p>
                <h2 className="mt-1 text-2xl font-bold text-[var(--color-panel)]">
                  {currentStep.zh}
                </h2>
                <p className="text-sm text-[var(--color-text-muted)]">{currentStep.en}</p>
              </div>

              {renderStep()}

              {serverError ? (
                <p
                  className="mt-4 rounded-md bg-[var(--color-primary-highlight)] px-3 py-2 text-sm text-[var(--color-error)]"
                  role="alert"
                >
                  {serverError}
                </p>
              ) : null}

              <div className="mt-6 flex flex-col-reverse gap-3 border-t border-[var(--color-divider)] pt-4 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={goToPreviousStep}
                  disabled={currentStepIndex === 0 || isSubmitting}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-panel)] hover:bg-[var(--color-surface-offset)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ArrowLeft className="h-4 w-4" />
                  上一步
                </button>

                {currentStep.id === "review" ? (
                  <button
                    type="submit"
                    disabled={isSubmitting || (turnstileEnabled && !turnstileToken)}
                    className="btn-primary min-h-11"
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    {isSubmitting ? "提交中" : "提交申請"}
                  </button>
                ) : (
                  <button type="button" onClick={goToNextStep} className="btn-primary min-h-11">
                    下一步
                    <ArrowRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </section>

          <GuidancePanel stepId={currentStep.id} />
        </form>
      </div>
    </main>
  );
}
