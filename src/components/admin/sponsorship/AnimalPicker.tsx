import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "../../ui/input";
import { useAdminLanguage } from "../adminI18n";
import { useAdminCopy } from "../i18n/copy";
import { localizedText } from "../i18n/localizedText";
import { fetchCoordinatorJson } from "../adoptions/api";
import { animalPickerCopy } from "./copy";
type Candidate = {
  id: string;
  name: string;
  name_en: string | null;
  code: string | null;
  image_url: string | null;
};
export function AnimalPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const copy = useAdminCopy(animalPickerCopy);
  const { language } = useAdminLanguage();
  const [search, setSearch] = useState("");
  const { data, isError } = useQuery({
    queryKey: ["sponsorship-assignment-candidates", search],
    queryFn: () =>
      fetchCoordinatorJson<{ animals: Candidate[] }>(
        `/api/admin/sponsorships/animals?q=${encodeURIComponent(search)}`,
      ),
  });
  return (
    <div className="min-w-0 flex-1 space-y-2">
      <label>
        {copy.searchLabel}
        <Input
          value={search}
          maxLength={100}
          placeholder={copy.searchPlaceholder}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {isError && <p role="alert">{copy.loadFailed}</p>}
      <div className="max-h-48 space-y-1 overflow-y-auto">
        {data?.animals.map((a) => (
          <button
            type="button"
            key={a.id}
            aria-pressed={value === a.id}
            onClick={() => onChange(a.id)}
            className={`flex w-full items-center gap-2 rounded border p-2 text-left ${value === a.id ? "border-[var(--color-primary)] bg-[var(--color-primary-highlight)]" : ""}`}
          >
            {a.image_url && (
              <img alt="" src={a.image_url} className="h-10 w-10 rounded object-cover" />
            )}
            <span>
              {localizedText(a.name, a.name_en, language)} · {a.code || copy.noCode}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
