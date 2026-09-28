# T09 adoption wizard shortlist visibility, 2026-09-28 HKT

Focused source `958dfe9c37d34c694cbba5f4889f59ee9c57dca9` is stacked only on #140 source `225cab8a7d6a1e59d22348d85894ee89726c540b`. Both worktrees built against the same read-only synthetic PostgREST fixture served at 127.0.0.1:54329. The fixture contained only synthetic animals; neither build submitted an application, uploaded a photo or sent email. No schema, payment, production content or live account changed.

## Reproduction and fix

At 390x844 with three synthetic shortlisted cats, the parent wizard displayed a fixed global shortlist tray over the seven-step progress list. It offered no removal control inside the wizard. An SSR regression for an accessible in-wizard removal button failed first: `bun test --isolate src/components/site/adoption/WizardFields.test.tsx` exit 1, 6 pass/1 fail/23 assertions. The fix hides the redundant global tray only on `/adoption/apply` and adds a labelled, keyboard-operable remove action beside each ranked candidate. Other pages retain the tray; removing a candidate compacts the shortlist through its existing reducer.

| Synthetic browser check | Parent #140 | Focused source |
|---|---|---|
| Fixed tray on wizard, mobile and desktop | 1, obscuring progress | 0 |
| In-wizard removal controls for three candidates | 0 | 3 |
| Keyboard Enter removes candidate 02 and leaves two | not-run | pass at 390x844 and 1440x900 |
| Global tray returns on animal list | pass | pass |
| Document horizontal overflow | 0 px | 0 px |

Captured with the same Playwright 1.60.0 / Chromium 148.0.7778.96 on one Windows host at 390x844 and 1440x900. Full-page screenshots, SHA-256:

| File | SHA-256 |
|---|---|
| [Before mobile](ui/t09-before-wizard-mobile.png) | `8242d90aa77767e570a83200f6f6876609e9fe1b7dcdfd0473abc4feea75c13c` |
| [After mobile](ui/t09-after-wizard-mobile.png) | `268d700811b0fddc06d4c4ac9986ac9fb50f20649491fbd5f8388848e406c52a` |
| [Before desktop](ui/t09-before-wizard-desktop.png) | `25db648917faeeb3a0563e2f3e8c04fd66b8f4cfb94a6c2f1c1ec49ba1036192` |
| [After desktop](ui/t09-after-wizard-desktop.png) | `51bef279f5c178983161d20e38fd4e09658a1a27e3bb683876ae24b873c1125f` |

After the source fix: `bun test --isolate src/components/site/adoption/WizardFields.test.tsx src/components/site/adoption/ApplicationWizard.test.tsx src/lib/publicAdoption/shortlist.test.ts` exit 0, 26 pass/59 assertions; `bun run typecheck`, `bun run lint -- --quiet`, and fixture-backed `bun run build` each exit 0. Local browser acceptance exited 0 on all four captures. Full suite for this focused source is not-run. Remote evidence-head CI run 36408803392 at d6feedd8af38a45bcd8ed97729f54616fd81af40 passed verify, RLS matrix, brand, a11y and performance (five jobs); that fixture CI does not establish hosted actual-role UAT or the local-only combined integration. This is UI/start-of-journey proof; full seven-step submit/upload, real-role staff receipt, expired status link and email test sink remain T24 gates. Seven-day draft retention still requires HKSCDA approval. Rollback is the focused source commit only and does not affect stored applications, payment facts or schema.
