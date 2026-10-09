import type { AnimalGalleryItem } from "../../types/animal";
import { animalFormCopy } from "./animalFormCopy";
import { useAdminCopy } from "./i18n/copy";

export type EditableGalleryItem = AnimalGalleryItem & { file?: File };

export function AnimalGalleryEditor({
  items,
  onChange,
}: {
  items: EditableGalleryItem[];
  onChange: (items: EditableGalleryItem[]) => void;
}) {
  const copy = useAdminCopy(animalFormCopy).gallery;
  const update = (index: number, patch: Partial<EditableGalleryItem>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const move = (index: number, offset: number) => {
    const next = [...items],
      target = index + offset;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next.map((item, sort_order) => ({ ...item, sort_order })));
  };
  return (
    <fieldset className="space-y-3 rounded-lg border border-[var(--color-border)] p-4">
      <legend className="px-1 text-sm font-semibold">{copy.legend}</legend>
      <p className="text-xs text-[var(--color-text-muted)]">{copy.hint}</p>
      <input
        aria-label={copy.addLabel}
        type="file"
        accept="image/*"
        multiple
        onChange={(event) => {
          const added = Array.from(event.target.files ?? []).map((file, offset) => ({
            id: crypto.randomUUID(),
            url: null,
            draft_path: null,
            alt_zh: "",
            alt_en: "",
            source: "",
            focal_x: 50,
            focal_y: 50,
            review_status: "pending" as const,
            sort_order: items.length + offset,
            file,
          }));
          onChange([...items, ...added]);
          event.currentTarget.value = "";
        }}
      />
      {items.map((item, index) => (
        <article key={item.id} className="space-y-2 rounded border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <strong>{copy.photoNumber(index + 1)}</strong>
            <button type="button" onClick={() => move(index, -1)} disabled={index === 0}>
              {copy.moveUp}
            </button>
            <button
              type="button"
              onClick={() => move(index, 1)}
              disabled={index === items.length - 1}
            >
              {copy.moveDown}
            </button>
            <button
              type="button"
              onClick={() =>
                onChange(
                  items
                    .filter((_, i) => i !== index)
                    .map((x, sort_order) => ({ ...x, sort_order })),
                )
              }
            >
              {copy.remove}
            </button>
          </div>
          <label className="block text-sm">
            {copy.altZh}
            <input
              className="mt-1 w-full rounded border px-2 py-1"
              value={item.alt_zh}
              onChange={(e) => update(index, { alt_zh: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            {copy.altEn}
            <input
              className="mt-1 w-full rounded border px-2 py-1"
              value={item.alt_en ?? ""}
              onChange={(e) => update(index, { alt_en: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            {copy.source}
            <input
              className="mt-1 w-full rounded border px-2 py-1"
              value={item.source}
              onChange={(e) => update(index, { source: e.target.value })}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              {copy.focalX(item.focal_x)}
              <input
                className="w-full"
                type="range"
                min="0"
                max="100"
                value={item.focal_x}
                onChange={(e) => update(index, { focal_x: Number(e.target.value) })}
              />
            </label>
            <label className="text-sm">
              {copy.focalY(item.focal_y)}
              <input
                className="w-full"
                type="range"
                min="0"
                max="100"
                value={item.focal_y}
                onChange={(e) => update(index, { focal_y: Number(e.target.value) })}
              />
            </label>
          </div>
          <label className="block text-sm">
            {copy.reviewStatus}
            <select
              className="ml-2 rounded border px-2 py-1"
              value={item.review_status}
              onChange={(e) =>
                update(index, {
                  review_status: e.target.value as AnimalGalleryItem["review_status"],
                })
              }
            >
              <option value="pending">{copy.pending}</option>
              <option value="approved">{copy.approved}</option>
              <option value="rejected">{copy.rejected}</option>
            </select>
          </label>
        </article>
      ))}
    </fieldset>
  );
}
