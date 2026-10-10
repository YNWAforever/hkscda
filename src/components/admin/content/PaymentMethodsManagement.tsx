import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "../../ui/button";
import { adminIdentityQueryOptions } from "../../../lib/admin/pageAccess";
import type { AdminIdentity } from "../../../lib/admin/access";
import type { PaymentPublicConfig } from "../../../lib/paymentPublicConfig/types";
import { useAdminLanguage } from "../adminI18n";
import { useAdminCopy } from "../i18n/copy";
import { localizedText } from "../i18n/localizedText";
import { LoadFailure } from "../LoadFailure";
import { cmsStateCopy } from "./cmsStateCopy";
import { paymentMethodsCopy } from "./paymentMethodsCopy";
import {
  canPublish,
  createPaymentMethodPublishAttempt,
  fetchPaymentMethodConfigs,
  mutatePaymentMethodConfig,
  paymentMethodSaveFailure,
  paymentMethodSaveFailureText,
  type PaymentMethodSaveFailure,
} from "./paymentMethodsLogic";

const QUERY_KEY = ["payment-methods"] as const;

export function PaymentMethodsManagementView({
  identity,
  configs,
  errorMessage,
  pending,
  onSubmit,
  onWithdraw,
  onPublish,
}: {
  identity: AdminIdentity | undefined;
  configs: PaymentPublicConfig[];
  errorMessage?: string;
  pending: boolean;
  onSubmit: (config: PaymentPublicConfig) => void;
  onWithdraw: (config: PaymentPublicConfig) => void;
  onPublish: (config: PaymentPublicConfig) => void;
}) {
  const copy = useAdminCopy(paymentMethodsCopy);
  const states = useAdminCopy(cmsStateCopy);
  const { language } = useAdminLanguage();
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">{copy.title}</h1>
      {errorMessage ? (
        <p
          role="alert"
          className="rounded-md bg-[var(--color-error-highlight)] p-3 text-sm text-[var(--color-error)]"
        >
          {errorMessage}
        </p>
      ) : null}

      {configs.length === 0 ? (
        <p className="p-3 text-sm text-[var(--color-text-muted)]">{copy.empty}</p>
      ) : null}
      <ul className="divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)]">
        {configs.map((config) => {
          const blockedBySameActor =
            config.state === "in_review" && identity != null && config.submittedBy === identity.id;
          const publishHintId = `publish-hint-${config.id}`;
          return (
            <li key={config.id} className="flex items-center justify-between gap-4 p-3">
              <div>
                <span className="font-bold">
                  {localizedText(config.displayLabelZh, config.displayLabelEn, language)}
                </span>{" "}
                <span className="text-[var(--color-text-muted)]">
                  ({copy.method(config.method)})
                </span>{" "}
                <span className="text-xs text-[var(--color-text-muted)]">
                  {states[config.state]}
                </span>
                {config.isPubliclyVisible ? null : (
                  <span className="ml-2 text-xs text-[var(--color-text-muted)]">
                    {copy.notPublic}
                  </span>
                )}
              </div>
              <div className="flex items-start gap-2">
                {config.state === "draft" ? (
                  <Button type="button" onClick={() => onSubmit(config)} disabled={pending}>
                    {copy.submit}
                  </Button>
                ) : null}
                {config.state === "in_review" && identity ? (
                  <>
                    <Button
                      type="button"
                      onClick={() => onWithdraw(config)}
                      variant="outline"
                      disabled={pending}
                    >
                      {copy.withdraw}
                    </Button>
                    <div className="flex flex-col items-end gap-1">
                      <Button
                        type="button"
                        onClick={() => onPublish(config)}
                        disabled={
                          pending ||
                          !canPublish({
                            config,
                            currentActorAdminUserId: identity.id,
                            currentActorRole: identity.role,
                          })
                        }
                        aria-describedby={blockedBySameActor ? publishHintId : undefined}
                      >
                        {copy.approveAndPublish}
                      </Button>
                      {blockedBySameActor ? (
                        <p id={publishHintId} className="text-xs text-[var(--color-text-muted)]">
                          {copy.needsAnotherApprover}
                        </p>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PaymentMethodsManagement() {
  const copy = useAdminCopy(paymentMethodsCopy);
  const { language } = useAdminLanguage();
  const queryClient = useQueryClient();
  const identityQuery = useQuery(adminIdentityQueryOptions());
  const listQuery = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => fetchPaymentMethodConfigs({ pageSize: 50 }),
  });
  const [failure, setFailure] = useState<PaymentMethodSaveFailure | undefined>(undefined);
  const [pending, setPending] = useState(false);

  const configs = listQuery.data?.items ?? [];
  const loadError = listQuery.error ?? identityQuery.error;
  const failureMessage = failure
    ? paymentMethodSaveFailureText(failure, copy.errors, language)
    : undefined;

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }

  async function handleSubmit(config: PaymentPublicConfig) {
    setPending(true);
    try {
      await mutatePaymentMethodConfig(config.id, "submit", { expectedVersion: config.version });
      setFailure(undefined);
      await refresh();
    } catch (error) {
      setFailure(paymentMethodSaveFailure(error));
    } finally {
      setPending(false);
    }
  }

  async function handlePublish(config: PaymentPublicConfig) {
    setPending(true);
    try {
      const attempt = createPaymentMethodPublishAttempt(config.version);
      await mutatePaymentMethodConfig(config.id, "publish", attempt.payload);
      setFailure(undefined);
      await refresh();
    } catch (error) {
      setFailure(paymentMethodSaveFailure(error));
    } finally {
      setPending(false);
    }
  }

  async function handleWithdraw(config: PaymentPublicConfig) {
    setPending(true);
    try {
      await mutatePaymentMethodConfig(config.id, "withdraw", { expectedVersion: config.version });
      setFailure(undefined);
      await refresh();
    } catch (error) {
      setFailure(paymentMethodSaveFailure(error));
    } finally {
      setPending(false);
    }
  }

  if (listQuery.isLoading || identityQuery.isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold">{copy.title}</h1>
        <p>{copy.loading}</p>
      </div>
    );
  }

  // A failed load is shown as a failure on its own: the list below it would only be empty
  // because nothing was read.
  if (loadError) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold">{copy.title}</h1>
        <LoadFailure
          error={loadError}
          onRetry={() => {
            void listQuery.refetch();
            void identityQuery.refetch();
          }}
          title={copy.errors.load_failed}
        />
      </div>
    );
  }

  return (
    <PaymentMethodsManagementView
      identity={identityQuery.data?.admin}
      configs={configs}
      errorMessage={failureMessage}
      pending={pending}
      onSubmit={handleSubmit}
      onWithdraw={handleWithdraw}
      onPublish={handlePublish}
    />
  );
}
