import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { publicUrl } from "@/lib/publicOrigin";
import { brand } from "@/lib/brand/brand";
import { CalendarDays, Cat, Dog, Heart, House, Scissors, UserPlus, Users } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { PublicFormFrame } from "../components/site/PublicFormFrame";
import { TurnstileWidget, turnstileEnabled } from "../components/site/TurnstileWidget";
import {
  activityAvailabilityLabel,
  buildVolunteerRegistrationPayload,
  canRegisterForActivity,
} from "../components/site/volunteer/volunteerSignupLogic";
import {
  PUBLIC_INDIVIDUAL_MIN_AGE,
  type VolunteerActivitySummary,
  type VolunteerRegistrationType,
} from "../lib/volunteers/types";

const volunteerRoles = [
  {
    Icon: House,
    title: "暫托家庭",
    desc: "為等待領養的動物提供臨時居所，讓牠們在溫暖的家中等待領養。需家訪審核。",
  },
  {
    Icon: Cat,
    title: "貓舍義工",
    desc: "清潔貓舍、餵食、社交化貓咪、協助領養日活動。彈性時間，適合學生或在職人士。",
  },
  {
    Icon: Dog,
    title: "狗舍義工",
    desc: "溜狗、清潔狗舍、餵食、協助基本訓練。需要體力，適合喜歡戶外活動的人士。",
  },
  {
    Icon: Scissors,
    title: "TNR義工",
    desc: "協助捕捉、運送及放回流浪貓。需要耐性和體力，通常於清晨或晚間行動。",
  },
  {
    Icon: UserPlus,
    title: "領養日義工",
    desc: "協助每月領養日佈置、接待訪客、介紹動物。適合喜歡與人交流的人士。",
  },
  {
    Icon: Heart,
    title: "專業義工",
    desc: "如你擁有獸醫、攝影、設計、翻譯等專業技能，歡迎以專業支持協會。",
  },
];

export const Route = createFileRoute("/volunteer")({
  head: () => ({
    meta: [
      { title: "加入義工團隊 · 香港拯救貓狗協會 HKSCDA" },
      {
        name: "description",
        content:
          "加入香港拯救貓狗協會義工團隊。暫托家庭、貓狗舍義工、TNR行動、領養日義工等多種義工機會。一起拯救生命。",
      },
      { property: "og:title", content: "加入義工團隊 · HKSCDA" },
      {
        property: "og:description",
        content: "多種義工機會：暫托、貓舍、狗舍、TNR、領養日。一起為毛孩出力。",
      },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: publicUrl("/volunteer") }],
  }),
  component: VolunteerPage,
});

export function VolunteerPage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (pathname.startsWith("/volunteer/status/") || pathname.startsWith("/volunteer/group")) {
    return <Outlet />;
  }

  return (
    <PublicFormFrame trustNote="你的個人資料只會用於義工登記及聯絡，不會作其他用途。">
      <VolunteerDirectoryPage />
    </PublicFormFrame>
  );
}

function VolunteerDirectoryPage() {
  const [activities, setActivities] = useState<VolunteerActivitySummary[]>([]);
  const [selectedActivityId, setSelectedActivityId] = useState<string>("");
  const [registrationType, setRegistrationType] = useState<VolunteerRegistrationType>("individual");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [participantCount, setParticipantCount] = useState(2);
  const [declaredAge, setDeclaredAge] = useState("");
  const [youngestAge, setYoungestAge] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [emailConsent, setEmailConsent] = useState(true);
  const [whatsappConsent, setWhatsappConsent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successUrl, setSuccessUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void fetch("/api/volunteer/activities")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load activities");
        return (await response.json()) as { activities: VolunteerActivitySummary[] };
      })
      .then((body) => {
        setActivities(body.activities);
        setSelectedActivityId((current) => current || body.activities[0]?.id || "");
      })
      .catch(() => setLoadError("暫時未能載入義工活動，請稍後再試。"));
  }, []);

  const selectedActivity = useMemo(
    () => activities.find((activity) => activity.id === selectedActivityId) ?? null,
    [activities, selectedActivityId],
  );
  const canSubmit =
    selectedActivity &&
    canRegisterForActivity(selectedActivity) &&
    (!turnstileEnabled || Boolean(turnstileToken));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedActivity) return;
    setSubmitting(true);
    setSubmitError(null);
    setTurnstileToken(null);
    setSuccessUrl(null);
    try {
      const response = await fetch("/api/volunteer/registrations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          buildVolunteerRegistrationPayload({
            activityId: selectedActivity.id,
            registrationType,
            contactName,
            email,
            phone,
            organizationName,
            participantCount,
            declaredAge: declaredAge ? Number(declaredAge) : null,
            youngestAge: youngestAge ? Number(youngestAge) : null,
            guardianName,
            guardianPhone,
            notes,
            emailConsent,
            whatsappConsent,
            turnstileToken,
          }),
        ),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        statusUrl?: string;
      };
      if (!response.ok) throw new Error(body.error ?? "登記未能送出");
      setSuccessUrl(body.statusUrl ?? null);
    } catch (error) {
      if (turnstileEnabled) setTurnstileResetKey((key) => key + 1);
      setSubmitError(error instanceof Error ? error.message : "登記未能送出");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-10">
      <div>
        <div className="text-xs font-bold uppercase tracking-widest text-[var(--color-primary)] mb-3 flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" /> 義工招募
        </div>
        <h1 className="font-display text-3xl lg:text-5xl font-bold mb-4 leading-tight">
          他們，需要你的援手
        </h1>
        <p className="text-[var(--color-text-muted)] max-w-[52ch]">
          協會依靠義工的力量運作。無論你是學生、在職人士或退休人士，都能找到適合自己的義工崗位。
        </p>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-[var(--color-primary)]">
            <CalendarDays className="h-4 w-4" /> 可報名活動
          </div>
          {loadError ? (
            <div
              role="alert"
              aria-live="assertive"
              className="rounded-lg bg-[var(--color-surface-offset)] p-4 text-sm text-[var(--color-text-muted)]"
            >
              <p>{loadError}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={`mailto:${brand.org.email}`} className="btn-secondary min-h-11">
                  電郵聯絡職員
                </a>
                <a
                  href="https://wa.me/85298641089"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary min-h-11"
                >
                  WhatsApp 9864 1089
                </a>
              </div>
            </div>
          ) : activities.length === 0 ? (
            <div className="rounded-lg bg-[var(--color-surface-offset)] p-4 text-sm text-[var(--color-text-muted)]">
              <p>目前未有開放報名的義工活動。你仍可直接聯絡職員查詢之後的機會。</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={`mailto:${brand.org.email}`} className="btn-secondary min-h-11">
                  電郵聯絡職員
                </a>
                <a
                  href="https://wa.me/85298641089"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary min-h-11"
                >
                  WhatsApp 9864 1089
                </a>
              </div>
            </div>
          ) : (
            activities.map((activity) => (
              <button
                key={activity.id}
                type="button"
                aria-pressed={activity.id === selectedActivityId}
                onClick={() => {
                  setSelectedActivityId(activity.id);
                  if (!activity.registrationModes.includes(registrationType)) {
                    setRegistrationType(activity.registrationModes[0] ?? "individual");
                  }
                }}
                className={`w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left transition ${
                  activity.id === selectedActivityId ? "shadow-md" : "hover:shadow-sm"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg font-bold">{activity.title}</h2>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                      {new Date(activity.startsAt).toLocaleString("zh-HK", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                  </div>
                  <span className="rounded-full bg-[var(--color-primary-highlight)] px-3 py-1 text-xs font-bold text-[var(--color-primary)]">
                    {activityAvailabilityLabel(activity)}
                  </span>
                </div>
                <p className="mt-3 text-sm text-[var(--color-text-muted)]">
                  {activity.location} · 最低年齡 {activity.minAge ?? 0}+
                </p>
              </button>
            ))
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-offset)] p-5 shadow-soft"
        >
          <div>
            <h2 className="font-display text-xl font-bold">個人義工報名</h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              {"只接受" + PUBLIC_INDIVIDUAL_MIN_AGE + "歲以上個人義工申請。"}
              <a
                href="/volunteer/group"
                className="font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline"
              >
                團體或學校查詢
              </a>
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">
              姓名
              <input
                id="volunteer-contact-name"
                aria-invalid={false}
                aria-describedby={undefined}
                required
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
              />
            </label>
            <label className="text-sm font-semibold">
              電郵
              <input
                id="volunteer-email"
                aria-invalid={false}
                aria-describedby={undefined}
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
              />
            </label>
            <label className="text-sm font-semibold">
              電話 / WhatsApp
              <input
                id="volunteer-phone"
                aria-invalid={false}
                aria-describedby={undefined}
                required
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
              />
            </label>
            <label className="text-sm font-semibold">
              報名類型
              <select
                id="volunteer-registration-type"
                aria-invalid={false}
                aria-describedby={undefined}
                value={registrationType}
                onChange={(event) =>
                  setRegistrationType(event.target.value as VolunteerRegistrationType)
                }
                className="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
              >
                {(selectedActivity?.registrationModes ?? ["individual", "group"]).map((mode) => (
                  <option key={mode} value={mode}>
                    {mode === "individual" ? "個人義工" : "團體報名"}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {registrationType === "group" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold">
                團體 / 學校名稱
                <input
                  id="volunteer-organization"
                  aria-invalid={false}
                  aria-describedby={undefined}
                  required
                  value={organizationName}
                  onChange={(event) => setOrganizationName(event.target.value)}
                  className="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
                />
              </label>
              <label className="text-sm font-semibold">
                參加人數
                <input
                  id="volunteer-participant-count"
                  aria-invalid={false}
                  aria-describedby={undefined}
                  required
                  type="number"
                  min={2}
                  value={participantCount}
                  onChange={(event) => setParticipantCount(Number(event.target.value))}
                  className="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
                />
              </label>
              <label className="text-sm font-semibold">
                最年輕參加者年齡
                <input
                  id="volunteer-youngest-age"
                  aria-invalid={false}
                  aria-describedby={undefined}
                  type="number"
                  min={0}
                  value={youngestAge}
                  onChange={(event) => setYoungestAge(event.target.value)}
                  className="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
                />
              </label>
              <label className="text-sm font-semibold">
                負責成人 / 老師姓名
                <input
                  id="volunteer-guardian-name"
                  aria-invalid={false}
                  aria-describedby={undefined}
                  required
                  value={guardianName}
                  onChange={(event) => setGuardianName(event.target.value)}
                  className="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
                />
              </label>
            </div>
          ) : (
            <label className="block text-sm font-semibold">
              年齡
              <input
                id="volunteer-declared-age"
                aria-invalid={false}
                aria-describedby={undefined}
                type="number"
                min={PUBLIC_INDIVIDUAL_MIN_AGE}
                value={declaredAge}
                onChange={(event) => setDeclaredAge(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
              />
            </label>
          )}

          <label className="block text-sm font-semibold">
            備註
            <textarea
              id="volunteer-notes"
              aria-invalid={false}
              aria-describedby={undefined}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="mt-1 min-h-24 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
            />
          </label>

          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                id="volunteer-email-consent"
                aria-invalid={false}
                aria-describedby={undefined}
                type="checkbox"
                checked={emailConsent}
                onChange={(event) => setEmailConsent(event.target.checked)}
              />
              接收電郵通知
            </label>
            <label className="flex items-center gap-2">
              <input
                id="volunteer-whatsapp-consent"
                aria-invalid={false}
                aria-describedby={undefined}
                type="checkbox"
                checked={whatsappConsent}
                onChange={(event) => setWhatsappConsent(event.target.checked)}
              />
              接收 WhatsApp 通知
            </label>
          </div>

          <TurnstileWidget
            language="zh-HK"
            resetKey={turnstileResetKey}
            onVerify={setTurnstileToken}
            onExpire={() => setTurnstileToken(null)}
          />

          {submitError && (
            <p
              role="alert"
              aria-live="assertive"
              className="text-sm font-semibold text-[var(--color-error)]"
            >
              {submitError}
            </p>
          )}
          {successUrl && (
            <a
              href={successUrl}
              role="status"
              aria-live="polite"
              className="block rounded-md bg-[var(--color-primary-highlight)] px-3 py-2 text-sm font-bold text-[var(--color-primary)]"
            >
              登記已送出，查看狀態
            </a>
          )}

          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "送出中..." : "送出義工報名"}
          </button>
        </form>
      </section>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {volunteerRoles.map(({ Icon, title, desc }) => (
          <div
            key={title}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-6 transition-shadow hover:shadow-md"
          >
            <div className="h-11 w-11 rounded-lg bg-[var(--color-primary-highlight)] flex items-center justify-center mb-4">
              <Icon className="h-5 w-5 text-[var(--color-primary)]" />
            </div>
            <h2 className="font-display font-bold mb-2">{title}</h2>
            <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      <div className="space-y-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-offset)] p-6">
        <h2 className="font-display text-lg font-bold">如何加入？</h2>
        <div className="space-y-3 text-sm text-[var(--color-text-muted)]">
          {[
            `透過電郵 ${brand.org.email} 或 WhatsApp ${brand.org.phone} 聯絡我們，說明你想參與的義工崗位。`,
            "我們會安排一次簡短面談，了解你的背景、可付出的時間及期望。",
            "完成基本培訓後，即可開始義工服務。協會會為所有義工提供持續支援及指導。",
          ].map((text, i) => (
            <div key={i} className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)] text-xs flex items-center justify-center font-bold">
                {i + 1}
              </span>
              <span>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
