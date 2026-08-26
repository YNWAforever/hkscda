import { Link } from "@tanstack/react-router";
import { Loader2, ReceiptText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { centsToHkd } from "../../../lib/donations/domain";
import {
  SPONSORSHIP_PLEDGE_DRAFT_STORAGE_KEY,
  parseDraft,
  serializeDraft,
} from "../../../lib/sponsorship/draft";
import { SPONSORSHIP_TIER_AMOUNTS_CENTS } from "../../../lib/sponsorship/schemas";
import { TurnstileWidget, turnstileEnabled } from "../TurnstileWidget";
import { useShortlist } from "../ShortlistContext";

type Language = "zh-HK" | "en";
type MonthlyTier = "100" | "300" | "500" | "custom";
type PaymentMethod = "fps" | "bank_transfer" | "payme" | "paypal" | "give_asia";

const copy = {
  "zh-HK": {
    empty: "您尚未選擇任何助養動物。",
    backToSponsors: "返回助養區",
    tierTitle: "每月助養金額",
    customAmount: "自訂金額",
    contactTitle: "聯絡資料",
    name: "姓名",
    email: "電郵",
    phone: "電話（選填）",
    proofTitle: "付款證明（選填，可稍後補交）",
    proofSkip: "我將稍後透過電郵中的付款方式完成付款",
    method: "付款方式",
    reference: "付款參考",
    amount: "付款金額",
    date: "付款日期",
    notes: "備註（選填）",
    emailConsent: "我同意以電郵接收助養確認及通知",
    whatsappConsent: "我同意以 WhatsApp 接收助養相關通知",
    submit: "確認助養承諾",
    processing: "處理中",
    verifyRequired: "請先完成人機驗證",
    submitError: "暫時未能建立助養承諾，請稍後再試。",
    successTitle: "多謝您的助養承諾！",
    successRef: "參考編號",
  },
  en: {
    empty: "You have not selected any sponsor animals yet.",
    backToSponsors: "Back to sponsorship",
    tierTitle: "Monthly sponsorship amount",
    customAmount: "Custom amount",
    contactTitle: "Contact details",
    name: "Name",
    email: "Email",
    phone: "Phone (optional)",
    proofTitle: "Payment proof (optional, can be provided later)",
    proofSkip: "I will pay later using the methods in the confirmation email",
    method: "Payment method",
    reference: "Payment reference",
    amount: "Payment amount",
    date: "Payment date",
    notes: "Notes (optional)",
    emailConsent: "I agree to receive sponsorship confirmation and updates by email",
    whatsappConsent: "I agree to receive sponsorship updates by WhatsApp",
    submit: "Confirm sponsorship pledge",
    processing: "Processing",
    verifyRequired: "Please complete the verification first.",
    submitError: "Sponsorship pledge could not be created. Please try again later.",
    successTitle: "Thank you for your sponsorship pledge!",
    successRef: "Reference",
  },
} satisfies Record<Language, Record<string, string>>;

const tiers: MonthlyTier[] = ["100", "300", "500", "custom"];
const paymentMethods: { value: PaymentMethod; zh: string; en: string }[] = [
  { value: "fps", zh: "轉數快 FPS", en: "FPS" },
  { value: "bank_transfer", zh: "銀行轉帳", en: "Bank Transfer" },
  { value: "payme", zh: "PayMe", en: "PayMe" },
  { value: "paypal", zh: "PayPal", en: "PayPal" },
  { value: "give_asia", zh: "Give.asia", en: "Give.asia" },
];

type SubmitResult = { pledgeId: string; reference: string };

export function PledgeWizard() {
  const { items, clearIntent } = useShortlist();
  const sponsorshipItems = useMemo(
    () =>
      [...items]
        .filter((item) => item.intent === "sponsorship")
        .sort((left, right) => left.rank - right.rank),
    [items],
  );

  const [language, setLanguage] = useState<Language>("zh-HK");
  const t = copy[language];

  const [monthlyTier, setMonthlyTier] = useState<MonthlyTier>("300");
  const [customAmount, setCustomAmount] = useState("");
  const [supporterName, setSupporterName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    try {
      const draft = parseDraft(window.localStorage.getItem(SPONSORSHIP_PLEDGE_DRAFT_STORAGE_KEY));
      setMonthlyTier((draft.monthlyTier as MonthlyTier) ?? "300");
      setCustomAmount((draft.customAmount as string) ?? "");
      setSupporterName((draft.supporterName as string) ?? "");
      setEmail((draft.email as string) ?? "");
      setPhone((draft.phone as string) ?? "");
      setNotes((draft.notes as string) ?? "");
    } catch {
      // Keep the server-rendered defaults when storage is unavailable or invalid.
    }
  }, []);
  const [emailConsent, setEmailConsent] = useState(true);
  const [whatsappConsent, setWhatsappConsent] = useState(false);
  const [includeProof, setIncludeProof] = useState(false);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofMethod, setProofMethod] = useState<PaymentMethod>("fps");
  const [proofReference, setProofReference] = useState("");
  const [proofAmount, setProofAmount] = useState("");
  const [proofDate, setProofDate] = useState("");
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);

  function saveDraft() {
    try {
      window.localStorage.setItem(
        SPONSORSHIP_PLEDGE_DRAFT_STORAGE_KEY,
        serializeDraft({ monthlyTier, customAmount, supporterName, email, phone, notes }),
      );
    } catch {
      // Draft persistence is best-effort; submission still proceeds.
    }
  }

  const amountCents =
    monthlyTier === "custom"
      ? Math.round((Number(customAmount) || 0) * 100)
      : SPONSORSHIP_TIER_AMOUNTS_CENTS[monthlyTier];

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    saveDraft();

    if (turnstileEnabled && !turnstileToken) {
      setError(t.verifyRequired);
      return;
    }

    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        language,
        monthlyTier,
        animalPreferences: sponsorshipItems.map((item) => ({
          rank: item.rank,
          animalId: item.id,
          animalName: item.name,
          animalType: "sponsor",
        })),
        contact: { supporterName, email, phone: phone || undefined },
        consents: { email: emailConsent, whatsapp: whatsappConsent },
        notes: notes || undefined,
        terms: { agreed: true },
        turnstileToken,
      };
      if (monthlyTier === "custom") payload.customAmountCents = amountCents;
      if (includeProof && proofFile) {
        payload.proofMetadata = {
          paymentMethod: proofMethod,
          reference: proofReference || undefined,
          amountCents: Math.round((Number(proofAmount) || 0) * 100),
          paymentDate: proofDate,
        };
      }

      const formData = new FormData();
      formData.set("payload", JSON.stringify(payload));
      if (includeProof && proofFile) formData.set("proof", proofFile);

      const response = await fetch("/api/sponsorships/pledges", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Sponsorship pledge request failed");
      const data = (await response.json()) as SubmitResult;

      try {
        window.localStorage.removeItem(SPONSORSHIP_PLEDGE_DRAFT_STORAGE_KEY);
      } catch {
        // Ignore draft cleanup failure; the pledge already succeeded.
      }
      clearIntent("sponsorship");
      setResult(data);
    } catch (submitError) {
      console.error(submitError);
      setError(t.submitError);
    } finally {
      setLoading(false);
    }
  }

  if (sponsorshipItems.length === 0 && !result) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-[var(--color-panel)]">{t.empty}</h1>
        <Link to="/sponsors" className="text-[var(--color-primary)] hover:underline">
          ← {t.backToSponsors}
        </Link>
      </main>
    );
  }

  if (result) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
        <ReceiptText className="h-10 w-10 mx-auto text-[var(--color-primary)]" />
        <h1 className="font-display text-2xl font-bold">{t.successTitle}</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          {t.successRef}: <strong>{result.reference}</strong>
        </p>
        <Link to="/sponsors" className="text-[var(--color-primary)] hover:underline">
          ← {t.backToSponsors}
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-soft"
      >
        <div className="flex justify-end">
          <div className="inline-flex rounded-full border border-[var(--color-border)] p-1 text-xs font-bold">
            {(["zh-HK", "en"] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                aria-pressed={language === lang}
                onClick={() => setLanguage(lang)}
                className={`rounded-full px-3 py-1.5 ${
                  language === lang
                    ? "bg-[var(--color-primary)] text-white"
                    : "text-[var(--color-text-muted)]"
                }`}
              >
                {lang === "zh-HK" ? "繁" : "EN"}
              </button>
            ))}
          </div>
        </div>

        <ul className="space-y-2">
          {sponsorshipItems.map((item) => (
            <li key={item.id} className="text-sm text-[var(--color-panel)]">
              {item.rank}. {item.name}
            </li>
          ))}
        </ul>

        <fieldset className="space-y-3">
          <legend className="text-sm font-bold">{t.tierTitle}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {tiers.map((tier) => (
              <button
                key={tier}
                type="button"
                aria-pressed={monthlyTier === tier}
                onClick={() => setMonthlyTier(tier)}
                className={`rounded-full border px-4 py-3 text-sm font-bold ${
                  monthlyTier === tier
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                    : "border-[var(--color-border)] bg-white"
                }`}
              >
                {tier === "custom" ? t.customAmount : `HK$${tier}`}
              </button>
            ))}
          </div>
          {monthlyTier === "custom" && (
            <input
              id="pledge-custom-amount"
              aria-invalid={false}
              aria-describedby={undefined}
              aria-label={t.customAmount}
              type="number"
              min="10"
              value={customAmount}
              onChange={(event) => setCustomAmount(event.target.value)}
              className="min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm"
              placeholder="HK$"
            />
          )}
          <p className="text-xs text-[var(--color-text-muted)]">{centsToHkd(amountCents)}/month</p>
        </fieldset>

        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="col-span-full text-sm font-bold">{t.contactTitle}</legend>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-[var(--color-text-muted)]">
              {t.name}
            </span>
            <input
              id="pledge-supporter-name"
              aria-invalid={false}
              aria-describedby={undefined}
              required
              value={supporterName}
              onChange={(event) => setSupporterName(event.target.value)}
              className="min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-[var(--color-text-muted)]">
              {t.email}
            </span>
            <input
              id="pledge-email"
              aria-invalid={false}
              aria-describedby={undefined}
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs font-bold text-[var(--color-text-muted)]">
              {t.phone}
            </span>
            <input
              id="pledge-phone"
              aria-invalid={false}
              aria-describedby={undefined}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm"
            />
          </label>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-bold">{t.proofTitle}</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              id="pledge-include-proof"
              aria-invalid={false}
              aria-describedby={undefined}
              type="checkbox"
              checked={includeProof}
              onChange={(event) => setIncludeProof(event.target.checked)}
              className="h-4 w-4 accent-[var(--color-primary)]"
            />
            {includeProof ? t.proofTitle : t.proofSkip}
          </label>
          {includeProof && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs font-bold text-[var(--color-text-muted)]">
                  {t.method}
                </span>
                <select
                  id="pledge-proof-method"
                  aria-invalid={false}
                  aria-describedby={undefined}
                  value={proofMethod}
                  onChange={(event) => setProofMethod(event.target.value as PaymentMethod)}
                  className="min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm"
                >
                  {paymentMethods.map((m) => (
                    <option key={m.value} value={m.value}>
                      {language === "zh-HK" ? m.zh : m.en}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-[var(--color-text-muted)]">
                  {t.reference}
                </span>
                <input
                  id="pledge-proof-reference"
                  aria-invalid={false}
                  aria-describedby={undefined}
                  value={proofReference}
                  onChange={(event) => setProofReference(event.target.value)}
                  className="min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-[var(--color-text-muted)]">
                  {t.amount}
                </span>
                <input
                  id="pledge-proof-amount"
                  aria-invalid={false}
                  aria-describedby={undefined}
                  type="number"
                  min="1"
                  value={proofAmount}
                  onChange={(event) => setProofAmount(event.target.value)}
                  className="min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-[var(--color-text-muted)]">
                  {t.date}
                </span>
                <input
                  id="pledge-proof-date"
                  aria-invalid={false}
                  aria-describedby={undefined}
                  type="date"
                  value={proofDate}
                  onChange={(event) => setProofDate(event.target.value)}
                  className="min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs font-bold text-[var(--color-text-muted)]">
                  Proof image / PDF
                </span>
                <input
                  id="pledge-proof-file"
                  aria-invalid={false}
                  aria-describedby={undefined}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(event) => setProofFile(event.target.files?.[0] ?? null)}
                  className="w-full text-sm"
                />
              </label>
            </div>
          )}
        </fieldset>

        <label className="block">
          <span className="mb-1 block text-xs font-bold text-[var(--color-text-muted)]">
            {t.notes}
          </span>
          <textarea
            id="pledge-notes"
            aria-invalid={false}
            aria-describedby={undefined}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm"
            rows={2}
          />
        </label>

        <fieldset className="space-y-3 rounded-md bg-[var(--color-surface-offset)] p-4">
          <legend className="text-sm font-bold">Consent and terms</legend>
          <label className="flex items-start gap-3 text-sm">
            <input
              id="pledge-email-consent"
              aria-invalid={false}
              aria-describedby={undefined}
              type="checkbox"
              checked={emailConsent}
              onChange={(event) => setEmailConsent(event.target.checked)}
              className="mt-1 h-4 w-4 accent-[var(--color-primary)]"
            />
            <span>{t.emailConsent}</span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input
              id="pledge-whatsapp-consent"
              aria-invalid={false}
              aria-describedby={undefined}
              type="checkbox"
              checked={whatsappConsent}
              onChange={(event) => setWhatsappConsent(event.target.checked)}
              className="mt-1 h-4 w-4 accent-[var(--color-primary)]"
            />
            <span>{t.whatsappConsent}</span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input
              id="pledge-terms"
              aria-invalid={false}
              aria-describedby={undefined}
              required
              type="checkbox"
              checked={termsAgreed}
              onChange={(event) => setTermsAgreed(event.target.checked)}
              className="mt-1 h-4 w-4 accent-[var(--color-primary)]"
            />
            <span>{language === "zh-HK" ? "我同意條款及細則" : "I agree to the terms"}</span>
          </label>
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
          disabled={loading || !termsAgreed || (turnstileEnabled && !turnstileToken)}
          className="btn-primary w-full disabled:opacity-60"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? t.processing : t.submit}
        </button>
      </form>
    </main>
  );
}
