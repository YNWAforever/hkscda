import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { Animal } from "../../types/animal";
import { useAdminLanguage } from "./adminI18n";

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
        }
      : { type: "cat", gender: "female", status: "available" },
  });

  function optionalText(value?: string) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  async function onSubmit(values: FormValues) {
    setSaving(true);
    setError(null);

    let image_url = existing?.image_url ?? null;

    if (imageFile) {
      const animalId = existing?.id ?? crypto.randomUUID();
      const { error: uploadError } = await supabase.storage
        .from("animal-images")
        .upload(`${animalId}.jpg`, imageFile, { upsert: true });
      if (uploadError) {
        setError(copy.form.uploadError);
        setSaving(false);
        return;
      }
      const { data: urlData } = supabase.storage
        .from("animal-images")
        .getPublicUrl(`${animalId}.jpg`);
      image_url = urlData.publicUrl;
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
      image_url,
    };

    if (existing) {
      const { error: updateError } = await supabase
        .from("animals")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (updateError) {
        setError(copy.form.saveError);
        setSaving(false);
        return;
      }
    } else {
      const { error: insertError } = await supabase.from("animals").insert(payload);
      if (insertError) {
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
