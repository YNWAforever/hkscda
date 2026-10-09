import { useDebouncedValue } from "../../../lib/useDebouncedValue";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchAdminJson } from "../../../lib/admin/http";
import {
  policySourcePaths,
  type PolicySourcePath,
} from "../../../lib/volunteers/policy/sourcePaths";
import type { PolicyDraft } from "../../../lib/volunteers/policy/schemas";
import { useAdminCopy } from "../i18n/copy";
import { policySourceFieldsCopy, type SettingOrigin } from "./policySourceFieldsCopy";

const ORIGINS: readonly string[] = ["common", "shelter", "template", "inherited"];

function lookup(body: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (v, k) =>
        typeof v === "object" && v !== null ? (v as Record<string, unknown>)[k] : undefined,
      body,
    );
}
export function PolicySourceFields({
  policy,
  onChange,
}: {
  policy: PolicyDraft;
  onChange: (update: (p: PolicyDraft) => void) => void;
}) {
  const copy = useAdminCopy(policySourceFieldsCopy);
  const queryPolicy = useDebouncedValue(policy, 300);
  const result = useQuery({
    queryKey: ["volunteer-policy-effective", queryPolicy],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      fetchAdminJson<{ body: PolicyDraft; provenance: Record<string, string> }>(
        "/api/admin/volunteers/sources/",
        { method: "POST", signal, body: JSON.stringify({ action: "resolve", body: queryPolicy }) },
      ),
  });
  /** Where a setting gets its value: the layer the server says, else inherited or this template. */
  const origin = (path: string): SettingOrigin => {
    const sources = result.data?.provenance ?? {};
    const key = Object.keys(sources)
      .filter((p) => path === p || path.startsWith(p + "."))
      .sort((a, b) => b.length - a.length)[0];
    const layer = sources[key];
    if (ORIGINS.includes(layer)) return layer as SettingOrigin;
    return policy.inheritance?.some((p) => path === p || path.startsWith(p + "."))
      ? "inherited"
      : "template";
  };
  const setInherited = (path: PolicySourcePath, inherit: boolean) =>
    onChange((p) => {
      p.inheritance = inherit
        ? [...new Set([...(p.inheritance ?? []), path])]
        : (p.inheritance ?? []).filter((x) => x !== path);
      if (!inherit && result.data) {
        const parts = path.split(".");
        let target = p as unknown as Record<string, unknown>;
        for (const k of parts.slice(0, -1)) target = target[k] as Record<string, unknown>;
        const value = lookup(result.data.body, path);
        if (value !== undefined) target[parts.at(-1)!] = structuredClone(value);
      }
    });
  return (
    <details className="rounded border p-4">
      <summary className="cursor-pointer font-bold">{copy.summary}</summary>
      <p className="my-3 text-sm">
        {copy.intro}
        <a className="ml-2 underline" href="/admin/volunteers/sources">
          {copy.manage}
        </a>
      </p>
      {(queryPolicy !== policy || result.isFetching) && (
        <p role="status" className="text-sm text-muted-foreground">
          {copy.updating}
        </p>
      )}
      <div className="overflow-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th>{copy.headers.setting}</th>
              <th>{copy.headers.source}</th>
              <th>{copy.headers.value}</th>
              <th>{copy.headers.inherit}</th>
            </tr>
          </thead>
          <tbody>
            {policySourcePaths.map((path) => (
              <tr key={path} className="border-t">
                <td className="py-2">{copy.settingName(path)}</td>
                <td>{copy.origins[origin(path)]}</td>
                <td>{copy.describe(lookup(result.data?.body, path), path, {})}</td>
                <td>
                  <input
                    aria-label={copy.inheritLabel(path)}
                    type="checkbox"
                    disabled={queryPolicy !== policy || result.isFetching || !result.data}
                    checked={policy.inheritance?.includes(path) ?? false}
                    onChange={(e) => setInherited(path, e.target.checked)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.error && <p role="alert">{copy.incomplete}</p>}
    </details>
  );
}
