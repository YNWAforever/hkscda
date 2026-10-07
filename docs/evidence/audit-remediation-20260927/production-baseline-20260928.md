# Production alias and main baseline, 2026-09-28 HKT

Read-only metadata recheck; no deployment, alias change or production data mutation was made.

| Evidence | Observed result |
|---|---|
| git fetch origin main; git rev-parse origin/main | exit 0; f8d5e5d5840d1775efb7d7f4ae2768f6557096b5 |
| gh run list --branch main --limit 1 | CI 36258190910, completed success at that SHA; earlier job inspection found five successful gates |
| vercel inspect hkscda.vercel.app --format=json --non-interactive | exit 0; READY deployment dpl_Ggm7uaMZXqFFw7yqZyE7z8D3zg5m; target hkscda-lr8sfg866-ynwaforevers-projects.vercel.app |
| gh api GitHub Production deployment 6681812673 and statuses | exit 0; SHA f8d5e5d5840d1775efb7d7f4ae2768f6557096b5, success, environment_url matches the Vercel alias target exactly |
| vercel inspect text | target production, server function reported iad1 |

The alias target match is the basis for the observed production SHA. Vercel CLI's compact JSON inspect response does not itself include git commit fields. No claim is made about current production schema health from this metadata check. The local remediation integration source 72d0fda625791d974cd1fcd3d565360766b93bd8 has not been deployed.
