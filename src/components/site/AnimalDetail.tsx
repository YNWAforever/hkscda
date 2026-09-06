import { AnimalPhoto } from "./AnimalPhoto";
import { Cat, CheckCircle2, Dog } from "lucide-react";
import type { Animal, AgeFilter } from "../../types/animal";
import { parseAgeFilter } from "../../types/animal";
import { PublicDetailFrame } from "./PublicDetailFrame";
import { PublicStatusBadge } from "./PublicStatusBadge";
import { ShortlistActionButton } from "./ShortlistActionButton";

const AGE_GROUP_LABELS: Record<AgeFilter | "unknown", string> = {
  all: "",
  unknown: "未有記錄",
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
  intent?: "adoption" | "sponsorship";
  backHref: string;
  backLabel: string;
}

export function AnimalDetail({
  animal,
  backHref,
  backLabel,
  intent = "adoption",
}: AnimalDetailProps) {
  const TypeIcon = animal.type === "dog" ? Dog : Cat;
  const typeLabel = animal.type === "dog" ? "狗狗" : "貓貓";
  const profile = animal.public_profile;
  const updatedAt = formatUpdatedAt(animal.updated_at);

  return (
    <PublicDetailFrame
      breadcrumbHref={backHref}
      breadcrumbLabel={backLabel}
      panel={
        <>
          <div className="detail-status">
            <PublicStatusBadge tone="info" icon={CheckCircle2}>
              {intent === "sponsorship" ? "待助養" : "待領養"}
            </PublicStatusBadge>
            <span className="inline-flex items-center gap-1 text-sm text-[var(--color-text-muted)]">
              <TypeIcon className="h-4 w-4" aria-hidden="true" /> {typeLabel}
            </span>
          </div>
          <h1>{animal.name}</h1>
          {animal.name_en ? <p className="animal-english-name">{animal.name_en}</p> : null}
          <dl className="fact-list">
            <div>
              <dt>編號</dt>
              <dd>{profile?.code || "未有記錄"}</dd>
            </div>
            <div>
              <dt>出生日期</dt>
              <dd>{profile?.birthday || "未有記錄"}</dd>
            </div>
            <div>
              <dt>絕育</dt>
              <dd>
                {profile?.neutered === true
                  ? "已絕育"
                  : profile?.neutered === false
                    ? "未絕育"
                    : "未有記錄"}
              </dd>
            </div>
            <div>
              <dt>領養經驗</dt>
              <dd>
                {profile?.suitability === "newbie"
                  ? "適合新手"
                  : profile?.suitability === "experienced"
                    ? "適合有經驗人士"
                    : "未有記錄"}
              </dd>
            </div>
            {profile?.recordDate ? (
              <div>
                <dt>原始記錄日期</dt>
                <dd>{profile.recordDate}</dd>
              </div>
            ) : null}
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
          <ShortlistActionButton intent={intent} animal={animal} />
        </>
      }
    >
      <AnimalPhoto animal={animal} detail />
      <div className="detail-story">
        <p className="eyebrow">認識牠</p>
        <h2>救援與領養資料</h2>
        {animal.description ? (
          <p>{animal.description}</p>
        ) : (
          <p className="transparent-empty">暫未有更多公開介紹。</p>
        )}
      </div>
      {(
        [
          ["性格", profile?.personality],
          ["照顧與健康需要", profile?.health],
          ["牠的故事", profile?.story],
        ] as const
      ).map(([title, text]) =>
        text ? (
          <section className="detail-story animal-profile-story" key={title}>
            <h2>{title}</h2>
            <p>{text}</p>
          </section>
        ) : null,
      )}
    </PublicDetailFrame>
  );
}
