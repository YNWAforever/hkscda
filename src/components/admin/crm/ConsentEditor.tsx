import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";

import type { ConsentStatus } from "../../../lib/crm/types";
import { Button } from "../../ui/button";
import { Switch } from "../../ui/switch";
import { useAdminPageCopy } from "../adminPageCopy";
import { fetchAdminJson } from "./api";

type ConsentEditorProps = {
  supporterId: string;
  emailConsent: ConsentStatus | null;
  whatsappConsent: ConsentStatus | null;
};

const CONSENT_COPY = {
  zh: {
    title: "通訊同意",
    subtitle: "更新捐款人通訊的同意狀態。",
    save: "儲存",
    saveAria: "儲存通訊同意設定",
    email: "電郵",
    emailDescription: "收據更新",
    emailAria: "電郵通訊同意",
    whatsapp: "WhatsApp",
    whatsappDescription: "付款更新",
    whatsappAria: "WhatsApp 通訊同意",
  },
  en: {
    title: "Consent",
    subtitle: "Update opt-in status for supporter communications.",
    save: "Save",
    saveAria: "Save consent preferences",
    email: "Email",
    emailDescription: "Receipt updates",
    emailAria: "Email consent opt-in",
    whatsapp: "WhatsApp",
    whatsappDescription: "Payment updates",
    whatsappAria: "WhatsApp consent opt-in",
  },
} as const;

export function ConsentEditor({ supporterId, emailConsent, whatsappConsent }: ConsentEditorProps) {
  const { language } = useAdminPageCopy();
  const copy = CONSENT_COPY[language];
  const queryClient = useQueryClient();
  const [email, setEmail] = useState(emailConsent === "opt_in");
  const [whatsapp, setWhatsapp] = useState(whatsappConsent === "opt_in");

  useEffect(() => {
    setEmail(emailConsent === "opt_in");
    setWhatsapp(whatsappConsent === "opt_in");
  }, [emailConsent, whatsappConsent]);

  const mutation = useMutation({
    mutationFn: () =>
      fetchAdminJson(`/api/admin/supporters/${supporterId}/consents`, {
        method: "POST",
        body: JSON.stringify({
          source: "admin_manual",
          email,
          whatsapp,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-supporter", supporterId] });
    },
  });

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-panel)]">{copy.title}</h2>
          <p className="text-sm text-[var(--color-text-muted)]">{copy.subtitle}</p>
        </div>
        <Button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          aria-label={copy.saveAria}
        >
          <Save className="h-4 w-4" />
          {copy.save}
        </Button>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-4 rounded-md border border-[var(--color-border)] p-3">
          <span>
            <span className="block text-sm font-medium text-[var(--color-panel)]">
              {copy.email}
            </span>
            <span className="block text-xs text-[var(--color-text-muted)]">
              {copy.emailDescription}
            </span>
          </span>
          <Switch checked={email} onCheckedChange={setEmail} aria-label={copy.emailAria} />
        </label>
        <label className="flex items-center justify-between gap-4 rounded-md border border-[var(--color-border)] p-3">
          <span>
            <span className="block text-sm font-medium text-[var(--color-panel)]">
              {copy.whatsapp}
            </span>
            <span className="block text-xs text-[var(--color-text-muted)]">
              {copy.whatsappDescription}
            </span>
          </span>
          <Switch checked={whatsapp} onCheckedChange={setWhatsapp} aria-label={copy.whatsappAria} />
        </label>
      </div>
      {mutation.error && (
        <p className="mt-3 text-sm text-[var(--color-destructive)]">{mutation.error.message}</p>
      )}
    </div>
  );
}
