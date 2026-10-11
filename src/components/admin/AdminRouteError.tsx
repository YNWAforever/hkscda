import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { useEffect } from "react";

import { reportLovableError } from "../../lib/lovable-error-reporting";
import { LoadFailure } from "./LoadFailure";

/**
 * The router's error boundary on /admin. The back office keeps its own
 * bilingual failure state (LoadFailure: a reference, never the error text, and
 * a retry) instead of the public site's Chinese-only error page.
 */
export function AdminRouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_admin_error_component" });
  }, [error]);

  return (
    <div className="p-6">
      <LoadFailure
        error={error}
        onRetry={() => {
          void router.invalidate();
          reset();
        }}
      />
    </div>
  );
}
