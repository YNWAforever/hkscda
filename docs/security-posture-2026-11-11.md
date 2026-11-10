# Repository security posture — 2026-11-11

The audit follow-through so far hardened the application. This note records the repository- and
supply-chain-level changes made on 2026-11-11, plus the dependency-audit triage and what is
deliberately accepted.

## GitHub security features (enabled 2026-11-11)

| Feature                         | State   | Notes                                                                                                                                            |
| ------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Secret scanning                 | enabled | Was disabled for the whole repository; turning it on immediately surfaced one pre-existing alert (triaged below).                                |
| Secret scanning push protection | enabled | Blocks a push that contains a recognised secret pattern.                                                                                         |
| Dependabot alerts               | enabled | 0 open. GitHub's ecosystem detection is npm-centric; this repository uses `bun.lock`, so `bun audit` remains the authoritative dependency check. |
| Dependabot security updates     | enabled | Automated fix PRs where the ecosystem is recognised.                                                                                             |
| CodeQL default setup            | enabled | `state: configured`, default query suite; the first scan runs on the next push/PR and results appear under Security → Code scanning.             |
| Private vulnerability reporting | enabled | `SECURITY.md` points reporters at the private "Report a vulnerability" flow.                                                                     |

Verified with:

```sh
gh api repos/YNWAforever/hkscda --jq '.security_and_analysis'
gh api repos/YNWAforever/hkscda/code-scanning/default-setup --jq '{state,query_suite}'
gh api 'repos/YNWAforever/hkscda/secret-scanning/alerts?state=open' --jq 'length'
```

Not enabled: secret-scanning non-provider patterns and validity checks (GitHub Advanced Security
features). The public repository does not need them.

### Secret-scanning alert triage

Alert #1 (detected 2026-10-03, only visible once scanning was enabled on 2026-11-11) matched a
`supabase_secret_key` in two audit evidence blobs:

- `docs/evidence/audit-remediation-20260927/r01-forward/task-11-receipts/blobs/43047450…source`
- `docs/evidence/audit-remediation-20260927/r01-forward/task-12-receipts/blobs/43047450…source`

Both blobs are captured **Supabase CLI source** (`package config`): the matched value is the CLI's
documented local-development default (`defaultSecretKey`, next to `defaultJwtSecret` and
`defaultPublishableKey`), not a credential for this project. Checked on 2026-11-11:

- Using the value against the production project returns **HTTP 401**;
- The project's active secret key has a different prefix (not in the repository);
- No production key appears anywhere in the repository history.

Resolution recorded on the alert: `used_in_tests` (it is a local-test default captured in evidence),
with that reasoning in the alert comment; **0 open secret-scanning alerts** remain. No rotation was
needed because no live credential was exposed. The rule going forward: evidence captures may contain
provider _documentation/source defaults_ but never a dump of a real project's `.env`.

## CI supply-chain hardening

`.github/workflows/ci.yml` changes:

- **Least privilege:** top-level `permissions: contents: read` (previously unset, so the jobs inherited
  the repository's default workflow token permissions).
- **Pinned actions:** every one of the 17 `uses:` references is pinned to a full commit SHA, with the
  human-readable version in a trailing comment:

  | Action                    | Pin                                        | Version    |
  | ------------------------- | ------------------------------------------ | ---------- |
  | `actions/checkout`        | `11d5960a326750d5838078e36cf38b85af677262` | v4         |
  | `oven-sh/setup-bun`       | `0c5077e51419868618aeaa5fe8019c62421857d6` | v2 (2.2.0) |
  | `actions/setup-node`      | `949feb2413d6458794dcd2491c4babbbce0c15c1` | v7         |
  | `actions/upload-artifact` | `ea165f8d65b6e75b540449e92b4886f43607fa02` | v4         |

To bump a pin: resolve the tag to its commit (`gh api repos/<owner>/<action>/git/ref/tags/vN`, then
dereference the annotated tag via `/git/tags/<sha>`), replace every occurrence, and let CI run the
new pin. Dependabot does not update SHA pins for workflow refs, so review pins when an action
publishes a security release.

## Dependency audit triage — `bun audit`, 2026-11-11

`bun audit` reports **33 advisories (22 high, 8 moderate, 3 low)**. All of them are in build, lint or
end-to-end tooling transitives — none is on a production runtime path that processes untrusted input:

| Package                                                                    | Advisories        | Reached through                                                                    | Assessment                                                                                                                                                                |
| -------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `browserslist`, `baseline-browser-mapping`, `@babel/core`                  | high/moderate/low | Vite / Babel / TanStack plugin build                                               | Build-time only. No untrusted input. Fixed when the parent toolchain updates.                                                                                             |
| `brace-expansion`, `minimatch`                                             | high/moderate     | eslint / typescript-eslint                                                         | Lint-time only.                                                                                                                                                           |
| `nanoid`, `postcss`, `source-map-js`, `postcss-selector-parser`, `esbuild` | high/moderate/low | vite / tailwind / tsx / unplugin                                                   | Build and local dev (`esbuild` defect is a Windows dev-server file read).                                                                                                 |
| `js-yaml`                                                                  | high/moderate     | eslint config loader, `xmlbuilder2` in the start plugin                            | Build-time; production does not parse untrusted YAML with it.                                                                                                             |
| `zod` `<4.6.6`                                                             | high              | nested copies under `@tanstack/router-generator` and `chromium-bidi` (e2e tooling) | The app's direct dependency is **4.6.6** (the fixed line, PR #241) and is what validates untrusted input in production; the flagged copies are dependency-pinned tooling. |

A `bun update` (compatible-range) pass was attempted and **reverted**: it rewrote the declared ranges
of 50+ direct packages and only moved the audit from 33 to 31 because the flagged copies are pinned by
their parents' ranges. That is a large, security-irrelevant dependency refresh with real regression
risk; it belongs in a deliberate upgrade project, not this hardening batch.

Mitigations that bound the accepted risk:

- CI installs with `--frozen-lockfile` and the toolchain is pinned (`.bun-version`);
- `bunfig.toml` holds every package back 24 h (`minimumReleaseAge`) as a supply-chain guard;
- these packages never parse attacker-controlled input in production (they run at build/lint/e2e
  time on repository content, not on request data);
- Dependabot alerts are now enabled, and `bun audit` is the authoritative re-check.

Re-run `bun audit` after toolchain updates; revisit the table if any advisory becomes reachable from
the server runtime.

## Residual items (tracked elsewhere)

- `style-src 'unsafe-inline'` removal: inline-style inventory (12 components, 22 style objects, plus
  shadcn `chart.tsx`/`sidebar.tsx` and the error page's inline `<style>`) and the nonce plan are in
  [`csp-token-decision.md`](csp-token-decision.md).
- Leaked-password protection (HIBP) is Supabase-Pro gated; see
  [`database-advisors-2026-11-10.md`](database-advisors-2026-11-10.md).
- Trusted Types Report-Only report review → enforcement; see
  [`csp-token-decision.md`](csp-token-decision.md).
- `hkscda.com` cutover remains an owner decision (`audit-20261109/CUTOVER-DECISION-2026-11-09.md`).
