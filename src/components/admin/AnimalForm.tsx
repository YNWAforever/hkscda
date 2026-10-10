import { Button } from "@/components/ui/button";
import { ContentReviewPanel } from "./content/ContentReview";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchAdminJson } from "../../lib/admin/http";
import { AdminApiError } from "../../lib/admin/session";
import {
  buildPublicProfile,
  isPublicProfileField,
  publicProfileLabel,
  toPublicProfileFields,
  type PublicProfileFields,
} from "../../lib/animals/publicProfileInput";
import type { Animal } from "../../types/animal";
import { AnimalGalleryEditor, type EditableGalleryItem } from "./AnimalGalleryEditor";
import { useAdminLanguage } from "./adminI18n";
import { animalFormCopy } from "./animalFormCopy";
import { uploadAnimalPhoto } from "./animalPhotoUpload";
import { useAdminCopy } from "./i18n/copy";
import { useLeaveConfirm } from "./useLeaveConfirm";
import { localizedText } from "./i18n/localizedText";

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
    // Publication is independent of the care state above. Before this existed
    // the only way to take a record off the public site was to claim the animal
    // had been adopted or fostered -- falsifying its care record to achieve an
    // editorial outcome.
    publication_state: z.enum(["draft", "published", "unpublished"]),
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
  const { copy, language } = useAdminLanguage();
  const formCopy = useAdminCopy(animalFormCopy);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [gallery, setGallery] = useState<EditableGalleryItem[]>(() => existing?.gallery ?? []);
  const [saving, setSaving] = useState(false);
  const [draftRevision, setDraftRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const editVersion = useRef(0);
  const [previewBody, setPreviewBody] = useState<Record<string, unknown> | null>(null);
  const [savedImage, setSavedImage] = useState(existing?.image_url ?? null);
  const [savedDraftImage, setSavedDraftImage] = useState<string | null>(null);
  const markDirty = () => {
    editVersion.current += 1;
    setDirty(true);
    setPreviewId(null);
    setPreviewBody(null);
  };
  const leaveDialog = useLeaveConfirm({ dirty, consequence: formCopy.leaveConfirm });
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [publishReason, setPublishReason] = useState("");
  const [versions, setVersions] = useState<
    Array<{ id: string; revision: number; created_at: string }>
  >([]);
  const [animalId] = useState(() => existing?.id ?? crypto.randomUUID());
  // One message at a time: a failure is announced as an alert in the error colour, a success as a status in the success colour.
  const [message, setMessage] = useState<{ tone: "error" | "status"; text: string } | null>(null);
  const setError = useCallback(
    (text: string | null) => setMessage(text === null ? null : { tone: "error", text }),
    [],
  );
  const setNotice = useCallback((text: string) => setMessage({ tone: "status", text }), []);
  const [draftLoad, setDraftLoad] = useState<"loading" | "ready" | "failed">(
    existing ? "loading" : "ready",
  );
  // The allowlisted fields the public site actually renders. Kept in
  // local state rather than the react-hook-form schema because they are stored
  // as one jsonb column, validated as a whole, and rejected as a whole.
  const [profileFields, setProfileFields] = useState<PublicProfileFields>(() =>
    toPublicProfileFields(existing?.public_profile),
  );
  const setProfileField = (key: keyof PublicProfileFields, value: string) => {
    markDirty();
    setProfileFields((current) => ({ ...current, [key]: value }) as PublicProfileFields);
  };
  const animalSchema = useMemo(() => buildAnimalSchema(copy.form.errors), [copy.form.errors]);

  const {
    register,
    watch,
    handleSubmit,
    reset,
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
          publication_state: existing.publication_state ?? "published",
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
          // A new record starts as a draft: a profile should be prepared and
          // checked before it is on the public site, not the instant it is
          // created with a blank story and no photograph.
          publication_state: "draft",
          adoption_eligible: true,
          sponsorship_eligible: false,
        },
  });

  const hasExisting = Boolean(existing);
  // Read inside the effect without making a language change reload the draft.
  const draftLoadError = useRef(formCopy.draft.loadError);
  draftLoadError.current = formCopy.draft.loadError;
  useEffect(() => {
    if (!hasExisting) return;
    let cancelled = false;
    void fetchAdminJson<{
      draft: { body: Record<string, unknown>; revision: number } | null;
      versions: Array<{ id: string; revision: number; created_at: string }>;
    }>("/api/admin/animals/publication/", {
      method: "POST",
      body: JSON.stringify({ kind: "read", animal_id: animalId }),
    })
      .then((result) => {
        if (cancelled) return;
        setVersions(result.versions ?? []);
        setDraftLoad("ready");
        if (!result.draft) return;
        const body = result.draft.body;
        setSavedImage(typeof body.image_url === "string" ? body.image_url : null);
        setSavedDraftImage(
          typeof body.draft_image_path === "string" ? body.draft_image_path : null,
        );
        setDraftRevision(result.draft.revision);
        setProfileFields(toPublicProfileFields(body.public_profile as Animal["public_profile"]));
        setGallery(Array.isArray(body.gallery) ? (body.gallery as EditableGalleryItem[]) : []);
        reset({
          name: String(body.name ?? ""),
          name_en: String(body.name_en ?? ""),
          type: body.type as FormValues["type"],
          gender: body.gender as FormValues["gender"],
          age: String(body.age ?? ""),
          age_en: String(body.age_en ?? ""),
          notes: String(body.notes ?? ""),
          notes_en: String(body.notes_en ?? ""),
          description: String(body.description ?? ""),
          description_en: String(body.description_en ?? ""),
          status: body.status as FormValues["status"],
          publication_state: body.publication_state as FormValues["publication_state"],
          adoption_eligible: Boolean(body.adoption_eligible),
          sponsorship_eligible: Boolean(body.sponsorship_eligible),
        });
      })
      .catch(() => {
        if (cancelled) return;
        setDraftLoad("failed");
        setError(draftLoadError.current);
      });
    return () => {
      cancelled = true;
    };
  }, [animalId, hasExisting, reset, setError]);

  async function copyVersion(versionId: string) {
    try {
      const result = await fetchAdminJson<{ revision: number }>("/api/admin/animals/publication/", {
        method: "POST",
        body: JSON.stringify({ kind: "copy", animal_id: animalId, version_id: versionId }),
      });
      setDraftRevision(result.revision);
      setPreviewId(null);
      setNotice(formCopy.versions.copied);
      window.location.reload();
    } catch {
      setError(formCopy.versions.copyFailed);
    }
  }
  function optionalText(value?: string) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  async function onSubmit(values: FormValues) {
    const submittedVersion = editVersion.current;
    setSaving(true);
    setError(null);

    // Validated through the public reader, so anything accepted here is
    // something the public page will actually render. Without this a save
    // succeeds, the reader strips the value, and the field is silently blank in
    // public with nothing to explain why.
    const profileResult = buildPublicProfile(profileFields);
    if (!profileResult.ok) {
      setError(
        formCopy.profileRejected(
          ...profileResult.rejected.map((key) => publicProfileLabel(key, language)),
        ),
      );
      setSaving(false);
      return;
    }

    const previousImageUrl = savedImage;
    const image_url = previousImageUrl;
    // A fresh private upload is tracked until a committed draft attaches it.
    // An ambiguous save response cannot safely prove that the object is orphaned.
    let uploadedPath: string | null = null;

    // For a new animal the id is decided here and then written in the insert
    // below. Previously this UUID was generated for the object path only and
    // never sent, so Postgres minted a different id via gen_random_uuid() and
    // every new animal's photo lived under a UUID unrelated to its own row --
    // which makes the object unattributable and a later reference check or
    // cleanup impossible. The column keeps its default; supplying the id simply
    // makes the row and its photographs agree.
    // animalId is stable for this draft session.

    if (imageFile) {
      const uploaded = await uploadAnimalPhoto({ animalId, file: imageFile });
      if (!uploaded.ok) {
        setError(copy.form.uploadError);
        setSaving(false);
        return;
      }
      uploadedPath = uploaded.path;
      // Private draft object is promoted to an immutable public path only after publish.
    }

    const preparedGallery: EditableGalleryItem[] = [];
    for (const [sort_order, item] of gallery.entries()) {
      let draft_path = item.draft_path;
      if (item.file) {
        const uploaded = await uploadAnimalPhoto({ animalId, file: item.file });
        if (!uploaded.ok) {
          setError(formCopy.galleryUploadFailed);
          setSaving(false);
          return;
        }
        draft_path = uploaded.path;
      }
      preparedGallery.push({
        id: item.id,
        url: item.url,
        draft_path,
        alt_zh: item.alt_zh.trim(),
        alt_en: item.alt_en?.trim() || null,
        source: item.source.trim(),
        focal_x: item.focal_x,
        focal_y: item.focal_y,
        review_status: item.review_status,
        sort_order,
      });
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
      publication_state: values.publication_state,
      adoption_eligible: values.adoption_eligible,
      sponsorship_eligible: values.sponsorship_eligible,
      public_profile: profileResult.profile,
      image_url,
      draft_image_path: uploadedPath ?? savedDraftImage,
      gallery: preparedGallery,
    };

    try {
      const saved = await fetchAdminJson<{ kind: string; revision: number }>(
        "/api/admin/animals/publication/",
        {
          method: "POST",
          body: JSON.stringify({
            kind: "save",
            animal_id: animalId,
            expected_revision: draftRevision,
            body: payload,
          }),
        },
      );
      setDraftRevision(saved.revision);
      setSavedDraftImage(uploadedPath ?? savedDraftImage);
      if (editVersion.current === submittedVersion) {
        setGallery(preparedGallery);
        setImageFile(null);
        setDirty(false);
        reset(values);
      }
      setPreviewId(null);
      setNotice(formCopy.draft.saved);
      setSaving(false);
      return;
    } catch {
      setError(copy.form.saveError);
      setSaving(false);
      return;
    }
  }

  async function previewDraft() {
    if (dirty || saving) return;
    // Clear first so the same text is announced again on a repeat.
    setMessage(null);
    try {
      const result = await fetchAdminJson<{
        preview_id: string;
        revision: number;
        body: Record<string, unknown>;
      }>("/api/admin/animals/publication/", {
        method: "POST",
        body: JSON.stringify({ kind: "preview", animal_id: animalId }),
      });
      setPreviewId(result.preview_id);
      setPreviewBody(result.body);
      setNotice(formCopy.publish.previewCreated);
    } catch {
      setError(formCopy.publish.previewFailed);
    }
  }
  async function publishDraft() {
    if (dirty || saving || !previewId || !publishReason.trim()) return;
    try {
      const result = await fetchAdminJson<{ media_pending?: boolean }>(
        "/api/admin/animals/publication/",
        {
          method: "POST",
          body: JSON.stringify({
            kind: "publish",
            animal_id: animalId,
            preview_id: previewId,
            reason: publishReason.trim(),
          }),
        },
      );
      if (result.media_pending) {
        setPreviewId(null);
        setError(formCopy.publish.mediaPending);
        return;
      }
      navigate({ to: "/admin" });
    } catch (error) {
      if (error instanceof AdminApiError && [403, 404, 409, 422].includes(error.status)) {
        setError(formCopy.publish.conflict);
        setPreviewId(null);
      } else {
        // A lost HTTP response may follow a committed publish. Keep the
        // preview ID so the idempotent publish command can be retried.
        setError(formCopy.publish.unconfirmed);
      }
    }
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

  if (draftLoad !== "ready")
    return (
      <section aria-busy={draftLoad === "loading"} className="space-y-3 p-6">
        <p role={draftLoad === "failed" ? "alert" : "status"}>
          {draftLoad === "loading" ? formCopy.draft.loading : formCopy.draft.loadFailed}
        </p>
        {draftLoad === "failed" && (
          <Button variant="outline" type="button" onClick={() => window.location.reload()}>
            {formCopy.draft.reload}
          </Button>
        )}
      </section>
    );

  return (
    <>
      {leaveDialog}
      <form
        onChange={(event) => {
          if ((event.target as HTMLElement).id !== "animal-publish-reason") markDirty();
        }}
        onSubmit={handleSubmit(onSubmit)}
        className="max-w-3xl space-y-5"
      >
        <fieldset className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <legend className="px-2 text-sm font-bold text-[var(--color-panel)]">
            {copy.form.chineseGroup}
          </legend>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-1">{copy.form.chineseName}</label>
              <input
                {...register("name")}
                aria-label={copy.form.chineseName}
                placeholder={copy.form.namePlaceholder}
                className={field}
              />
              {errors.name && (
                <p role="alert" className="text-[var(--color-error)] text-xs mt-1">
                  {errors.name.message}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{copy.form.chineseAge}</label>
              <input
                {...register("age")}
                aria-label={copy.form.chineseAge}
                placeholder={copy.form.agePlaceholder}
                className={field}
              />
              {errors.age && (
                <p role="alert" className="text-[var(--color-error)] text-xs mt-1">
                  {errors.age.message}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{copy.form.chineseNotes}</label>
              <input
                {...register("notes")}
                aria-label={copy.form.chineseNotes}
                placeholder={copy.form.notesPlaceholder}
                className={field}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">
                {copy.form.chineseDescription}
              </label>
              <textarea
                {...register("description")}
                aria-label={copy.form.chineseDescription}
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
                aria-label={copy.form.englishName}
                placeholder={copy.form.englishNamePlaceholder}
                className={field}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{copy.form.englishAge}</label>
              <input
                {...register("age_en")}
                aria-label={copy.form.englishAge}
                placeholder={copy.form.englishAgePlaceholder}
                className={field}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{copy.form.englishNotes}</label>
              <input
                {...register("notes_en")}
                aria-label={copy.form.englishNotes}
                placeholder={copy.form.englishNotesPlaceholder}
                className={field}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">
                {copy.form.englishDescription}
              </label>
              <textarea
                {...register("description_en")}
                aria-label={copy.form.englishDescription}
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
              <label htmlFor="animal-type" className="block text-sm font-medium mb-1">
                {copy.form.type}
              </label>
              <select id="animal-type" {...register("type")} className={selectField}>
                {typeOptions.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                    disabled={Boolean("disabled" in option && option.disabled)}
                    style={optionStyle}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="animal-gender" className="block text-sm font-medium mb-1">
                {copy.form.gender}
              </label>
              <select id="animal-gender" {...register("gender")} className={selectField}>
                {genderOptions.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                    disabled={Boolean("disabled" in option && option.disabled)}
                    style={optionStyle}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="animal-status" className="block text-sm font-medium mb-1">
                {copy.form.status}
              </label>
              <select id="animal-status" {...register("status")} className={selectField}>
                {statusOptions.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                    disabled={Boolean("disabled" in option && option.disabled)}
                    style={optionStyle}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Adoption and sponsorship are independent: both may be ticked, and an
            animal with neither is visible to staff but appears in no public
            catalogue (the "public read available" RLS policy requires one). */}
          {/* Publication is its own axis. Withholding a record must never require
            claiming the animal was adopted or fostered. */}
          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium" htmlFor="publication-state">
              {formCopy.publication.label}
            </label>
            <select
              id="publication-state"
              {...register("publication_state")}
              className={selectField}
            >
              <option value="draft" style={optionStyle}>
                {formCopy.publication.draft}
              </option>
              <option value="published" style={optionStyle}>
                {formCopy.publication.published}
              </option>
              <option value="unpublished" style={optionStyle}>
                {formCopy.publication.unpublished}
              </option>
            </select>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              {formCopy.publication.hint}
            </p>
          </div>

          <div className="mt-4 space-y-2">
            <span className="block text-sm font-medium">{formCopy.listing.label}</span>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register("adoption_eligible")} className="h-4 w-4" />
              {formCopy.listing.adoption}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register("sponsorship_eligible")} className="h-4 w-4" />
              {formCopy.listing.sponsorship}
            </label>
          </div>
        </fieldset>

        {/* The only animal facts the public site renders. Everything outside this
          set stays internal: the database CHECK constraint refuses any other
          key, and refuses URLs, email addresses, phone numbers and angle
          brackets inside these ones, so contact details cannot leak into a
          public page through a free-text box. */}
        <fieldset className="space-y-4 rounded-lg border border-[var(--color-border)] p-4">
          <legend className="px-1 text-sm font-semibold">{formCopy.profile.heading}</legend>
          <p className="text-xs text-[var(--color-text-muted)]">{formCopy.profile.intro}</p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="profile-code">
                {formCopy.profile.code}
              </label>
              <input
                id="profile-code"
                className={field}
                value={profileFields.code}
                onChange={(e) => setProfileField("code", e.target.value)}
                placeholder={formCopy.profile.codePlaceholder}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="profile-birthday">
                {formCopy.profile.birthday}
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
                {formCopy.profile.birthdayHint}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="profile-neutered">
                {formCopy.profile.neutered}
              </label>
              <select
                id="profile-neutered"
                className={selectField}
                value={profileFields.neutered}
                onChange={(e) => setProfileField("neutered", e.target.value)}
              >
                <option value="" style={optionStyle}>
                  {formCopy.profile.notRecorded}
                </option>
                <option value="yes" style={optionStyle}>
                  {formCopy.profile.neuteredYes}
                </option>
                <option value="no" style={optionStyle}>
                  {formCopy.profile.neuteredNo}
                </option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="profile-suitability">
                {formCopy.profile.suitability}
              </label>
              <select
                id="profile-suitability"
                className={selectField}
                value={profileFields.suitability}
                onChange={(e) => setProfileField("suitability", e.target.value)}
              >
                <option value="" style={optionStyle}>
                  {formCopy.profile.notRecorded}
                </option>
                <option value="newbie" style={optionStyle}>
                  {formCopy.profile.suitabilityNewbie}
                </option>
                <option value="experienced" style={optionStyle}>
                  {formCopy.profile.suitabilityExperienced}
                </option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="profile-record-date">
                {formCopy.profile.recordDate}
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
              {formCopy.profile.personality}
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
              {formCopy.profile.health}
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
              {formCopy.profile.healthHint}
            </p>
          </div>
          {watch("sponsorship_eligible") ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="profile-sponsor-use">
                  {formCopy.profile.sponsorUse}
                </label>
                <textarea
                  id="profile-sponsor-use"
                  rows={3}
                  className={field}
                  value={profileFields.sponsorUse}
                  onChange={(event) => setProfileField("sponsorUse", event.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="profile-recent-progress">
                  {formCopy.profile.recentProgress}
                </label>
                <textarea
                  id="profile-recent-progress"
                  rows={3}
                  className={field}
                  value={profileFields.recentProgress}
                  onChange={(event) => setProfileField("recentProgress", event.target.value)}
                />
              </div>
            </div>
          ) : null}
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="profile-story">
              {formCopy.profile.story}
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

        <AnimalGalleryEditor
          items={gallery}
          onChange={(items) => {
            setGallery(items);
            setPreviewId(null);
          }}
        />

        <div>
          <label htmlFor="animal-photo" className="block text-sm font-medium mb-1">
            {copy.form.photo}
          </label>
          <input
            id="animal-photo"
            type="file"
            accept="image/*"
            onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
          {imageFile || gallery.some((item) => item.file) ? (
            <UploadCheckNotice
              existing={existing}
              animalId={animalId}
              imageFileName={imageFile?.name ?? null}
              galleryFiles={gallery.flatMap((item) =>
                item.file ? [{ id: item.id, name: item.file.name }] : [],
              )}
            />
          ) : null}
          {existing?.image_url && !imageFile && (
            <img
              src={existing.image_url}
              alt={copy.form.imageAlt}
              className="w-20 h-20 object-cover rounded mt-2"
            />
          )}
        </div>

        {versions.length > 0 && (
          <section className="rounded-lg border p-3">
            <h2 className="font-bold">{formCopy.versions.heading}</h2>
            {versions.map((version) => (
              <button
                key={version.id}
                type="button"
                className="mr-2 mt-2 rounded border px-3 py-2 text-sm"
                onClick={() => copyVersion(version.id)}
              >
                {formCopy.versions.duplicate(version.revision)}
              </button>
            ))}
          </section>
        )}
        {message?.tone === "error" && (
          <p role="alert" className="text-[var(--color-error)] text-sm">
            {message.text}
          </p>
        )}
        {/* Always mounted, so a polite announcement fires when the text arrives. */}
        <p role="status" className="text-[var(--color-success)] text-sm">
          {message?.tone === "status" ? message.text : ""}
        </p>

        {draftRevision > 0 && (
          <section className="space-y-3 rounded-lg border border-[var(--color-border)] p-4">
            <h2 className="font-bold">{formCopy.publish.heading}</h2>
            <div onChange={(event) => event.stopPropagation()}>
              <ContentReviewPanel
                key={draftRevision}
                kind="animal"
                id={animalId}
                revision={String(draftRevision)}
                disabled={dirty || saving}
              />
            </div>
            {dirty && <p role="status">{formCopy.publish.dirty}</p>}
            {previewBody && <SavedVersionPreview body={previewBody} revision={draftRevision} />}
            <button
              type="button"
              onClick={previewDraft}
              disabled={dirty || saving}
              className="rounded-lg border px-4 py-2 text-sm"
            >
              {formCopy.publish.createPreview}
            </button>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="animal-publish-reason">
                {formCopy.publish.reason}
              </label>
              <input
                id="animal-publish-reason"
                className={field}
                value={publishReason}
                onChange={(event) => setPublishReason(event.target.value)}
              />
            </div>
            <button
              type="button"
              disabled={dirty || saving || !previewId || !publishReason.trim()}
              onClick={publishDraft}
              className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {formCopy.publish.publishVersion}
            </button>
          </section>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-[var(--color-primary)] text-[var(--color-primary-foreground)] rounded-lg font-medium hover:bg-[var(--color-primary-hover)] transition-colors disabled:opacity-60"
          >
            {saving ? copy.common.saving : copy.common.save}
          </button>
          <button
            type="button"
            onClick={() => navigate({ to: "/admin" })}
            className="px-6 py-2.5 border border-[var(--color-border)] rounded-lg text-sm hover:bg-[var(--color-surface-offset)]"
          >
            {copy.common.cancel}
          </button>
        </div>
      </form>
    </>
  );
}

/**
 * The saved version of a draft as the public site would show it, from the body the preview
 * request returned. In English each text shows its English column when it has one.
 */
export function SavedVersionPreview({
  body,
  revision,
}: {
  body: Record<string, unknown>;
  revision: number;
}) {
  const { language } = useAdminLanguage();
  const formCopy = useAdminCopy(animalFormCopy);
  const text = (key: string) => String(body[key] ?? "");
  const englishText = (key: string) => (typeof body[key] === "string" ? String(body[key]) : null);
  const localized = (key: string) => localizedText(text(key), englishText(`${key}_en`), language);
  return (
    <article
      aria-label={formCopy.publish.previewLabel}
      className="space-y-3 rounded-lg bg-[var(--color-surface)] p-4"
    >
      <p>{formCopy.publish.savedVersion(revision)}</p>
      <h3 className="text-2xl font-bold">{localized("name")}</h3>
      {typeof body.preview_image_url === "string" && (
        <img
          src={body.preview_image_url}
          alt={localized("name")}
          className="w-full max-h-96 rounded-lg object-contain"
        />
      )}
      <p>{localized("age")}</p>
      <p className="whitespace-pre-wrap">{localized("description")}</p>
      <p className="whitespace-pre-wrap">{localized("notes")}</p>
      {body.public_profile && typeof body.public_profile === "object"
        ? Object.entries(body.public_profile)
            .filter(([, value]) => value !== null && value !== "")
            .map(([key, value]) => (
              <p key={key}>
                {formCopy.publish.profileLine(
                  isPublicProfileField(key) ? publicProfileLabel(key, language) : key,
                  String(value),
                )}
              </p>
            ))
        : null}
      {Array.isArray(body.gallery) && (
        <div className="grid grid-cols-2 gap-3">
          {body.gallery.map((item: Record<string, unknown>) => {
            if (typeof item.preview_url !== "string") return null;
            const alt = localizedText(
              String(item.alt_zh ?? ""),
              typeof item.alt_en === "string" ? item.alt_en : null,
              language,
            );
            return (
              <figure key={String(item.id)}>
                <img src={item.preview_url} alt={alt} className="w-full rounded-lg" />
                <figcaption>
                  {alt}
                  {item.review_status !== "approved" ? formCopy.publish.notApprovedSuffix : ""}
                </figcaption>
              </figure>
            );
          })}
        </div>
      )}
    </article>
  );
}

/** Names the animal and the files before they are uploaded, so staff can check them first. */
export function UploadCheckNotice({
  existing,
  animalId,
  imageFileName,
  galleryFiles,
}: {
  existing?: Animal;
  animalId: string;
  imageFileName: string | null;
  galleryFiles: Array<{ id: string; name: string }>;
}) {
  const { language } = useAdminLanguage();
  const formCopy = useAdminCopy(animalFormCopy);
  return (
    <div
      role="status"
      className="mt-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm"
    >
      <p className="font-semibold">{formCopy.upload.checkHeading}</p>
      <p>
        {existing?.public_profile?.code ? `#${existing.public_profile.code} · ` : ""}
        {existing
          ? localizedText(existing.name, existing.name_en, language)
          : formCopy.upload.newAnimalDraft}{" "}
        · ID {animalId}
      </p>
      <ul className="mt-2 list-inside list-disc break-all">
        {imageFileName ? <li>{formCopy.upload.mainPhoto(imageFileName)}</li> : null}
        {galleryFiles.map((file) => (
          <li key={file.id}>{formCopy.upload.galleryPhoto(file.name)}</li>
        ))}
      </ul>
      <p className="mt-2 text-[var(--color-text-muted)]">{formCopy.upload.hint}</p>
    </div>
  );
}
