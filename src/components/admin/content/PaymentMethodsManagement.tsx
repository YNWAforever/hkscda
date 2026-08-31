import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "../../ui/button";
import { adminIdentityQueryOptions } from "../../../lib/admin/identity";
import type { AdminIdentity } from "../../../lib/admin/access";
import type { PaymentPublicConfig } from "../../../lib/paymentPublicConfig/types";
import {
  canPublish,
  createPaymentMethodPublishAttempt,
  fetchPaymentMethodConfigs,
  mutatePaymentMethodConfig,
  resolveMutationError,
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
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">付款方式設定</h1>
      {errorMessage ? (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}

      <ul className="divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)]">
        {configs.map((config) => (
          <li key={config.id} className="flex items-center justify-between gap-4 p-3">
            <div>
              <span className="font-bold">{config.displayLabelZh}</span>{" "}
              <span className="text-[var(--color-text-muted)]">({config.method})</span>{" "}
              <span className="text-xs uppercase text-[var(--color-text-muted)]">
                {config.state}
              </span>
              {config.isPubliclyVisible ? null : (
                <span className="ml-2 text-xs text-[var(--color-text-muted)]">未公開</span>
              )}
            </div>
            <div className="flex gap-2">
              {config.state === "draft" ? (
                <Button type="button" onClick={() => onSubmit(config)} disabled={pending}>
                  提交審批
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
                    撤回
                  </Button>
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
                    title={
                      config.submittedBy === identity.id
                        ? "需要由另一位財務或管理員核准"
                        : undefined
                    }
                  >
                    核准並發佈
                  </Button>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PaymentMethodsManagement() {
  const queryClient = useQueryClient();
  const identityQuery = useQuery(adminIdentityQueryOptions());
  const listQuery = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => fetchPaymentMethodConfigs({ pageSize: 50 }),
  });
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);

  const configs = listQuery.data?.items ?? [];
  const queryErrorMessage =
    listQuery.error || identityQuery.error
      ? "Unable to load payment method configurations. Please reload the page."
      : undefined;

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  }

  async function handleSubmit(config: PaymentPublicConfig) {
    setPending(true);
    try {
      await mutatePaymentMethodConfig(config.id, "submit", { expectedVersion: config.version });
      setErrorMessage(undefined);
      await refresh();
    } catch (error) {
      setErrorMessage(resolveMutationError(error, config).message);
    } finally {
      setPending(false);
    }
  }

  async function handlePublish(config: PaymentPublicConfig) {
    setPending(true);
    try {
      const attempt = createPaymentMethodPublishAttempt(config.version);
      await mutatePaymentMethodConfig(config.id, "publish", attempt.payload);
      setErrorMessage(undefined);
      await refresh();
    } catch (error) {
      setErrorMessage(resolveMutationError(error, config).message);
    } finally {
      setPending(false);
    }
  }

  async function handleWithdraw(config: PaymentPublicConfig) {
    setPending(true);
    try {
      await mutatePaymentMethodConfig(config.id, "withdraw", { expectedVersion: config.version });
      setErrorMessage(undefined);
      await refresh();
    } catch (error) {
      setErrorMessage(resolveMutationError(error, config).message);
    } finally {
      setPending(false);
    }
  }

  if (listQuery.isLoading || identityQuery.isLoading) {
    return <p>載入付款方式設定中...</p>;
  }

  return (
    <PaymentMethodsManagementView
      identity={identityQuery.data?.admin}
      configs={configs}
      errorMessage={errorMessage ?? queryErrorMessage}
      pending={pending}
      onSubmit={handleSubmit}
      onWithdraw={handleWithdraw}
      onPublish={handlePublish}
    />
  );
}
