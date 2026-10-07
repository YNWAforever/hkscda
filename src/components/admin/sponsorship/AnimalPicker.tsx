import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "../../ui/input";
import { fetchCoordinatorJson } from "../adoptions/api";
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
        搜尋助養動物
        <Input
          value={search}
          maxLength={100}
          placeholder="名字或動物編號"
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {isError && <p role="alert">未能載入可配對動物</p>}
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
              {a.name} · {a.code || "未有公開編號"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
