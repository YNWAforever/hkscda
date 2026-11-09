# Branch archive — 2026-11-10

## Why

`main` was carrying 15 long-lived branches. Thirteen of them were heads of **already-merged PRs**
(squash-merged, so their tips are not ancestors of `main`); two never had a PR. To keep the
repository navigable without discarding work, every branch tip was preserved as an annotated ref
under `refs/tags/archive/2026-11-10/…` and the branches were deleted.

## Archived branches

| Branch                                        | Archive tag                                                      | Tip        | PR                                                           |
| --------------------------------------------- | ---------------------------------------------------------------- | ---------- | ------------------------------------------------------------ |
| `claude/session-development-c8b184`           | `archive/2026-11-10/claude-session-development-c8b184`           | `67837c50` | #115 merged                                                  |
| `codex/audit-integration-base-20260928`       | `archive/2026-11-10/codex-audit-integration-base-20260928`       | `bc4f9082` | none (audit integration base, superseded)                    |
| `codex/profile-publication-evidence-20260907` | `archive/2026-11-10/codex-profile-publication-evidence-20260907` | `a563253b` | #111 merged                                                  |
| `codex/story-promotion-center`                | `archive/2026-11-10/codex-story-promotion-center`                | `a8b05af7` | #32 merged                                                   |
| `docs/public-route-design-port`               | `archive/2026-11-10/docs-public-route-design-port`               | `53cb9560` | none (docs design port, superseded by shipped public routes) |
| `docs/public-route-port-group1-impl`          | `archive/2026-11-10/docs-public-route-port-group1-impl`          | `0d8709cd` | #76 merged                                                   |
| `docs/public-route-port-group2-impl`          | `archive/2026-11-10/docs-public-route-port-group2-impl`          | `81350cee` | #77 merged                                                   |
| `docs/public-route-port-group3-impl`          | `archive/2026-11-10/docs-public-route-port-group3-impl`          | `391901bf` | #78 merged                                                   |
| `feat/hkscda-animal-photo-backfill`           | `archive/2026-11-10/feat-hkscda-animal-photo-backfill`           | `b838680d` | #123 merged                                                  |
| `feat/hkscda-phase3-sponsorship`              | `archive/2026-11-10/feat-hkscda-phase3-sponsorship`              | `7a2604ad` | #114 merged                                                  |
| `feat/hkscda-six-phase-revision`              | `archive/2026-11-10/feat-hkscda-six-phase-revision`              | `b8c5c68c` | #112 merged                                                  |
| `feat/sponsorship-status-page`                | `archive/2026-11-10/feat-sponsorship-status-page`                | `da26f77c` | #25 merged                                                   |
| `feat/story-promotion-completion`             | `archive/2026-11-10/feat-story-promotion-completion`             | `14c7f485` | #124 merged                                                  |
| `feat/story-promotion-ws3-public`             | `archive/2026-11-10/feat-story-promotion-ws3-public`             | `2efa20a9` | #127 merged                                                  |
| `feat/website-corrections`                    | `archive/2026-11-10/feat-website-corrections`                    | `4e86b96a` | #128 merged                                                  |

## How to recover a branch

```sh
git fetch --tags
git switch -c recover/<name> archive/2026-11-10/<slug>
```

The two branches without a PR (`codex/audit-integration-base-20260928`,
`docs/public-route-design-port`) are preserved the same way; they were integration/design bases
whose content either reached `main` through the audit merges or was superseded by the shipped
public routes. Delete the archive tags once they are no longer needed.
