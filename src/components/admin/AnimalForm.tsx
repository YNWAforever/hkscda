import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { ANIMAL_IMAGE_BUCKET } from "../../lib/animals/photoUpload";
import {
  buildPublicProfile,
  PUBLIC_PROFILE_LABELS,
  toPublicProfileFields,
  type PublicProfileFields,
} from "../../lib/animals/publicProfileInput";
import type { Animal } from "../../types/animal";
import { useAdminLanguage } from "./adminI18n";
import { uploadAnimalPhoto } from "./animalPhotoUpload";

function buildAnimalSchema(messages: { name: string; age: string }) {
  return z.object({
    name: z.string().trim().min(1, messages.name),
    name_en: z.string().optional(),
    type: z.enum(["cat", "dog", "sponsor"]),
    gender: z.enum(["male", "female"]),
    age: z.string().trim().min(1, messages.age),
    age_en: z.string().optional(),
    notes: z.string().optional(),
    notes_en: z.string().optional(),
    description: z.string().optional(),
    description_en: z.string().optional(),
    status: z.enum(["available", "adopted", "fostered"]),
    // Adoption and sponsorship are independent memberships, and both can be
    // true. They drive the public RLS policy and both public catalogues, but
    // until now the editor could not read or write either -- the only way to
    // change a catalogue was to change the species, which the
    // animal_catalog_membership_defaults trigger then used to rewrite BOTH
    // flags. Exposing them directly is what makes that indirection unnecessary.
    adoption_eligible: z.boolean(),
    sponsorship_eligible: z.boolean(),
  });
}

type FormValues = z.infer<ReturnType<typeof buildAnimalSchema>>;

interface AnimalFormProps {
  existing?: Animal;
}

export function AnimalForm({ existing }: AnimalFormProps) {
  const navigate = useNavigate();
  const { copy } = useAdminLanguage();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The eight allowlisted fields the public site actually renders. Kept in
  // local state rather than the react-hook-form schema because they are stored
  // as one jsonb column, validated as a whole, and rejected as a whole.
  const [profileFields, setProfileFields] = useState<PublicProfileFields>(() =>
    toPublicProfileFields(existing?.public_profile),
  );
  const setProfileField = (key: keyof PublicProfileFields, value: string) =>
    setProfileFields((current) => ({ ...current, [key]: value }) as PublicProfileFields);
  const animalSchema = useMemo(() => buildAnimalSchema(copy.form.errors), [copy.form.errors]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(animalSchema),
    defaultValues: existing
      ? {
          name: existing.name,
          name_en: existing.name_en ?? "",
          type: existing.type,
          gender: existing.gender,
          age: existing.age,
          age_en: existing.age_en ?? "",
          notes: existing.notes ?? "",
          notes_en: existing.notes_en ?? "",
          description: existing.description ?? "",
          description_en: existing.description_en ?? "",
          status: existing.status,
          // Fall back to what the 20260906162436 backfill would have derived,
          // so an older row with a null flag edits as what it actually is
          // rather than silently defaulting to "not eligible".
          adoption_eligible: existing.adoption_eligible ?? existing.type !== "sponsor",
          sponsorship_eligible: existing.sponsorship_eligible ?? existing.type === "sponsor",
        }
      : {
          type: "cat",
          gender: "female",
          status: "available",
          adoption_eligible: true,
          sponsorship_eligible: false,
        },
  });

  function optionalText(value?: string) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  async function onSubmit(values: FormValues) {
    setSaving(true);
    setError(null);

    // Validated through the public reader, so anything accepted here is
    // something the public page will actually render. Without this a save
    // succeeds, the reader strips the value, and the field is silently blank in
    // public with nothing to explain why.
    const profileResult = buildPublicProfile(profileFields);
    if (!profileResult.ok) {
      setError(
        `以下欄位不符合公開資料規則（不可包含網址、電郵、電話或 < > 符號）：${profileResult.rejected
          .map((key) => PUBLIC_PROFILE_LABELS[key])
          .join("、")}`,
      );
      setSaving(false);
      return;
    }

    const previousImageUrl = existing?.image_url ?? null;
    let image_url = previousImageUrl;
    // Set only when this submission uploaded a new object, so a failed save can
    // remove the orphan it created without ever touching the live photograph.
    let uploadedPath: string | null = null;

    // For a new animal the id is decided here and then written in the insert
    // below. Previously this UUID was generated for the object path only and
    // never sent, so Postgres minted a different id via gen_random_uuid() and
    // every new animal's photo lived under a UUID unrelated to its own row --
    // which makes the object unattributable and a later reference check or
    // cleanup impossible. The column keeps its default; supplying the id simply
    // makes the row and its photographs agree.
    const animalId = existing?.id ?? crypto.randomUUID();

    if (imageFile) {
      const uploaded = await uploadAnimalPhoto({ animalId, file: imageFile });
      if (!uploaded.ok) {
        setError(copy.form.uploadError);
        setSaving(false);
        return;
      }
      uploadedPath = uploaded.path;
      image_url = uploaded.publicUrl;
    }

    const payload = {
      name: values.name.trim(),
      name_en: optionalText(values.name_en),
      type: values.type,
      gender: values.gender,
      age: values.age.trim(),
      age_en: optionalText(values.age_en),
      notes: optionalText(values.notes),
      notes_en: optionalText(values.notes_en),
      description: optionalText(values.description),
      description_en: optionalText(values.description_en),
      status: values.status,
      adoption_eligible: values.adoption_eligible,
      sponsorship_eligible: values.sponsorship_eligible,
      public_profile: profileResult.profile,
      image_url,
    };

    // A failed save leaves the freshly uploaded object referenced by nothing.
    // Removing it is housekeeping, not recovery: the animal's existing photo is
    // already safe because the upload went to a new path and overwrote nothing.
    // Cleanup failure is therefore not worth surfacing over the save error the
    // operator actually needs to see.
    async function discardOrphanedUpload() {
      if (!uploadedPath) return;
      try {
        await supabase.storage.from(ANIMAL_IMAGE_BUCKET).remove([uploadedPath]);
      } catch {
        /* orphan is unreferenced; delayed cleanup will collect it */
      }
    }

    if (existing) {
      const { error: updateError } = await supabase
        .from("animals")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (updateError) {
        await discardOrphanedUpload();
        setError(copy.form.saveError);
        setSaving(false);
        return;
      }
    } else {
      const { error: insertError } = await supabase
        .from("animals")
        .insert({ ...payload, id: animalId });
      if (insertError) {
        await discardOrphanedUpload();
        setError(copy.form.saveError);
        setSaving(false);
        return;
      }
    }

    navigate({ to: "/admin" });
  }

  const field =
    "w-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] rounded-lg px-3 py-2 text-sm shadow-sm placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-highlight)]";
  const selectField = `${field} cursor-pointer`;
  const optionStyle = {
    backgroundColor: "var(--color-surface)",
    color: "var(--color-text)",
  };

  const typeOptions = [
    { value: "cat", label: copy.animalType.cat },
    { value: "dog", label: copy.animalType.dog },
    { value: "sponsor", label: copy.animalType.sponsor },
  ] as const;
  const genderOptions = [
    { value: "female", label: copy.gender.female },
    { value: "male", label: copy.gender.male },
  ] as const;
  const statusOptions = [
    { value: "available", label: copy.animalStatus.available },
    { value: "adopted", label: copy.animalStatus.adopted },
    { value: "fostered", label: copy.animalStatus.fostered },
  ] as const;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl space-y-5">
      <fieldset className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <legend className="px-2 text-sm font-bold text-[var(--color-panel)]">
          {copy.form.chineseGroup}
        </legend>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium mb-1">{copy.form.chineseName}</label>
            <input
              {...register("name")}
              placeholder={copy.form.namePlaceholder}
              className={field}
            />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{copy.form.chineseAge}</label>
            <input {...register("age")} placeholder={copy.form.agePlaceholder} className={field} />
            {errors.age && <p className="text-red-500 text-xs mt-1">{errors.age.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{copy.form.chineseNotes}</label>
            <input
              {...register("notes")}
              placeholder={copy.form.notesPlaceholder}
              className={field}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">{copy.form.chineseDescription}</label>
            <textarea
              {...register("description")}
              rows={4}
              placeholder={copy.form.descriptionPlaceholder}
              className={field}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <legend className="px-2 text-sm font-bold text-[var(--color-panel)]">
          {copy.form.englishGroup}
        </legend>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium mb-1">{copy.form.englishName}</label>
            <input
              {...register("name_en")}
              placeholder={copy.form.englishNamePlaceholder}
              className={field}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{copy.form.englishAge}</label>
            <input
              {...register("age_en")}
              placeholder={copy.form.englishAgePlaceholder}
              className={field}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{copy.form.englishNotes}</label>
            <input
              {...register("notes_en")}
              placeholder={copy.form.englishNotesPlaceholder}
              className={field}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">{copy.form.englishDescription}</label>
            <textarea
              {...register("description_en")}
              rows={4}
              placeholder={copy.form.englishDescriptionPlaceholder}
              className={field}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <legend className="px-2 text-sm font-bold text-[var(--color-panel)]">
          {copy.form.adminGroup}
        </legend>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="block text-sm font-medium mb-1">{copy.form.type}</label>
            <select {...register("type")} className={selectField}>
              {typeOptions.map((option) => (
                <option key={option.value} value={option.value} style={optionStyle}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{copy.form.gender}</label>
            <select {...register("gender")} className={selectField}>
              {genderOptions.map((option) => (
                <option key={option.value} value={option.value} style={optionStyle}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{copy.form.status}</label>
            <select {...register("status")} className={selectField}>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value} style={optionStyle}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Adoption and sponsorship are independent: both may be ticked, and an
            animal with neither is visible to staff but appears in no public
            catalogue (the "public read available" RLS policy requires one). */}
        <div className="mt-4 space-y-2">
          <span className="block text-sm font-medium">刊登範圍</span>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register("adoption_eligible")} className="h-4 w-4" />
            可供領養（顯示於領養頁面）
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register("sponsorship_eligible")} className="h-4 w-4" />
            可供助養（顯示於助養區）
          </label>
        </div>
      </fieldset>

      {/* The only animal facts the public site renders. Everything outside this
          set stays internal: the database CHECK constraint refuses any other
          key, and refuses URLs, email addresses, phone numbers and angle
          brackets inside these ones, so contact details cannot leak into a
          public page through a free-text box. */}
      <fieldset className="space-y-4 rounded-lg border border-[var(--color-border)] p-4">
        <legend className="px-1 text-sm font-semibold">公開資料</legend>
        <p className="text-xs text-[var(--color-text-muted)]">
          這些內容會直接在公開網站顯示。請勿填寫網址、電郵、電話或個人聯絡資料。
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="profile-code">
              編號
            </label>
            <input
              id="profile-code"
              className={field}
              value={profileFields.code}
              onChange={(e) => setProfileField("code", e.target.value)}
              placeholder="例如 C3761"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="profile-birthday">
              出生日期
            </label>
            <input
              id="profile-birthday"
              type="date"
              className={field}
              value={profileFields.birthday}
              onChange={(e) => setProfileField("birthday", e.target.value)}
            />
            {/* Age is derived from this one source rather than kept as a second
                copy that can disagree with it. */}
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              填寫後，公開頁面會以此推算年齡。
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="profile-neutered">
              絕育狀態
            </label>
            <select
              id="profile-neutered"
              className={selectField}
              value={profileFields.neutered}
              onChange={(e) => setProfileField("neutered", e.target.value)}
            >
              <option value="" style={optionStyle}>
                未有記錄
              </option>
              <option value="yes" style={optionStyle}>
                已絕育
              </option>
              <option value="no" style={optionStyle}>
                未絕育
              </option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="profile-suitability">
              適合的領養者
            </label>
            <select
              id="profile-suitability"
              className={selectField}
              value={profileFields.suitability}
              onChange={(e) => setProfileField("suitability", e.target.value)}
            >
              <option value="" style={optionStyle}>
                未有記錄
              </option>
              <option value="newbie" style={optionStyle}>
                適合新手
              </option>
              <option value="experienced" style={optionStyle}>
                適合有經驗者
              </option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="profile-record-date">
              記錄日期
            </label>
            <input
              id="profile-record-date"
              type="date"
              className={field}
              value={profileFields.recordDate}
              onChange={(e) => setProfileField("recordDate", e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="profile-personality">
            性格（最多 1000 字）
          </label>
          <textarea
            id="profile-personality"
            rows={3}
            className={field}
            value={profileFields.personality}
            onChange={(e) => setProfileField("personality", e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="profile-health">
            照顧與健康需要（最多 2000 字）
          </label>
          <textarea
            id="profile-health"
            rows={3}
            className={field}
            value={profileFields.health}
            onChange={(e) => setProfileField("health", e.target.value)}
          />
          {/* Simplifying the public page must not drop what an applicant needs
              to know before applying. */}
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            申請人在提交申請前需要知道的照顧需要，請在此說明。
          </p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="profile-story">
            牠的故事（最多 8000 字）
          </label>
          <textarea
            id="profile-story"
            rows={6}
            className={field}
            value={profileFields.story}
            onChange={(e) => setProfileField("story", e.target.value)}
          />
        </div>
      </fieldset>

      <div>
        <label className="block text-sm font-medium mb-1">{copy.form.photo}</label>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
        {existing?.image_url && !imageFile && (
          <img
            src={existing.image_url}
            alt={copy.form.imageAlt}
            className="w-20 h-20 object-cover rounded mt-2"
          />
        )}
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2.5 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-700 transition-colors disabled:opacity-60"
        >
          {saving ? copy.common.saving : copy.common.save}
        </button>
        <button
          type="button"
          onClick={() => navigate({ to: "/admin" })}
          className="px-6 py-2.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
        >
          {copy.common.cancel}
        </button>
      </div>
    </form>
  );
}
