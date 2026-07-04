import { CalendarDays, Languages, Mail, Phone, ShieldCheck, Tags } from "lucide-react";

import type { SupporterDetail, SupporterRole } from "../../../lib/crm/types";
import { formatAdminDateTime } from "../adminPageCopy";

type SupporterProfileSidebarProps = {
  supporter: SupporterDetail;
  language: "zh" | "en";
  roleLabels: Record<SupporterRole, string>;
};

const PROFILE_COPY = {
  zh: {
    profile: "支持者資料",
    contact: "聯絡",
    noPhone: "沒有電話",
    language: "語言",
    consent: "通訊同意",
    emailConsent: "電郵",
    whatsappConsent: "WhatsApp",
    source: "來源",
    created: "建立",
    updated: "更新",
    tags: "標籤",
    noTags: "沒有標籤",
    adoption: "領養連結",
    primaryProfile: "主要領養人檔案",
    otherProfiles: "其他檔案",
    noAdoption: "尚未連結領養紀錄。",
    noContact: "沒有聯絡資料",
    consentStatuses: {
      opt_in: "同意",
      opt_out: "不同意",
      none: "未設定",
    },
    languages: {
      "zh-HK": "繁體中文",
      en: "English",
    },
  },
  en: {
    profile: "Supporter profile",
    contact: "Contact",
    noPhone: "No phone",
    language: "Language",
    consent: "Consent",
    emailConsent: "Email",
    whatsappConsent: "WhatsApp",
    source: "Source",
    created: "Created",
    updated: "Updated",
    tags: "Tags",
    noTags: "No tags",
    adoption: "Adoption links",
    primaryProfile: "Primary adopter profile",
    otherProfiles: "Other profiles",
    noAdoption: "No linked adoption history.",
    noContact: "No contact details",
    consentStatuses: {
      opt_in: "Opted in",
      opt_out: "Opted out",
      none: "Not set",
    },
    languages: {
      "zh-HK": "Traditional Chinese",
      en: "English",
    },
  },
} as const;

function formatFallback(value: string | null | undefined, fallback = "-") {
  return value && value.trim().length > 0 ? value : fallback;
}

function consentLabel(value: SupporterDetail["emailConsent"], language: keyof typeof PROFILE_COPY) {
  const copy = PROFILE_COPY[language].consentStatuses;
  return value ? copy[value] : copy.none;
}

export function SupporterProfileSidebar({
  supporter,
  language,
  roleLabels,
}: SupporterProfileSidebarProps) {
  const copy = PROFILE_COPY[language];
  const profiles = [...supporter.adoption.profiles].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  const [primaryProfile, ...otherProfiles] = profiles;

  return (
    <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <p className="text-xs font-medium uppercase text-[var(--color-text-muted)]">
          {copy.profile}
        </p>
        <h1 className="mt-2 text-2xl font-bold text-[var(--color-panel)]">{supporter.name}</h1>

        <div className="mt-4 flex flex-wrap gap-2">
          {supporter.roles.map((role) => (
            <span
              key={role}
              className="rounded-full bg-[var(--color-accent-soft)] px-3 py-1 text-xs font-medium text-[var(--color-panel)]"
            >
              {roleLabels[role] ?? role}
            </span>
          ))}
        </div>

        <div className="mt-5 space-y-3 text-sm">
          <div className="flex gap-3">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" />
            <span className="min-w-0 break-words text-[var(--color-panel)]">
              {formatFallback(supporter.email, copy.noContact)}
            </span>
          </div>
          <div className="flex gap-3">
            <Phone className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" />
            <span className="text-[var(--color-panel)]">
              {formatFallback(supporter.phone, copy.noPhone)}
            </span>
          </div>
          <div className="flex gap-3">
            <Languages className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" />
            <span className="text-[var(--color-panel)]">
              {copy.languages[supporter.language] ?? supporter.language}
            </span>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="text-sm font-semibold text-[var(--color-panel)]">{copy.contact}</h2>
        <dl className="mt-3 space-y-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <dt className="text-[var(--color-text-muted)]">{copy.emailConsent}</dt>
            <dd className="text-right font-medium text-[var(--color-panel)]">
              {consentLabel(supporter.emailConsent, language)}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt className="text-[var(--color-text-muted)]">{copy.whatsappConsent}</dt>
            <dd className="text-right font-medium text-[var(--color-panel)]">
              {consentLabel(supporter.whatsappConsent, language)}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt className="text-[var(--color-text-muted)]">{copy.source}</dt>
            <dd className="text-right font-medium text-[var(--color-panel)]">
              {formatFallback(supporter.source)}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt className="text-[var(--color-text-muted)]">{copy.created}</dt>
            <dd className="text-right font-medium text-[var(--color-panel)]">
              {formatAdminDateTime(supporter.createdAt, language)}
            </dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt className="text-[var(--color-text-muted)]">{copy.updated}</dt>
            <dd className="text-right font-medium text-[var(--color-panel)]">
              {formatAdminDateTime(supporter.updatedAt, language)}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="flex items-center gap-2">
          <Tags className="h-4 w-4 text-[var(--color-primary)]" />
          <h2 className="text-sm font-semibold text-[var(--color-panel)]">{copy.tags}</h2>
        </div>
        {supporter.tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {supporter.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-text-muted)]"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">{copy.noTags}</p>
        )}
      </section>

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[var(--color-primary)]" />
          <h2 className="text-sm font-semibold text-[var(--color-panel)]">{copy.adoption}</h2>
        </div>
        {primaryProfile ? (
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-xs font-medium uppercase text-[var(--color-text-muted)]">
                {copy.primaryProfile}
              </p>
              <a
                href={`/admin/coordinator/adopters/${primaryProfile.id}`}
                className="mt-1 block font-semibold text-[var(--color-primary)] hover:underline"
              >
                {primaryProfile.displayName}
              </a>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                {formatFallback(primaryProfile.livingArea)}
              </p>
            </div>
            {otherProfiles.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase text-[var(--color-text-muted)]">
                  {copy.otherProfiles}
                </p>
                <div className="mt-2 space-y-2">
                  {otherProfiles.map((profile) => (
                    <a
                      key={profile.id}
                      href={`/admin/coordinator/adopters/${profile.id}`}
                      className="block truncate text-sm font-medium text-[var(--color-primary)] hover:underline"
                    >
                      {profile.displayName}
                    </a>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
              <CalendarDays className="h-3.5 w-3.5" />
              <span>{formatAdminDateTime(primaryProfile.updatedAt, language)}</span>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">{copy.noAdoption}</p>
        )}
      </section>
    </aside>
  );
}
