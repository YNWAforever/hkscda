import { Cat, CheckCircle2, Dog } from "lucide-react";
import type { Animal, AgeFilter } from "../../types/animal";
import { parseAgeFilter } from "../../types/animal";
import { PublicDetailFrame } from "./PublicDetailFrame";
import { PublicStatusBadge } from "./PublicStatusBadge";
import { ShortlistActionButton } from "./ShortlistActionButton";

const AGE_GROUP_LABELS: Record<AgeFilter, string> = {
  all: "",
  bb: "幼年",
  adult: "成年",
  senior: "熟齡",
};

const updatedAtFormatter = new Intl.DateTimeFormat("zh-HK", {
  dateStyle: "long",
  timeZone: "Asia/Hong_Kong",
});

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return updatedAtFormatter.format(date);
}

interface AnimalDetailProps {
  animal: Animal;
  backHref: string;
  backLabel: string;
}

export function AnimalDetail({ animal, backHref, backLabel }: AnimalDetailProps) {
  const TypeIcon = animal.type === "dog" ? Dog : Cat;
  const typeLabel = animal.type === "dog" ? "狗狗" : "貓貓";
  const updatedAt = formatUpdatedAt(animal.updated_at);

  return (
    <PublicDetailFrame
      breadcrumbHref={backHref}
      breadcrumbLabel={backLabel}
      panel={
        <>
          <div className="detail-status">
            <PublicStatusBadge tone="info" icon={CheckCircle2}>
              待領養
            </PublicStatusBadge>
            <span className="inline-flex items-center gap-1 text-sm text-[var(--color-text-muted)]">
              <TypeIcon className="h-4 w-4" aria-hidden="true" /> {typeLabel}
            </span>
          </div>
          <h1>{animal.name}</h1>
          {animal.name_en ? <p className="animal-english-name">{animal.name_en}</p> : null}
          <dl className="fact-list">
            <div>
              <dt>性別</dt>
              <dd>{animal.gender === "male" ? "公" : "母"}</dd>
            </div>
            <div>
              <dt>年齡</dt>
              <dd>{animal.age}</dd>
            </div>
            <div>
              <dt>年齡組別</dt>
              <dd>{AGE_GROUP_LABELS[parseAgeFilter(animal.age)]}</dd>
            </div>
            {updatedAt ? (
              <div>
                <dt>資料更新</dt>
                <dd>{updatedAt}</dd>
              </div>
            ) : null}
          </dl>
          <ShortlistActionButton animal={animal} />
        </>
      }
    >
      <div className="detail-gallery" aria-label={typeLabel + "相片：" + animal.name}>
        {animal.image_url ? (
          <img src={animal.image_url} alt={"待領養" + typeLabel + "：" + animal.name} />
        ) : (
          <div className="detail-image-fallback flex flex-col items-center justify-center gap-3 p-8 text-center">
            <span className="flex h-28 w-28 items-center justify-center rounded-full bg-white text-[var(--color-primary)] shadow-soft">
              <TypeIcon className="h-14 w-14" aria-hidden="true" />
            </span>
            <strong>{animal.name}</strong>
          </div>
        )}
      </div>
      <div className="detail-story">
        <p className="eyebrow">認識牠</p>
        <h2>救援與領養資料</h2>
        {animal.description ? (
          <p>{animal.description}</p>
        ) : (
          <p className="transparent-empty">
            現有公開欄位未提供可核實的救援故事，因此不以推測內容補寫。
          </p>
        )}
        {animal.notes ? <p className="detail-note">{animal.notes}</p> : null}
      </div>
      <div className="detail-disclosure">
        <h2>公開資料範圍</h2>
        <p>
          現有動物資料結構未有獨立的疫苗、絕育、醫療、相容性、性格及家居要求欄位；只有獲准公開的資料才會在此出現。
        </p>
      </div>
    </PublicDetailFrame>
  );
}
