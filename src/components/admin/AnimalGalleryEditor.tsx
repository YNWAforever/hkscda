import type { AnimalGalleryItem } from "../../types/animal";

export type EditableGalleryItem = AnimalGalleryItem & { file?: File };

export function AnimalGalleryEditor({
  items,
  onChange,
}: {
  items: EditableGalleryItem[];
  onChange: (items: EditableGalleryItem[]) => void;
}) {
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
      <legend className="px-1 text-sm font-semibold">相片集及審核資料</legend>
      <p className="text-xs text-[var(--color-text-muted)]">
        只有已批准並已發布的相片會公開。請設定排序、焦點、雙語替代文字及來源。
      </p>
      <input
        aria-label="新增相片集相片"
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
            <strong>相片 {index + 1}</strong>
            <button type="button" onClick={() => move(index, -1)} disabled={index === 0}>
              上移
            </button>
            <button
              type="button"
              onClick={() => move(index, 1)}
              disabled={index === items.length - 1}
            >
              下移
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
              移除
            </button>
          </div>
          <label className="block text-sm">
            中文替代文字
            <input
              className="mt-1 w-full rounded border px-2 py-1"
              value={item.alt_zh}
              onChange={(e) => update(index, { alt_zh: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            英文替代文字
            <input
              className="mt-1 w-full rounded border px-2 py-1"
              value={item.alt_en ?? ""}
              onChange={(e) => update(index, { alt_en: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            相片來源
            <input
              className="mt-1 w-full rounded border px-2 py-1"
              value={item.source}
              onChange={(e) => update(index, { source: e.target.value })}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              水平焦點 {item.focal_x}%
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
              垂直焦點 {item.focal_y}%
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
            審核狀態
            <select
              className="ml-2 rounded border px-2 py-1"
              value={item.review_status}
              onChange={(e) =>
                update(index, {
                  review_status: e.target.value as AnimalGalleryItem["review_status"],
                })
              }
            >
              <option value="pending">待審核</option>
              <option value="approved">已批准</option>
              <option value="rejected">不採用</option>
            </select>
          </label>
        </article>
      ))}
    </fieldset>
  );
}
