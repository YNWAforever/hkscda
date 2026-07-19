import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Cat, Dog, GripVertical } from "lucide-react";
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import type { FieldErrors, UseFormRegister, UseFormSetValue, UseFormWatch } from "react-hook-form";
import { z } from "zod";

import { cn } from "../../../lib/utils";
import { expandedAdoptionApplicationSchema } from "../../../lib/publicAdoption/schemas";
import {
  CAT_VISIT_WINDOWS,
  DOG_VISIT_WINDOWS,
  type CatVisitWindow,
  type DogVisitWindow,
  type VisitWindow,
} from "../../../lib/publicAdoption/visitWindows";
import { Input } from "../../ui/input";
import { Textarea } from "../../ui/textarea";
import { PHOTO_CATEGORY_LABELS, type SelectedPhoto } from "./photoUploaderLogic";

type SchemaApplicationInput = z.input<typeof expandedAdoptionApplicationSchema>;

export type ApplicationFormValues = Omit<SchemaApplicationInput, "terms"> & {
  terms: {
    agreed: boolean;
    version: string;
  };
};

export type RankedAnimalCard = {
  animalId: string;
  animalName: string;
  animalType: "cat" | "dog";
  rank: number;
  imageUrl: string | null;
};

type BaseFieldsProps = {
  register: UseFormRegister<ApplicationFormValues>;
  errors: FieldErrors<ApplicationFormValues>;
};

type ControlledFieldsProps = BaseFieldsProps & {
  setValue: UseFormSetValue<ApplicationFormValues>;
  watch: UseFormWatch<ApplicationFormValues>;
};

const fieldClass =
  "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus-visible:ring-[var(--color-primary)]";
const selectClass = cn(
  fieldClass,
  "h-10 w-full rounded-md border px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1",
);
const checkboxClass =
  "mt-1 h-4 w-4 shrink-0 accent-[var(--color-primary)] focus-visible:outline-[var(--color-primary)]";

const HOUSING_TYPES = ["私人樓宇", "居屋", "公屋", "村屋", "其他"] as const;
const CONTACT_METHODS = [
  { value: "whatsapp", zh: "WhatsApp", en: "WhatsApp" },
  { value: "phone", zh: "電話", en: "Phone" },
  { value: "email", zh: "電郵", en: "Email" },
] as const;
const VISIT_WINDOW_LABELS: Record<VisitWindow, { zh: string; en: string }> = {
  weekday_morning: { zh: "平日上午", en: "Weekday morning" },
  weekday_afternoon: { zh: "平日下午", en: "Weekday afternoon" },
  weekday_evening: { zh: "平日晚上", en: "Weekday evening" },
  weekend_morning: { zh: "週末上午", en: "Weekend morning" },
  weekend_afternoon: { zh: "週末下午", en: "Weekend afternoon" },
};
const VISIT_WINDOWS = CAT_VISIT_WINDOWS.map((value) => ({ value, ...VISIT_WINDOW_LABELS[value] }));
const DOG_VISIT_OPTIONS = DOG_VISIT_WINDOWS.map((value) => ({ value, ...VISIT_WINDOW_LABELS[value] }));
const CAT_VISIT_OPTIONS = CAT_VISIT_WINDOWS.map((value) => ({ value, ...VISIT_WINDOW_LABELS[value] }));

function numberOrUndefined(value: unknown) {
  if (value === "" || value === null || typeof value === "undefined") return undefined;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function FormField({
  id,
  label,
  labelEn,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  labelEn?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const field = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        "aria-describedby": describedBy,
        "aria-invalid": Boolean(error),
      })
    : children;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold text-[var(--color-panel)]">
        {label}
        {labelEn ? (
          <span className="ml-2 font-body text-xs font-medium text-[var(--color-text-muted)]">
            {labelEn}
          </span>
        ) : null}
      </label>
      {field}
      {hint ? (
        <p id={hintId} className="text-xs text-[var(--color-text-muted)]">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs text-[var(--color-error)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function AnimalRankingFields({
  animals,
  onMove,
}: {
  animals: RankedAnimalCard[];
  onMove: (animalId: string, direction: "up" | "down") => void;
}) {
  return (
    <section className="space-y-3">
      <p className="text-sm text-[var(--color-text-muted)]">
        你可以調整最多三隻領養動物的優先次序。第一位會成為主要跟進配對。
      </p>
      <div className="space-y-2">
        {animals.map((animal, index) => {
          const AnimalIcon = animal.animalType === "dog" ? Dog : Cat;

          return (
            <article
              key={animal.animalId}
              className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--color-primary-highlight)] text-sm font-bold text-[var(--color-primary)]">
                {animal.rank}
              </div>
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-[var(--color-surface-offset)]">
                {animal.imageUrl ? (
                  <img
                    src={animal.imageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center">
                    <AnimalIcon className="h-6 w-6 text-[var(--color-text-faint)]" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-semibold text-[var(--color-panel)]">
                  {animal.animalName}
                </h3>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {animal.animalType === "dog" ? "狗隻 Dog" : "貓隻 Cat"}
                </p>
              </div>
              <GripVertical className="hidden h-4 w-4 text-[var(--color-text-faint)] sm:block" />
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => onMove(animal.animalId, "up")}
                  disabled={index === 0}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-panel)] hover:bg-[var(--color-surface-offset)] disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={`將 ${animal.animalName} 上移`}
                  title={`將 ${animal.animalName} 上移`}
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onMove(animal.animalId, "down")}
                  disabled={index === animals.length - 1}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-panel)] hover:bg-[var(--color-surface-offset)] disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={`將 ${animal.animalName} 下移`}
                  title={`將 ${animal.animalName} 下移`}
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function ContactFields({ register, errors }: BaseFieldsProps) {
  return (
    <section className="grid gap-4 sm:grid-cols-2">
      <FormField id="language" label="申請語言" labelEn="Application language">
        <select {...register("language")} id="language" className={selectClass}>
          <option value="zh-HK">繁體中文</option>
          <option value="en">English</option>
        </select>
      </FormField>
      <FormField
        id="contact-applicantName"
        label="申請人姓名"
        labelEn="Applicant name"
        error={errors.contact?.applicantName?.message}
      >
        <Input
          {...register("contact.applicantName")}
          id="contact-applicantName"
          autoComplete="name"
          className={fieldClass}
        />
      </FormField>
      <FormField
        id="contact-phone"
        label="聯絡電話"
        labelEn="Phone"
        error={errors.contact?.phone?.message}
      >
        <Input
          {...register("contact.phone")}
          id="contact-phone"
          type="tel"
          autoComplete="tel"
          className={fieldClass}
        />
      </FormField>
      <FormField
        id="contact-email"
        label="電郵地址"
        labelEn="Email"
        error={errors.contact?.email?.message}
      >
        <Input
          {...register("contact.email")}
          id="contact-email"
          type="email"
          autoComplete="email"
          className={fieldClass}
        />
      </FormField>
      <FormField
        id="contact-preferredContactMethod"
        label="首選聯絡方法"
        labelEn="Preferred contact"
        error={errors.contact?.preferredContactMethod?.message}
      >
        <select
          {...register("contact.preferredContactMethod")}
          id="contact-preferredContactMethod"
          className={selectClass}
        >
          {CONTACT_METHODS.map((method) => (
            <option key={method.value} value={method.value}>
              {method.zh} / {method.en}
            </option>
          ))}
        </select>
      </FormField>
      <FormField
        id="contact-householdSize"
        label="家庭成員人數"
        labelEn="Household size"
        error={errors.contact?.householdSize?.message}
      >
        <Input
          {...register("contact.householdSize", { setValueAs: numberOrUndefined })}
          id="contact-householdSize"
          type="number"
          min={1}
          className={fieldClass}
        />
      </FormField>
      <div className="sm:col-span-2">
        <FormField
          id="contact-address"
          label="住址"
          labelEn="Address"
          hint="只供義工安排探訪及地區配對使用。"
          error={errors.contact?.address?.message}
        >
          <Input
            {...register("contact.address")}
            id="contact-address"
            autoComplete="street-address"
            className={fieldClass}
          />
        </FormField>
      </div>
    </section>
  );
}

export function HomeFields({ register, errors, setValue, watch }: ControlledFieldsProps) {
  const modificationValue = watch("home.homeModificationsPossible");

  return (
    <section className="grid gap-4 sm:grid-cols-2">
      <FormField
        id="home-housingType"
        label="住宅類型"
        labelEn="Housing type"
        error={errors.home?.housingType?.message}
      >
        <select {...register("home.housingType")} id="home-housingType" className={selectClass}>
          {HOUSING_TYPES.map((housingType) => (
            <option key={housingType} value={housingType}>
              {housingType}
            </option>
          ))}
        </select>
      </FormField>
      <FormField id="home-modifications" label="可否加裝安全設備" labelEn="Safety modifications">
        <select
          id="home-modifications"
          className={selectClass}
          value={
            modificationValue === true ? "true" : modificationValue === false ? "false" : "null"
          }
          onChange={(event) =>
            setValue(
              "home.homeModificationsPossible",
              event.target.value === "true" ? true : event.target.value === "false" ? false : null,
              { shouldDirty: true, shouldValidate: true },
            )
          }
        >
          <option value="null">未確定 / Not sure</option>
          <option value="true">可以 / Yes</option>
          <option value="false">不可以 / No</option>
        </select>
      </FormField>
      <div className="sm:col-span-2">
        <FormField
          id="home-landlordRestrictions"
          label="大廈或業主限制"
          labelEn="Building restrictions"
          hint="如沒有，請寫「沒有」。"
          error={errors.home?.landlordRestrictions?.message}
        >
          <Input
            {...register("home.landlordRestrictions")}
            id="home-landlordRestrictions"
            className={fieldClass}
          />
        </FormField>
      </div>
      <div className="sm:col-span-2">
        <FormField
          id="home-windowDoorSafety"
          label="窗門及防走失措施"
          labelEn="Window and door safety"
          error={errors.home?.windowDoorSafety?.message}
        >
          <Textarea
            {...register("home.windowDoorSafety")}
            id="home-windowDoorSafety"
            rows={3}
            className={fieldClass}
          />
        </FormField>
      </div>
      <div className="sm:col-span-2">
        <FormField
          id="home-indoorSpaceNotes"
          label="室內活動空間補充"
          labelEn="Indoor space notes"
          error={errors.home?.indoorSpaceNotes?.message}
        >
          <Textarea
            {...register("home.indoorSpaceNotes")}
            id="home-indoorSpaceNotes"
            rows={3}
            className={fieldClass}
          />
        </FormField>
      </div>
    </section>
  );
}

export function ReadinessFields({ register, errors }: BaseFieldsProps) {
  return (
    <section className="grid gap-4 sm:grid-cols-2">
      <FormField
        id="readiness-currentPets"
        label="家中現有寵物"
        labelEn="Current pets"
        hint="如沒有，請寫「沒有」。"
        error={errors.readiness?.currentPets?.message}
      >
        <Input
          {...register("readiness.currentPets")}
          id="readiness-currentPets"
          className={fieldClass}
        />
      </FormField>
      <FormField
        id="readiness-monthlyBudgetHkd"
        label="每月預算 HKD"
        labelEn="Monthly budget"
        error={errors.readiness?.monthlyBudgetHkd?.message}
      >
        <Input
          {...register("readiness.monthlyBudgetHkd", { setValueAs: numberOrUndefined })}
          id="readiness-monthlyBudgetHkd"
          type="number"
          min={0}
          className={fieldClass}
        />
      </FormField>
      <div className="sm:col-span-2">
        <FormField
          id="readiness-petCareExperience"
          label="照顧動物經驗"
          labelEn="Pet care experience"
          error={errors.readiness?.petCareExperience?.message}
        >
          <Textarea
            {...register("readiness.petCareExperience")}
            id="readiness-petCareExperience"
            rows={3}
            className={fieldClass}
          />
        </FormField>
      </div>
      <div className="sm:col-span-2">
        <FormField
          id="readiness-householdAgreement"
          label="家庭共識"
          labelEn="Household agreement"
          error={errors.readiness?.householdAgreement?.message}
        >
          <Textarea
            {...register("readiness.householdAgreement")}
            id="readiness-householdAgreement"
            rows={3}
            className={fieldClass}
          />
        </FormField>
      </div>
      <div className="sm:col-span-2">
        <FormField
          id="readiness-dailySchedule"
          label="日常照顧時間表"
          labelEn="Daily routine"
          error={errors.readiness?.dailySchedule?.message}
        >
          <Textarea
            {...register("readiness.dailySchedule")}
            id="readiness-dailySchedule"
            rows={3}
            className={fieldClass}
          />
        </FormField>
      </div>
      <div className="sm:col-span-2">
        <FormField
          id="readiness-emergencyCarePlan"
          label="突發照顧或醫療安排"
          labelEn="Emergency care plan"
          error={errors.readiness?.emergencyCarePlan?.message}
        >
          <Textarea
            {...register("readiness.emergencyCarePlan")}
            id="readiness-emergencyCarePlan"
            rows={3}
            className={fieldClass}
          />
        </FormField>
      </div>
      <div className="sm:col-span-2">
        <FormField
          id="readiness-reason"
          label="領養原因"
          labelEn="Reason to adopt"
          error={errors.readiness?.reason?.message}
        >
          <Textarea
            {...register("readiness.reason")}
            id="readiness-reason"
            rows={4}
            className={fieldClass}
          />
        </FormField>
      </div>
    </section>
  );
}

export function nextVisitWindowSelection<T extends VisitWindow>(
  selected: readonly T[],
  value: T,
  order: readonly T[],
) {
  const nextValues = selected.includes(value)
    ? selected.filter((selectedValue) => selectedValue !== value)
    : [...selected, value];
  const nextSet = new Set(nextValues);
  return order.filter((option) => nextSet.has(option));
}
export function VisitFields({ register, errors, setValue, watch }: ControlledFieldsProps) {
  const animalPreferences = watch("animalPreferences") ?? [];
  const selectedSpecies = new Set(animalPreferences.map((animal) => animal.animalType));
  const dogWindows = watch("visit.dogTimeWindows") ?? [];
  const catWindows = watch("visit.catTimeWindows") ?? [];
  const dogError = errors.visit?.dogTimeWindows?.message;
  const catError = errors.visit?.catTimeWindows?.message;

  function toggleDogWindow(value: DogVisitWindow) {
    setValue(
      "visit.dogTimeWindows",
      nextVisitWindowSelection(dogWindows, value, DOG_VISIT_WINDOWS),
      { shouldDirty: true, shouldValidate: true },
    );
  }

  function toggleCatWindow(value: CatVisitWindow) {
    setValue(
      "visit.catTimeWindows",
      nextVisitWindowSelection(catWindows, value, CAT_VISIT_WINDOWS),
      { shouldDirty: true, shouldValidate: true },
    );
  }

  return (
    <section className="grid gap-4 sm:grid-cols-2">
      <FormField
        id="visit-dateRangeStart"
        label="最早可探望日期"
        labelEn="Earliest visit date"
        error={errors.visit?.dateRangeStart?.message}
      >
        <Input
          {...register("visit.dateRangeStart")}
          id="visit-dateRangeStart"
          type="date"
          className={fieldClass}
        />
      </FormField>
      <FormField
        id="visit-dateRangeEnd"
        label="最遲可探望日期"
        labelEn="Latest visit date"
        error={errors.visit?.dateRangeEnd?.message}
      >
        <Input
          {...register("visit.dateRangeEnd")}
          id="visit-dateRangeEnd"
          type="date"
          className={fieldClass}
        />
      </FormField>
      <div className="grid gap-4 sm:col-span-2 lg:grid-cols-2">
        {selectedSpecies.has("dog") ? (
        <fieldset
          className="space-y-2"
          aria-describedby={dogError ? "visit-dogTimeWindows-error" : undefined}
        >
          <legend className="text-sm font-semibold text-[var(--color-panel)]">
            狗舍參觀時間
            <span className="ml-2 font-body text-xs font-medium text-[var(--color-text-muted)]">
              Dog visit windows
            </span>
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {DOG_VISIT_OPTIONS.map((windowOption) => (
              <label
                key={windowOption.value}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-panel)]"
              >
                <input
                  type="checkbox"
                  checked={dogWindows.includes(windowOption.value)}
                  onChange={() => toggleDogWindow(windowOption.value)}
                  className={checkboxClass}
                  aria-invalid={Boolean(dogError)}
                  aria-describedby={dogError ? "visit-dogTimeWindows-error" : undefined}
                />
                <span>
                  {windowOption.zh}
                  <span className="ml-2 text-xs text-[var(--color-text-muted)]">
                    {windowOption.en}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {dogError ? (
            <p id="visit-dogTimeWindows-error" className="text-xs text-[var(--color-error)]" role="alert">
              {dogError}
            </p>
          ) : null}
        </fieldset>
        ) : null}

        {selectedSpecies.has("cat") ? (
          <fieldset
            className="space-y-2"
            aria-describedby={catError ? "visit-catTimeWindows-error" : undefined}
          >
            <legend className="text-sm font-semibold text-[var(--color-panel)]">
              貓舍參觀時間
              <span className="ml-2 font-body text-xs font-medium text-[var(--color-text-muted)]">
                Cat visit windows
              </span>
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {CAT_VISIT_OPTIONS.map((windowOption) => (
                <label
                  key={windowOption.value}
                  className="flex cursor-pointer items-start gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-panel)]"
                >
                  <input
                    type="checkbox"
                    checked={catWindows.includes(windowOption.value)}
                    onChange={() => toggleCatWindow(windowOption.value)}
                    className={checkboxClass}
                    aria-invalid={Boolean(catError)}
                    aria-describedby={catError ? "visit-catTimeWindows-error" : undefined}
                  />
                  <span>
                    {windowOption.zh}
                    <span className="ml-2 text-xs text-[var(--color-text-muted)]">
                      {windowOption.en}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {catError ? (
              <p id="visit-catTimeWindows-error" className="text-xs text-[var(--color-error)]" role="alert">
                {catError}
              </p>
            ) : null}
          </fieldset>
        ) : null}
      </div>
      <div className="sm:col-span-2">
        <FormField
          id="visit-notes"
          label="探望備註"
          labelEn="Visit notes"
          error={errors.visit?.notes?.message}
        >
          <Textarea {...register("visit.notes")} id="visit-notes" rows={3} className={fieldClass} />
        </FormField>
      </div>
    </section>
  );
}

function visitWindowLabel(value: string) {
  return VISIT_WINDOWS.find((windowOption) => windowOption.value === value)?.zh ?? value;
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value : "未填寫";
}

export function ReviewFields({
  values,
  photos,
  register,
  errors,
  turnstileSlot,
}: BaseFieldsProps & {
  values: ApplicationFormValues;
  photos: SelectedPhoto[];
  turnstileSlot: ReactNode;
}) {
  const photoCategories = photos.map((photo) => PHOTO_CATEGORY_LABELS[photo.category].zh);
  const termsError = errors.terms?.agreed?.message;
  const termsErrorId = "terms-agreed-error";

  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <SummaryBlock title="動物排序" titleEn="Animal ranking">
          <ol className="space-y-1">
            {values.animalPreferences.map((animal) => (
              <li key={animal.animalId}>
                {animal.rank}. {animal.animalName} ({animal.animalType})
              </li>
            ))}
          </ol>
        </SummaryBlock>
        <SummaryBlock title="聯絡資料" titleEn="Contact">
          <p>{optionalText(values.contact.applicantName)}</p>
          <p>{optionalText(values.contact.phone)}</p>
          <p>{optionalText(values.contact.email)}</p>
        </SummaryBlock>
        <SummaryBlock title="家居環境" titleEn="Home">
          <p>{values.home.housingType}</p>
          <p>{optionalText(values.home.windowDoorSafety)}</p>
        </SummaryBlock>
        <SummaryBlock title="照顧準備" titleEn="Care">
          <p>{optionalText(values.readiness.dailySchedule)}</p>
          <p>{optionalText(values.readiness.emergencyCarePlan)}</p>
        </SummaryBlock>
        <SummaryBlock title="探望偏好" titleEn="Visit">
          <p>
            {values.visit.dateRangeStart} 至 {values.visit.dateRangeEnd}
          </p>
          {values.animalPreferences.some((animal) => animal.animalType === "dog") ? (
            <p>
              狗舍參觀時間：{values.visit.dogTimeWindows.map(visitWindowLabel).join("、") || "未選擇"}
            </p>
          ) : null}
          {values.animalPreferences.some((animal) => animal.animalType === "cat") ? (
            <p>
              貓舍參觀時間：{values.visit.catTimeWindows.map(visitWindowLabel).join("、") || "未選擇"}
            </p>
          ) : null}
        </SummaryBlock>
        <SummaryBlock title="環境相片" titleEn="Photos">
          <p>{photoCategories.length ? photoCategories.join("、") : "未選擇相片"}</p>
        </SummaryBlock>
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-offset)] px-4 py-3">
        <label htmlFor="terms-agreed" className="flex cursor-pointer items-start gap-3">
          <input
            {...register("terms.agreed")}
            id="terms-agreed"
            type="checkbox"
            className={checkboxClass}
            aria-invalid={Boolean(termsError)}
            aria-describedby={termsError ? termsErrorId : undefined}
          />
          <span className="text-sm text-[var(--color-panel)]">
            我已閱讀並同意{" "}
            <Link
              to="/adoption/instructions"
              target="_blank"
              className="font-semibold text-[var(--color-primary)] hover:underline"
            >
              領養條款
            </Link>
            ，並確認以上資料屬實。
          </span>
        </label>
        {termsError ? (
          <p id={termsErrorId} className="mt-2 text-xs text-[var(--color-error)]" role="alert">
            {termsError}
          </p>
        ) : null}
      </div>

      {turnstileSlot}
    </section>
  );
}

function SummaryBlock({
  title,
  titleEn,
  children,
}: {
  title: string;
  titleEn: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-muted)]">
      <h3 className="mb-2 text-sm font-semibold text-[var(--color-panel)]">
        {title}
        <span className="ml-2 font-body text-xs font-medium text-[var(--color-text-muted)]">
          {titleEn}
        </span>
      </h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
