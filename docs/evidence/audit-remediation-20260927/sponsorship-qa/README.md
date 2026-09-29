# Synthetic mobile sponsorship check

`node scripts/verify-sponsorship-commitment-mobile.mjs` ran against the built app on loopback `127.0.0.1:5184`, viewport 390×844. A route mock returned a synthetic published-terms object and synthetic 400/409 responses; no approved content, provider, email, Storage upload, or database write was used.

- `payment-choice-overflow-before.png`: red browser check, 390px viewport widened to 573px by the full SHA-256 string.
- `payment-choice-mobile.png`: after fix, 390px wide, explicit later/proof radios, total monthly summary and synthetic terms link.
- `proof-errors-mobile.png`: proof amount/date/file validation before upload, with top error summary and invalid-field associations.

Assertions: later selected initially, keyboard Space selects proof radio, incomplete proof causes zero submissions, 400 field error preserves name, stale-terms 409 clears consent while preserving name. Script exit 0. The successful real submission and actual approved terms PDF remain not-run.

Comparable earlier 390×844 screenshot: `../draft-qa/sponsor-before-mobile.png` from the T09 branch; these are synthetic local builds at the same viewport, not production captures.

Known visual follow-up: the pre-existing floating shortlist bar covers part of the contact fields at this viewport; address in T24 usability work.
