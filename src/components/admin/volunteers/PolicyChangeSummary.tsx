import { useAdminCopy } from "../i18n/copy";
import { policyChangeCopy, type PolicyLookups } from "./policyChangeCopy";
import { describePolicyValue, lastKeyOf } from "./policyChangeDisplay";
import { policyChanges } from "./policyChanges";

/**
 * What differs between two versions of a policy. `lookups` names the venues and qualifications the
 * policy refers to by key, so English shows their names instead of their keys.
 */
export function PolicyChangeSummary({
  before,
  after,
  lookups,
}: {
  before: unknown;
  after: unknown;
  lookups?: PolicyLookups;
}) {
  const copy = useAdminCopy(policyChangeCopy);
  const changes = policyChanges(before ?? {}, after);
  return (
    <section className="mt-4 space-y-3" aria-label={copy.sectionLabel}>
      <h3 className="font-bold">{copy.title(changes.length)}</h3>
      {changes.length === 0 ? (
        <p>{copy.unchanged}</p>
      ) : (
        <div className="space-y-2">
          {changes.map((c) => (
            <div
              key={c.path}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
            >
              <h4 className="mb-2 font-semibold">{copy.pathTitle(c.path)}</h4>
              <dl className="grid gap-3 md:grid-cols-2">
                <div className="min-w-0">
                  <dt className="text-xs text-[var(--color-text-muted)]">{copy.before}</dt>
                  <dd className="break-words text-sm">
                    {describePolicyValue(c.before, copy, lookups, lastKeyOf(c.path))}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-[var(--color-primary)]">{copy.after}</dt>
                  <dd className="break-words text-sm">
                    {describePolicyValue(c.after, copy, lookups, lastKeyOf(c.path))}
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
