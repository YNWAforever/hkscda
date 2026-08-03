import { createFileRoute } from "@tanstack/react-router";
import {
  BadgeCheck,
  Building,
  Check,
  CreditCard,
  Download,
  Globe,
  Heart,
  Loader2,
  ReceiptText,
  Smartphone,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { brand } from "../lib/brand/brand";
import {
  extractDonationAttribution,
  donateSearchSchema,
  type DonateSearch,
} from "../lib/donations/donateSearch";
import { loadDonationDocumentSlots } from "../lib/documents/donation.server";
import { asContextFreeRouteLoader } from "../lib/documents/routeLoaders.server";
import type { DocumentSlot } from "../lib/documents/types";
import {
  markDonationEventOnce,
  readCheckoutSnapshot,
  saveCheckoutSnapshot,
  trackDonationEvent,
} from "../lib/donations/analytics";
import { pollDonationSucceeded } from "../lib/donations/publicStatus";
import { centsToHkd, type DonationMethod, type DonationPurpose } from "../lib/donations/domain";
import { BrandLogo } from "../components/site/BrandLogo";
import { TurnstileWidget, turnstileEnabled } from "../components/site/TurnstileWidget";

export const Route = createFileRoute("/donate")({
  validateSearch: donateSearchSchema,
  loader: asContextFreeRouteLoader(loadDonationDocumentSlots),
  head: () => ({
    meta: [
      { title: "捐助我們 · 香港拯救貓狗協會 HKSCDA" },
      {
        name: "description",
        content:
          "支持香港拯救貓狗協會，捐款HK$100可申請退稅。PayMe、轉數快FPS、Stripe、PayPal多種捐款方式。慈善牌照91/14493。",
      },
      { property: "og:title", content: "捐助我們 · HKSCDA" },
      {
        property: "og:description",
        content: "您的每一份善意，都是生命的希望。立即捐款支持流浪貓狗。",
      },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://hkscda.com/donate" }],
  }),
  component: DonateRoute,
});

type Language = "zh-HK" | "en";

type ManualResult = {
  kind: "manual";
  donationId: string;
  reference: string;
  instructions: {
    method: "fps" | "payme";
    label: string;
    payableTo: string;
    identifier: string;
    amountCents: number;
  };
};

type RedirectResult = {
  kind: "redirect";
  donationId: string;
  url: string;
};

const copy = {
  "zh-HK": {
    eyebrow: "捐助我們",
    title: "您的每一份善意，都是生命的希望",
    intro: "本會為政府認可慈善機構（91/14493），善款用於流浪貓狗糧食、醫療、絕育及領養工作。",
    receiptBadge: "HK$100 或以上可申請 IRD §88 退稅收條",
    amount: "捐款金額",
    customAmount: "自訂金額",
    purpose: "捐款用途",
    customPurpose: "其他捐款用途（婚宴／活動／粉絲籌款 等）",
    details: "捐款人資料",
    method: "付款方式",
    receipt: "我需要退稅收條",
    emailConsent: "我同意以電郵接收捐款確認及收條通知",
    whatsappConsent: "我同意以 WhatsApp 接收收條及付款相關通知",
    pics: "個人資料只會用於處理捐款、收條、查詢及法例要求的紀錄保存。您可要求查閱、更正或撤回通訊同意。",
    donate: "繼續捐款",
    processing: "處理中",
    success: "多謝您的支持。付款確認後，系統會發出確認電郵及合資格收條。",
    cancelled: "付款尚未完成，您可以重新選擇付款方式。",
    paypalApproved: "PayPal 已授權，確認完成後會發出收據通知。",
    manualTitle: "請使用以下資料完成付款",
    reference: "付款參考編號",
    submitError: "暫時未能建立捐款，請稍後再試。",
    donorName: "姓名",
    email: "電郵",
    phone: "電話（選填）",
    verifyRequired: "請先完成人機驗證",
  },
  en: {
    eyebrow: "Donate",
    title: "Every gift gives rescued animals another chance",
    intro:
      "HKSCDA is an approved charitable institution (91/14493). Donations support food, medical care, desexing, and adoption work.",
    receiptBadge: "HK$100+ gifts can request an IRD Section 88 receipt",
    amount: "Donation amount",
    customAmount: "Custom amount",
    purpose: "Purpose",
    customPurpose: "Other donation purpose (wedding, event, fan fundraiser, etc.)",
    details: "Donor details",
    method: "Payment method",
    receipt: "I need a tax receipt",
    emailConsent: "I agree to receive donation confirmation and receipt updates by email",
    whatsappConsent: "I agree to receive receipt and payment updates by WhatsApp",
    pics: "Personal data is used only for donation processing, receipts, enquiries, and legally required record keeping. You may request access, correction, or consent withdrawal.",
    donate: "Continue donation",
    processing: "Processing",
    success:
      "Thank you for your support. A confirmation email and eligible receipt will be sent after payment is confirmed.",
    cancelled: "Payment is not complete. You can choose a payment method again.",
    paypalApproved: "PayPal approval received. We will notify you after confirmation.",
    manualTitle: "Complete payment with these details",
    reference: "Payment reference",
    submitError: "Donation could not be created. Please try again later.",
    donorName: "Name",
    email: "Email",
    phone: "Phone (optional)",
    verifyRequired: "Please complete the verification first.",
  },
} satisfies Record<Language, Record<string, string>>;

const amounts = [100, 300, 500, 1000];

const purposes: { value: DonationPurpose; zh: string; en: string }[] = [
  { value: "general", zh: "一般營運", en: "General" },
  { value: "medical", zh: "醫療基金", en: "Medical" },
  { value: "sponsor", zh: "助養動物", en: "Sponsor" },
];

const methods: { value: DonationMethod; zh: string; en: string; Icon: typeof CreditCard }[] = [
  { value: "stripe", zh: "信用卡 / Alipay", en: "Card / Alipay", Icon: CreditCard },
  { value: "fps", zh: "轉數快 FPS", en: "FPS", Icon: Zap },
  { value: "payme", zh: "PayMe", en: "PayMe", Icon: Smartphone },
  { value: "paypal", zh: "PayPal", en: "PayPal", Icon: Globe },
];

function DonateRoute() {
  return <DonatePage initialSlots={Route.useLoaderData()} initialSearch={Route.useSearch()} />;
}

export function DonatePage({
  initialSlots,
  initialSearch,
}: {
  initialSlots: DocumentSlot[];
  initialSearch: DonateSearch;
}) {
  const search = initialSearch;
  const attribution = extractDonationAttribution(search);
  const [language, setLanguage] = useState<Language>("zh-HK");
  const t = copy[language];
  const [selectedAmount, setSelectedAmount] = useState(300);
  const [customAmount, setCustomAmount] = useState("");
  const [purpose, setPurpose] = useState<DonationPurpose>(search.purpose ?? "general");
  const [customPurpose, setCustomPurpose] = useState("");
  const [method, setMethod] = useState<DonationMethod>("stripe");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [receiptRequested, setReceiptRequested] = useState(true);
  const [emailConsent, setEmailConsent] = useState(true);
  const [whatsappConsent, setWhatsappConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualResult, setManualResult] = useState<ManualResult | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  useEffect(() => {
    if (!attribution) return;

    if (markDonationEventOnce("donation_form_view", JSON.stringify(attribution))) {
      trackDonationEvent("donation_form_view", { attribution });
    }
  }, [attribution]);

  useEffect(() => {
    const donationId = search.donation;
    if (!donationId || (search.status !== "success" && search.status !== "paypal-approved")) {
      return;
    }

    const snapshot = readCheckoutSnapshot(donationId);
    if (!snapshot) return;

    let active = true;
    void pollDonationSucceeded(donationId).then((confirmed) => {
      if (!active || !confirmed) return;
      if (markDonationEventOnce("donation_success", donationId)) {
        trackDonationEvent("donation_success", {
          context: snapshot.context,
          purpose: snapshot.purpose,
          method: snapshot.method,
          value: snapshot.value,
          currency: snapshot.currency,
        });
      }
    });

    return () => {
      active = false;
    };
  }, [search.donation, search.status]);

  const amountHkd = useMemo(() => {
    const parsedCustom = Number(customAmount);
    return Number.isFinite(parsedCustom) && parsedCustom > 0 ? parsedCustom : selectedAmount;
  }, [customAmount, selectedAmount]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setManualResult(null);

    if (turnstileEnabled && !turnstileToken) {
      setError(t.verifyRequired);
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/donations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amountCents: Math.round(amountHkd * 100),
          currency: "HKD",
          purpose,
          customPurpose,
          method,
          receiptRequested,
          donor: { name, email, phone, language },
          consents: { email: emailConsent, whatsapp: whatsappConsent },
          turnstileToken,
          ...(attribution ? { attribution } : {}),
        }),
      });

      if (!response.ok) throw new Error("Donation request failed");
      const data = (await response.json()) as ManualResult | RedirectResult;

      if (attribution) {
        saveCheckoutSnapshot(data.donationId, {
          context: attribution.context,
          purpose,
          method,
          value: amountHkd,
          currency: "HKD",
        });
        if (markDonationEventOnce("begin_checkout", data.donationId)) {
          trackDonationEvent("begin_checkout", {
            attribution,
            method,
            value: amountHkd,
            currency: "HKD",
          });
        }
      }

      if (data.kind === "redirect") {
        window.location.href = data.url;
        return;
      }
      setManualResult(data);
    } catch (submitError) {
      console.error(submitError);
      setError(t.submitError);
    } finally {
      setLoading(false);
    }
  }

  const statusMessage =
    search.status === "success"
      ? t.success
      : search.status === "cancelled"
        ? t.cancelled
        : search.status === "paypal-approved"
          ? t.paypalApproved
          : null;

  const availableWeddingSlots = initialSlots.filter(
    (slot) => slot.slotKey === "wedding_gift_return_plan" && slot.document.fileUrl,
  );
  const primaryWedding =
    availableWeddingSlots.find((slot) => slot.language === language) ?? availableWeddingSlots[0];
  const alternateWedding = availableWeddingSlots.find((slot) => slot.id !== primaryWedding?.id);

  return (
    <main className="bg-[var(--color-background)]">
      <section className="bg-[var(--color-surface-offset)]">
        <div className="container-wide grid grid-cols-1 gap-8 py-10 lg:grid-cols-[0.9fr_1.1fr] lg:py-14">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary-highlight)] px-3 py-1 text-xs font-bold uppercase tracking-widest text-[var(--color-primary)]">
              <Heart className="h-3.5 w-3.5" /> {t.eyebrow}
            </div>
            <div className="space-y-4">
              <h1 className="font-display text-4xl font-extrabold leading-tight text-[var(--color-panel)] lg:text-6xl">
                {t.title}
              </h1>
              <p className="max-w-[52ch] text-sm leading-7 text-[var(--color-text-muted)] lg:text-base">
                {t.intro}
              </p>
              <div className="flex min-w-0 items-start gap-3 border-l-4 border-[var(--color-secondary)] pl-4">
                <BrandLogo className="h-16 w-16 shrink-0" eager />
                <div className="min-w-0 space-y-1 break-words text-sm text-[var(--color-text-muted)]">
                  <p className="font-bold text-[var(--color-panel)]">{brand.nameZh}</p>
                  <p>{brand.nameEn}</p>
                  <p>
                    Approved charitable institution 91/14493. Donation purpose: food, medical care,
                    desexing, and adoption work.
                  </p>
                  <a
                    className="font-semibold text-[var(--color-primary)] hover:underline"
                    href="mailto:info@hkscda.com"
                  >
                    info@hkscda.com
                  </a>
                </div>
              </div>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[var(--color-success-highlight)] px-4 py-2 text-xs font-bold text-[var(--color-success)]">
              <BadgeCheck className="h-4 w-4" /> {t.receiptBadge}
            </div>
            {statusMessage && (
              <div
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm font-medium text-[var(--color-panel)]"
              >
                {statusMessage}
              </div>
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            lang={language === "en" ? "en" : "zh-Hant"}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-soft lg:p-6"
          >
            <div className="mb-5 flex justify-end">
              <div className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-surface-offset)] p-1 text-xs font-bold">
                {(["zh-HK", "en"] as const).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    aria-pressed={language === lang}
                    onClick={() => setLanguage(lang)}
                    className={`rounded-full px-3 py-1.5 transition-colors ${
                      language === lang
                        ? "bg-[var(--color-primary)] text-white"
                        : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                    }`}
                  >
                    {lang === "zh-HK" ? "繁" : "EN"}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              <fieldset className="space-y-3">
                <legend className="text-sm font-bold text-[var(--color-panel)]">{t.amount}</legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {amounts.map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      aria-pressed={amountHkd === amount && !customAmount}
                      onClick={() => {
                        setSelectedAmount(amount);
                        setCustomAmount("");
                      }}
                      className={`min-h-11 rounded-md border px-4 py-3 text-sm font-bold transition-colors ${
                        amountHkd === amount && !customAmount
                          ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                          : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-primary)]"
                      }`}
                    >
                      HK${amount}
                    </button>
                  ))}
                </div>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-[var(--color-text-muted)]">
                    {t.customAmount}
                  </span>
                  <input
                    id="donation-custom-amount"
                    aria-invalid={false}
                    aria-describedby={undefined}
                    type="number"
                    min="10"
                    step="1"
                    value={customAmount}
                    onChange={(event) => setCustomAmount(event.target.value)}
                    className="w-full rounded-xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm focus:border-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
                    placeholder="HK$"
                  />
                </label>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className="text-sm font-bold text-[var(--color-panel)]">{t.purpose}</legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {purposes.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      aria-pressed={purpose === item.value}
                      onClick={() => setPurpose(item.value)}
                      className={`min-h-11 rounded-md border px-3 py-3 text-sm font-bold transition-colors ${
                        purpose === item.value
                          ? "border-[var(--color-panel)] bg-[var(--color-panel)] text-white"
                          : "border-[var(--color-border)] bg-white text-[var(--color-text)] hover:border-[var(--color-panel)]"
                      }`}
                    >
                      {language === "zh-HK" ? item.zh : item.en}
                    </button>
                  ))}
                </div>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-[var(--color-text-muted)]">
                    {t.customPurpose}
                  </span>
                  <input
                    name="customPurpose"
                    value={customPurpose}
                    onChange={(event) => setCustomPurpose(event.target.value)}
                    maxLength={200}
                    autoComplete="off"
                    className="w-full rounded-md border border-[var(--color-border)] bg-white px-4 py-3 text-sm focus:border-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
                  />
                </label>
              </fieldset>

              <fieldset className="grid gap-3 sm:grid-cols-2">
                <legend className="col-span-full text-sm font-bold text-[var(--color-panel)]">
                  {t.details}
                </legend>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-[var(--color-text-muted)]">
                    {t.donorName}
                  </span>
                  <input
                    id="donor-name"
                    aria-invalid={false}
                    aria-describedby={undefined}
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="w-full rounded-xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm focus:border-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold text-[var(--color-text-muted)]">
                    {t.email}
                  </span>
                  <input
                    id="donor-email"
                    aria-invalid={false}
                    aria-describedby={undefined}
                    required
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm focus:border-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-bold text-[var(--color-text-muted)]">
                    {t.phone}
                  </span>
                  <input
                    id="donor-phone"
                    aria-invalid={false}
                    aria-describedby={undefined}
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    className="w-full rounded-xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm focus:border-[var(--color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
                  />
                </label>
              </fieldset>

              <fieldset className="space-y-3">
                <legend className="text-sm font-bold text-[var(--color-panel)]">{t.method}</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {methods.map(({ value, zh, en, Icon }) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={method === value}
                      onClick={() => setMethod(value)}
                      className={`flex min-h-11 items-center gap-3 rounded-md border px-4 py-3 text-left text-sm font-bold transition-colors ${
                        method === value
                          ? "border-[var(--color-primary)] bg-[var(--color-primary-highlight)] text-[var(--color-primary)]"
                          : "border-[var(--color-border)] bg-white text-[var(--color-text)] hover:border-[var(--color-primary)]"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {language === "zh-HK" ? zh : en}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="space-y-3 rounded-md bg-[var(--color-surface-offset)] p-4">
                <legend className="text-sm font-bold text-[var(--color-panel)]">
                  Receipts and communication consent
                </legend>
                {[
                  {
                    id: "donation-receipt",
                    checked: receiptRequested,
                    setChecked: setReceiptRequested,
                    label: t.receipt,
                  },
                  {
                    id: "donation-email-consent",
                    checked: emailConsent,
                    setChecked: setEmailConsent,
                    label: t.emailConsent,
                  },
                  {
                    id: "donation-whatsapp-consent",
                    checked: whatsappConsent,
                    setChecked: setWhatsappConsent,
                    label: t.whatsappConsent,
                  },
                ].map(({ id, checked, setChecked, label }) => (
                  <label key={id} htmlFor={id} className="flex items-start gap-3 text-sm">
                    <input
                      id={id}
                      type="checkbox"
                      aria-invalid={false}
                      aria-describedby={undefined}
                      checked={checked}
                      onChange={(event) =>
                        (setChecked as React.Dispatch<React.SetStateAction<boolean>>)(
                          event.target.checked,
                        )
                      }
                      className="mt-1 h-4 w-4 accent-[var(--color-primary)]"
                    />
                    <span>{label}</span>
                  </label>
                ))}
                <p className="text-xs leading-6 text-[var(--color-text-muted)]">{t.pics}</p>
              </fieldset>

              <TurnstileWidget
                onVerify={setTurnstileToken}
                onExpire={() => setTurnstileToken(null)}
                language={language === "en" ? "en" : "zh-tw"}
              />

              {error && (
                <p role="alert" className="text-sm font-bold text-[var(--color-error)]">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || (turnstileEnabled && !turnstileToken)}
                className="btn-primary w-full disabled:opacity-60"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Heart className="h-4 w-4" />
                )}
                {loading
                  ? t.processing
                  : `${t.donate} · ${centsToHkd(Math.round(amountHkd * 100))}`}
              </button>
            </div>

            {manualResult && (
              <div className="mt-6 rounded-2xl border border-dashed border-[var(--color-primary)] bg-[var(--color-primary-highlight)] p-4 text-sm">
                <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold text-[var(--color-panel)]">
                  <ReceiptText className="h-5 w-5 text-[var(--color-primary)]" /> {t.manualTitle}
                </h2>
                <div className="space-y-2 text-[var(--color-text)]">
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-[var(--color-primary)]" />
                    {manualResult.instructions.payableTo}
                  </div>
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-[var(--color-primary)]" />
                    {manualResult.instructions.identifier}
                  </div>
                  <div className="flex items-center gap-2 font-bold">
                    <Check className="h-4 w-4 text-[var(--color-success)]" />
                    {t.reference}: {manualResult.reference}
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>
      </section>

      <section className="bg-[var(--color-surface)]">
        <div className="container-wide py-10 lg:py-14">
          <div className="max-w-3xl">
            <h2 className="font-display text-2xl font-bold text-[var(--color-panel)] lg:text-3xl">
              💍 Share the Love – 婚宴回禮計劃
            </h2>
            <p className="mt-3 max-w-[60ch] text-sm leading-7 text-[var(--color-text-muted)]">
              以婚禮分享愛心，賓客祝福化作救援能量。填寫表格，我們會與您聯絡安排感謝證書及小卡。
            </p>
            {primaryWedding?.document.fileUrl ? (
              <div className="mt-6 flex flex-wrap items-center gap-4">
                <a
                  href={primaryWedding.document.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary min-h-11"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  下載表格 / Download Form
                </a>
                {alternateWedding?.document.fileUrl ? (
                  <a
                    href={alternateWedding.document.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-[var(--color-primary)] underline underline-offset-4"
                  >
                    {alternateWedding.language === "en" ? "English form" : "中文表格"}
                  </a>
                ) : null}
              </div>
            ) : (
              <p className="mt-5 text-sm text-[var(--color-text-muted)]">表格暫時未能提供。</p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
