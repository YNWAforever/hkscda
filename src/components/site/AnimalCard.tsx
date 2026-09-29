import { Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import type { Animal } from "../../types/animal";
import { PublicStatusBadge } from "./PublicStatusBadge";
import { ShortlistActionButton } from "./ShortlistActionButton";
import { AnimalPhoto } from "./AnimalPhoto";

interface AnimalCardProps {
  animal: Animal;
  intent?: "adoption" | "sponsorship";
  priority?: boolean;
}

export function AnimalCard({
  animal,
  intent = animal.type === "sponsor" ? "sponsorship" : "adoption",
  priority = false,
}: AnimalCardProps) {
  const detailHref =
    intent === "sponsorship"
      ? "/sponsors/" + animal.id
      : "/animals/" + animal.type + "/" + animal.id;
  const profile = animal.public_profile;
  return (
    <article className="public-animal-card animal-profile-card">
      <Link
        to={detailHref}
        className="animal-profile-card-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-inset"
      >
        {/* The photograph leads the card. It used to sit inside the identity
            row as an 88px square beside the name, so the animal -- the whole
            reason someone is on this page -- occupied less area than its own
            caption. */}
        <AnimalPhoto animal={animal} priority={priority} />
        <div className="animal-profile-identity">
          <div className="min-w-0">
            {profile?.code && <p className="animal-profile-code">編號 {profile.code}</p>}
            <h2>{animal.name}</h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              {animal.type === "dog" ? "狗狗" : animal.type === "cat" ? "貓貓" : "助養動物"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <PublicStatusBadge tone="info" icon={CheckCircle2}>
            {intent === "sponsorship" ? "待助養" : "待領養"}
          </PublicStatusBadge>
          {intent === "adoption" && animal.sponsorship_eligible ? (
            <PublicStatusBadge tone="info">可助養</PublicStatusBadge>
          ) : null}
          {intent === "sponsorship" && animal.adoption_eligible ? (
            <PublicStatusBadge tone="info">可領養</PublicStatusBadge>
          ) : null}
        </div>
        <dl className="animal-profile-facts">
          <div>
            <dt>性別</dt>
            <dd>
              {animal.gender === "male" ? "公" : animal.gender === "female" ? "母" : "未有記錄"}
            </dd>
          </div>
          <div>
            <dt>年齡</dt>
            <dd>{animal.age || "未有記錄"}</dd>
          </div>
          {profile?.neutered !== null && profile?.neutered !== undefined ? (
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
          ) : null}
          {profile?.suitability ? (
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
          ) : null}
        </dl>
        {profile?.personality && (
          <p className="animal-profile-summary">
            <span className="font-bold">性格：</span>
            {profile.personality}
          </p>
        )}
        {intent === "sponsorship" &&
        (profile?.health || profile?.sponsorUse || profile?.recentProgress) ? (
          <dl className="space-y-1 rounded-md bg-[var(--color-surface-offset)] p-3 text-sm text-[var(--color-text-muted)]">
            {profile.health ? (
              <div>
                <dt className="font-semibold">照顧需要</dt>
                <dd>{profile.health}</dd>
              </div>
            ) : null}
            {profile.sponsorUse ? (
              <div>
                <dt className="font-semibold">助養用途</dt>
                <dd>{profile.sponsorUse}</dd>
              </div>
            ) : null}
            {profile.recentProgress ? (
              <div>
                <dt className="font-semibold">近況</dt>
                <dd>{profile.recentProgress}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
        <span className="mt-auto inline-flex min-h-11 items-center text-sm font-bold text-[var(--color-primary)]">
          查看詳細資料{" "}
          <span className="ml-1" aria-hidden="true">
            →
          </span>
        </span>
      </Link>
      <div className="px-5 pb-5">
        <ShortlistActionButton intent={intent} animal={animal} compact />
      </div>
    </article>
  );
}
